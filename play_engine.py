"""Mesin giliran game: sesi DeepSeek persisten + agent sebagai wasit.

Alur satu giliran (op=answer): validasi -> nilai lokal -> SATU panggilan AI (penilaian isian + umpan
balik + tantangan berikutnya) -> finalisasi di SQLite (bukti, XP, state). Generasi berjalan di
thread tersendiri dan menulis teks parsial ke DB; handler RPC hanya memantau DB. Karena itu browser
yang putus tidak membatalkan apa pun, dan klien dapat menyambung ulang (op=attach) atau mengulang
dengan client_key yang sama tanpa membuat giliran ganda.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import db
import llm
import play_director as D
import play_games as G
import play_prompts as PR
import play_protocol as PP
import profile as PF
import stats
from common import UserError, clamp, doc_ids, jdump, jload

log = logging.getLogger("play")

MAX_CORRECTIONS = 2
STALE_RUN_S = 6 * 3600
XP_RUN_CAP = 300
POOL = ThreadPoolExecutor(max_workers=3, thread_name_prefix="play")
_locks: dict[int, threading.RLock] = {}
_locks_guard = threading.Lock()
_stage: dict[int, list[str]] = {}      # turn_id -> tahap yang terjadi ("merapikan", "memulihkan_sesi"); dikosongkan wait()


class EngineError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


def _lock(run_id: int) -> threading.RLock:
    with _locks_guard:
        return _locks.setdefault(run_id, threading.RLock())


# ---------------------------------------------------------------- akses data
def get_run(run_id: int) -> dict:
    r = db.row("SELECT * FROM game_runs WHERE id=?", (run_id,))
    if not r:
        raise UserError("Permainan tidak ditemukan.")
    r["options"], r["state"] = jload(r["options"], {}), jload(r["state"], {})
    return r


def get_turn(turn_id: int) -> dict:
    t = db.row("SELECT * FROM game_turns WHERE id=?", (turn_id,))
    if not t:
        raise UserError("Giliran tidak ditemukan.")
    for k in ("public", "secret", "judgement", "answer", "directive"):
        t[k] = jload(t[k], None)
    t["concept_ids"] = jload(t["concept_ids"], [])
    return t


def run_public(run: dict) -> dict:
    src = {"document": "SELECT title FROM documents WHERE id=?", "subject": "SELECT name FROM subjects WHERE id=?"}
    title = "Semua materi"
    if run["scope_kind"] in src:
        title = db.scalar(src[run["scope_kind"]], (run["scope_id"],), default="") or ""
    return {"id": run["id"], "game": run["game"], "title": G.MODES[run["game"]]["title"], "scope_kind": run["scope_kind"],
            "scope_id": run["scope_id"], "scope_title": title, "status": run["status"], "turn_count": run["turn_count"],
            "max_turns": run["max_turns"], "correct": run["correct"], "total": run["total"], "xp": run["xp"],
            "state": run["state"], "options": run["options"], "started_at": run["started_at"]}


def _focus_rows(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    return db.rows(f"SELECT id, document_id, term, definition FROM concepts WHERE id IN ({','.join('?' * len(ids))})", ids)


def _scope_docs(run: dict) -> list[int]:
    k, i = run["scope_kind"], run["scope_id"]
    return doc_ids(i if k == "document" else None, i if k == "subject" else None)


def _touch(run_id: int, **cols) -> None:
    cols["updated_at"] = db.now()
    sets = ", ".join(f"{k}=?" for k in cols)
    vals = [jdump(v) if isinstance(v, (dict, list)) else v for v in cols.values()]
    db.run(f"UPDATE game_runs SET {sets} WHERE id=?", (*vals, run_id))


def _set_turn(turn_id: int, **cols) -> None:
    cols["updated_at"] = db.now()
    sets = ", ".join(f"{k}=?" for k in cols)
    vals = [jdump(v) if isinstance(v, (dict, list)) else v for v in cols.values()]
    db.run(f"UPDATE game_turns SET {sets} WHERE id=?", (*vals, turn_id))


def _new_turn(run_id: int, idx: int, status: str, *, kind: str, client_key: str | None = None,
              concept_ids=None, directive=None) -> int:
    now = db.now()
    return db.run("INSERT INTO game_turns(run_id,idx,client_key,status,kind,concept_ids,directive,created_at,updated_at) "
                  "VALUES(?,?,?,?,?,?,?,?,?)", (run_id, idx, client_key, status, kind, jdump(concept_ids or []),
                                                jdump(directive) if directive else None, now, now))


def _next_idx(run_id: int) -> int:
    return db.scalar("SELECT COALESCE(MAX(idx),0)+1 FROM game_turns WHERE run_id=?", (run_id,))


def turn_view(t: dict) -> dict:
    """Bagian giliran yang aman dikirim ke klien (tanpa secret)."""
    return {"turn_id": t["id"], "idx": t["idx"], "kind": t["kind"], "status": t["status"],
            "narration": t["narration"] or "", "public": t["public"] or {}, "hint_level": t["hint_level"],
            "error": t["error"], "retryable": t["status"] == "error"}


# ---------------------------------------------------------------- penyampaian teks parsial
class _Flusher:
    """Kumpulkan narasi dan simpan ke kolom `partial` paling sering tiap 0.3 dtk."""

    def __init__(self, turn_id: int):
        self.turn_id, self.buf, self.last = turn_id, "", 0.0

    def add(self, text: str) -> None:
        self.buf += text
        if time.time() - self.last >= 0.3:
            self.flush()

    def flush(self) -> None:
        self.last = time.time()
        try:
            db.run("UPDATE game_turns SET partial=? WHERE id=?", (self.buf, self.turn_id))
        except Exception:  # tulis parsial tidak boleh menggagalkan giliran
            log.warning("Gagal menyimpan teks parsial", exc_info=True)

    finish = flush


class _Direct:
    def __init__(self, emit):
        self.emit = emit

    def add(self, text: str) -> None:
        try:
            self.emit({"chunk": text})
        except Exception:
            pass

    def finish(self) -> None:
        pass


def _lost_session(exc: llm.LLMError) -> bool:
    return exc.status in (400, 404) and "session" in str(exc).lower()


# ---------------------------------------------------------------- percakapan dengan AI
def _converse(run_id: int, turn_id: int | None, directive: str, validate, sink, *, force_new: bool = False,
              parse: bool = True, recent: list | None = None):
    """Satu giliran percakapan. Mengembalikan (narasi, data, hasil_validasi).

    - sesi hilang / mode_fallback  -> pulihkan: kirim ulang sebagai sesi baru + ringkasan status
    - ProtocolError                -> minta AI memperbaiki (maks 2x, tanpa menayangkan ulang ke klien)
    """
    run = get_run(run_id)
    game, sid = run["game"], run["gateway_session_id"]
    attempt_new, recovered, corrections = force_new or not sid, False, 0
    next_text = directive
    silent = False
    while True:
        splitter = PP.StreamSplitter()

        def on_chunk(piece, _sp=splitter, _silent=silent):
            if parse and not _silent:
                vis = _sp.feed(piece)
                if vis:
                    sink.add(vis)
            elif not parse and not _silent:
                sink.add(piece)

        if attempt_new:
            package = D.package_for(run["scope_kind"], run["scope_id"], _scope_docs(run))
            head = PR.preamble(game, run["options"], package)
            if recovered:
                head += "\n\n" + PR.recovery_summary({**run, "state": run["state"]}, recent or [])
            text = head + "\n\n" + directive
        else:
            text = next_text
        try:
            out = llm.chat_stream(text, None if attempt_new else sid, "new" if attempt_new else "continue",
                                  on_chunk=on_chunk, think_mode="instant" if not parse else None)
        except llm.LLMError as exc:
            if not attempt_new and not recovered and _lost_session(exc):
                attempt_new, recovered = True, True
                _stage_set(turn_id, "memulihkan_sesi")
                continue
            raise
        if parse and not splitter.found:
            sink.add(splitter.flush())
        if not attempt_new and out.mode_fallback and not recovered:
            # gateway diam-diam membuat sesi baru tanpa konteks: buang balasannya, bangun ulang dengan benar
            llm.delete_session(out.session_id)
            attempt_new, recovered = True, True
            _stage_set(turn_id, "memulihkan_sesi")
            continue
        if attempt_new and sid and sid != out.session_id:
            llm.delete_session(sid)
        sid = out.session_id or sid
        _touch(run_id, gateway_session_id=sid, **({"resumes": run["resumes"] + 1} if recovered and attempt_new else {}))
        run = get_run(run_id)
        attempt_new = False
        if not parse:
            sink.finish()
            text_out = PP.split_reply(out.text)[0].strip()
            if not text_out:
                raise EngineError("Balasan kosong dari AI.")
            return text_out, {}, None
        try:
            narration, data = PP.parse_reply(out.text)
            result = validate(narration, data)
            sink.finish()
            return narration, data, result
        except PP.ProtocolError as exc:
            if corrections >= MAX_CORRECTIONS:
                raise EngineError(f"AI beberapa kali mengirim format yang salah ({exc}). Coba lagi.")
            corrections += 1
            silent = True
            _stage_set(turn_id, "merapikan")
            next_text = PR.correction_directive(game, str(exc))


def _stage_set(turn_id, stage: str) -> None:
    if turn_id:
        _stage.setdefault(turn_id, []).append(stage)


# ---------------------------------------------------------------- finalisasi giliran (wasit)
def _finalize(run_id: int, turn: dict, local: dict, ai_j: dict | None, *, hidden: bool = False) -> dict:
    """Hitung obs, XP, bukti penguasaan, dan state. Mengembalikan data `judged` untuk klien."""
    run = get_run(run_id)
    game, m = run["game"], G.MODES[run["game"]]
    pub, sec = turn["public"], turn["secret"]
    given = (turn["answer"] or {}).get("given") or (turn["answer"] or {}).get("text") or ""

    def fuzzy() -> bool:
        from handlers import _fuzzy_fallback
        return _fuzzy_fallback({"answer": sec.get("answer", ""), "keywords": jdump(sec.get("keywords") or [])}, given)

    base = G.final_obs(game, local, ai_j, fuzzy)
    hl = turn["hint_level"]
    obs = round(max(0.0, base * (1 - 0.15 * hl)), 4)
    correct = G.is_correct(obs)
    state = G.reduce_state(game, run["state"], correct, term=_term(turn), delta=None)
    xp = max(0, round(15 * obs * G.XP_W[m["kind"]]) + min(state["combo"], 5) * 2 - 3 * hl)
    before = {c: _level(c) for c in turn["concept_ids"]}
    D.add_evidence(turn["concept_ids"], m["kind"], obs, hl, run_id, turn["id"])
    D.struggling_cards(turn["concept_ids"], obs)
    newly = [_term_of(c) for c in turn["concept_ids"] if before[c] != "kuasai" and _level(c) == "kuasai"]
    if newly:
        state["newly_mastered"] = list(dict.fromkeys(state.get("newly_mastered", []) + newly))
    judged = {"turn_id": turn["id"], "obs": obs, "correct": correct, "xp": xp, "hidden": hidden,
              "feedback": (ai_j or {}).get("umpan_balik", ""), "rubrik": (ai_j or {}).get("rubrik"),
              "miskonsepsi": (ai_j or {}).get("miskonsepsi", ""), "detail": local.get("detail", {}),
              "reveal": G.reveal(game, pub, sec)}
    _set_turn(turn["id"], status="done", judgement=judged)
    _touch(run_id, state=state, correct=run["correct"] + (1 if correct else 0), total=run["total"] + 1,
           turn_count=run["turn_count"] + 1, xp=run["xp"] + xp)
    return judged


def _level(concept_id: int) -> str:
    m = db.row("SELECT score, evidence_n, kinds FROM mastery WHERE concept_id=?", (concept_id,))
    return D.mastery_level(m["score"], m["evidence_n"], jload(m["kinds"], [])) if m else "baru"


def _term_of(concept_id: int) -> str:
    return db.scalar("SELECT term FROM concepts WHERE id=?", (concept_id,), default="")


def _term(turn: dict) -> str:
    return _term_of(turn["concept_ids"][0]) if turn["concept_ids"] else ""


def public_judged(j: dict | None) -> dict | None:
    """Versi judged untuk klien; giliran tersembunyi (Ujian Boss) tidak menampilkan hasil."""
    if not j:
        return None
    if j.get("hidden"):
        return {"turn_id": j["turn_id"], "hidden": True}
    return j


# ---------------------------------------------------------------- pemilihan fokus & validasi
def _recent(run_id: int, n: int = 3) -> list[dict]:
    rows = db.rows("SELECT idx, concept_ids, judgement FROM game_turns WHERE run_id=? AND status='done' "
                   "ORDER BY idx DESC LIMIT ?", (run_id, n))
    out = []
    for r in reversed(rows):
        j = jload(r["judgement"], {}) or {}
        ids = jload(r["concept_ids"], [])
        out.append({"idx": r["idx"], "ids": ids, "focus": ", ".join(_term_of(i) for i in ids),
                    "hasil": "benar" if j.get("correct") else "perlu diulang"})
    return out


def _choose_focus(run: dict, count: int = 1) -> list[dict]:
    m = G.MODES[run["game"]]
    recent = _recent(run["id"], 6)
    if m["stay"] > 1 and recent and count == 1:           # Ajari Aku: tahan konsep yang sama beberapa giliran
        same = 0
        for r in reversed(recent):
            if r["ids"] == recent[-1]["ids"]:
                same += 1
            else:
                break
        if same < m["stay"]:
            return _focus_rows(recent[-1]["ids"])
    return D.pick_focus(_scope_docs(run), count, [r["ids"] for r in recent])


def _batch_validator(game: str, focus: list[dict], want: int):
    def validate(narration, data):
        nxt = data["next"]
        items = nxt.get("batch") if isinstance(nxt, dict) else None
        if not isinstance(items, list) or not items:
            raise PP.ProtocolError("next.batch harus berisi daftar soal")
        good, seen, errors = [], set(), []
        for it in items[:want + 3]:
            try:
                pub, sec, cid = G.check_item(game, it, focus)
            except PP.ProtocolError as exc:
                errors.append(str(exc))
                continue
            key = pub["question"].lower()
            if key in seen:
                continue
            seen.add(key)
            good.append((pub, sec, cid))
        if len(good) < max(2, (want + 1) // 2):
            raise PP.ProtocolError(f"hanya {len(good)} dari {want} soal valid ({errors[0] if errors else 'duplikat'})")
        return good[:want]
    return validate


def _single_validator(game: str, focus: list[dict], final: bool):
    def validate(narration, data):
        if final:
            return None
        if not isinstance(data["next"], dict):
            raise PP.ProtocolError("'next' wajib berisi tantangan berikutnya (bukan null)")
        return G.check_item(game, data["next"], focus)
    return validate


# ---------------------------------------------------------------- pekerjaan generasi (thread terpisah)
def _fail(turn_id: int, exc: Exception) -> None:
    if isinstance(exc, EngineError):
        msg, retry = str(exc), exc.retryable
    elif isinstance(exc, llm.LLMError):
        msg, retry = str(exc), not exc.fatal
    else:
        log.exception("Kesalahan tak terduga pada giliran %s", turn_id)
        msg, retry = "Kesalahan internal saat menyiapkan giliran. Coba lagi.", True
    _set_turn(turn_id, status="error", error=msg[:300])


def _fill_batch(run_id: int, first_turn_id: int, items: list, narration: str, kind: str) -> None:
    """Isi baris placeholder dengan soal pertama, sisanya disisipkan sebagai giliran 'awaiting'."""
    run = get_run(run_id)
    if not items:
        return
    # Sisipkan giliran tambahan terlebih dahulu agar siap sebelum giliran pertama dirilis
    for pub, sec, cid in items[1:]:
        tid = _new_turn(run_id, _next_idx(run_id), "awaiting", kind=kind, concept_ids=[cid])
        _set_turn(tid, public=pub, secret=sec)
    _touch(run_id)
    # Rilis giliran pertama terakhir agar wait() pemantau tidak unblock sebelum seluruh batch tersimpan
    pub, sec, cid = items[0]
    _set_turn(first_turn_id, status="awaiting", public=pub, secret=sec, concept_ids=[cid],
              narration=narration, error=None)


def job_start(run_id: int, turn_id: int) -> None:
    try:
        with _lock(run_id):
            run = get_run(run_id)
            game, m = run["game"], G.MODES[run["game"]]
            batch_n = min(m["batch"], run["max_turns"]) if m["batch"] else 0
            focus = _choose_focus(run, batch_n or 1)
            if not focus:
                raise EngineError("Materi belum punya istilah untuk dimainkan.", retryable=False)
            material, limited = D.material_for(focus)
            directive = PR.start_directive(game, run["max_turns"], focus, material, limited, batch_n)
            sink = _Flusher(turn_id)
            validate = _batch_validator(game, focus, batch_n) if batch_n else _single_validator(game, focus, False)
            narration, data, result = _converse(run_id, turn_id, directive, validate, sink, force_new=True)
            if batch_n:
                _fill_batch(run_id, turn_id, result, narration, m["kind"])
            else:
                pub, sec, cid = result
                _set_turn(turn_id, status="awaiting", public=pub, secret=sec, concept_ids=[cid], narration=narration, error=None)
    except Exception as exc:  # noqa: BLE001
        _fail(turn_id, exc)


def job_answer(run_id: int, turn_id: int, prev_id: int) -> None:
    """Nilai jawaban `prev_id`, lalu isi baris `turn_id` dengan tantangan berikutnya / penutup."""
    try:
        with _lock(run_id):
            run, prev = get_run(run_id), get_turn(prev_id)
            game, m = run["game"], G.MODES[run["game"]]
            local = G.grade_local(game, prev["public"], prev["secret"], prev["answer"])
            # peramal state: apakah ini giliran terakhir?
            would = G.reduce_state(game, run["state"], G.is_correct(local["skor"] if local["skor"] is not None else 1.0), "")
            final = run["turn_count"] + 1 >= run["max_turns"] or G.is_over(game, would)
            focus = [] if final else _choose_focus(run, 1)
            material, limited = D.material_for(focus) if focus else ("", False)
            prev_summary = {"tantangan": prev["public"], "jawaban_pelajar": prev["answer"],
                            "hasil_agent": {"skor_lokal": local["skor"], "detail": local["detail"],
                                            "petunjuk_dipakai": prev["hint_level"]},
                            "kunci_rahasia": prev["secret"]}
            directive = PR.answer_directive(game, run["turn_count"] + 2, run["max_turns"], focus, material, limited,
                                            prev_summary, final, 0)
            sink = _Flusher(turn_id)
            narration, data, result = _converse(run_id, turn_id, directive, _single_validator(game, focus, final), sink,
                                                recent=_recent(run_id))
            judged = _finalize(run_id, prev, local, data["judgement"])
            # petualangan: state_delta kosmetik (lokasi) boleh diterapkan setelah finalisasi
            if game == "petualangan" and data["state_delta"].get("location"):
                st = get_run(run_id)["state"]
                st["location"] = G._c(data["state_delta"]["location"], 60)
                _touch(run_id, state=st)
            if final or G.is_over(game, get_run(run_id)["state"]):
                _finish(run_id, "finished")
                _set_turn(turn_id, status="done", kind="end", narration=narration, error=None)
            else:
                pub, sec, cid = result
                _set_turn(turn_id, status="awaiting", public=pub, secret=sec, concept_ids=[cid], narration=narration, error=None)
    except Exception as exc:  # noqa: BLE001
        _fail(turn_id, exc)


def job_prefetch(run_id: int, turn_id: int, want: int) -> None:
    try:
        with _lock(run_id):
            run = get_run(run_id)
            game = run["game"]
            focus = _choose_focus(run, want)
            material, limited = D.material_for(focus)
            directive = PR.start_directive(game, run["max_turns"], focus, material, limited, want)
            directive = directive.replace("#aksi=start", "#aksi=batch")
            narration, data, result = _converse(run_id, turn_id, directive, _batch_validator(game, focus, want),
                                                _Flusher(turn_id), recent=_recent(run_id))
            _fill_batch(run_id, turn_id, result, "", G.MODES[game]["kind"])
    except Exception as exc:  # noqa: BLE001
        _fail(turn_id, exc)


def job_report(run_id: int, turn_id: int) -> None:
    """Ujian Boss: semua jawaban terkumpul -> nilai isian ambigu + rapor akhir (stream)."""
    try:
        with _lock(run_id):
            run = get_run(run_id)
            turns = db.rows("SELECT id FROM game_turns WHERE run_id=? AND kind='boss' ORDER BY idx", (run_id,))
            results = []
            for r in turns:
                t = get_turn(r["id"])
                local = G.grade_local("boss", t["public"], t["secret"], t["answer"])
                results.append({"idx": t["idx"], "konsep": _term(t), "soal": t["public"]["question"],
                                "jawaban": (t["answer"] or {}).get("given"), "benar": None if local["skor"] is None else local["skor"] >= 1,
                                "kunci": G.reveal("boss", t["public"], t["secret"]).get("answer_text")})
            directive = PR.report_directive("boss", run["max_turns"], results)
            sink = _Flusher(turn_id)
            narration, data, _ = _converse(run_id, turn_id, directive, lambda n, d: None, sink, recent=_recent(run_id))
            items = (data["judgement"] or {}).get("items", {})
            for r in turns:
                t = get_turn(r["id"])
                if t["status"] == "done":
                    continue
                local = G.grade_local("boss", t["public"], t["secret"], t["answer"])
                ai = {"skor": items.get(str(t["idx"]), -1.0)}
                _finalize(run_id, t, local, ai, hidden=False)
            for r in turns:                                  # buka semua hasil setelah ujian selesai
                t = get_turn(r["id"])
                j = t["judgement"] or {}
                j["hidden"] = False
                _set_turn(t["id"], judgement=j)
            _finish(run_id, "finished")
            _set_turn(turn_id, status="done", kind="end", narration=narration, error=None)
    except Exception as exc:  # noqa: BLE001
        _fail(turn_id, exc)


# ---------------------------------------------------------------- selesai / hadiah
def _finish(run_id: int, status: str) -> dict:
    """Tutup run (idempoten): hadiah XP ke pemain sekali saja, lencana, misi, hapus sesi gateway."""
    with _lock(run_id):
        run = get_run(run_id)
        if run["status"] != "active":
            return jload(run["summary"], {}) or {}
        acc = run["correct"] / run["total"] if run["total"] else 0.0
        bonuses = {}
        if status == "finished" and run["total"] > 0:
            bonuses["selesai"] = 25
            if acc >= 0.8:
                bonuses["akurasi"] = 15
        total_xp = min(XP_RUN_CAP, run["xp"] + sum(bonuses.values()))
        before, after = PF.add_xp(total_xp)
        _touch(run_id, status=status, xp=total_xp, finished_at=db.now())
        llm.delete_session(run["gateway_session_id"])
        if run["total"] > 0:
            doc = run["scope_id"] if run["scope_kind"] == "document" else None
            stats.log_event("game", doc, seconds=min(1500, run["total"] * 40), quizzes=1)
        summary = {"xp": total_xp, "bonuses": bonuses, "level_before": before, "level_after": after,
                   "level_up": after > before, "accuracy": round(acc, 3),
                   "newly_mastered": run["state"].get("newly_mastered", [])}
        if status == "finished":
            summary["achievements"] = PF.unlock_achievements()
            summary["quests"] = PF.check_quests()
            summary["quest_xp"] = sum(q["xp"] for q in summary["quests"])
            summary["level_after"] = PF.profile()["level"]          # XP misi ikut menentukan level akhir
            summary["level_up"] = summary["level_after"] > before
        _touch(run_id, summary=summary)
        return summary


def finish(run_id: int, abandon: bool = False) -> dict:
    run = get_run(run_id)
    if run["status"] != "active":
        return {"run": run_public(run), "rewards": jload(run["summary"], {}) or {}}
    rewards = _finish(run_id, "abandoned" if abandon else "finished")
    return {"run": run_public(get_run(run_id)), "rewards": rewards}


# ================================================================ operasi (dipanggil handler RPC)
def _key(p: dict) -> str:
    key = str(p.get("client_key") or "").strip()
    if not 8 <= len(key) <= 64:
        raise UserError("client_key wajib (8-64 karakter).")
    return key


def _by_key(key: str) -> dict | None:
    r = db.row("SELECT id FROM game_turns WHERE client_key=?", (key,))
    return get_turn(r["id"]) if r else None


def sweep_stale() -> None:
    """Run aktif yang tak disentuh >6 jam ditutup (hadiah hanya untuk giliran yang sudah dijawab)."""
    for r in db.rows("SELECT id FROM game_runs WHERE status='active' AND updated_at<?", (db.now() - STALE_RUN_S,)):
        try:
            _finish(r["id"], "abandoned")
        except Exception:  # noqa: BLE001
            log.warning("Gagal menutup run basi %s", r["id"], exc_info=True)


def recover() -> None:
    """Dipanggil saat agent mulai: giliran yang sedang dibuat saat proses mati ditandai error (bisa dicoba lagi)."""
    n = db.scalar("SELECT COUNT(*) FROM game_turns WHERE status='generating'")
    if n:
        db.run("UPDATE game_turns SET status='error', error=? WHERE status='generating'",
               ("Terputus karena agent berhenti. Tekan Coba lagi.",))
    sweep_stale()


def active_run() -> dict | None:
    r = db.row("SELECT id FROM game_runs WHERE status='active' ORDER BY updated_at DESC LIMIT 1")
    return get_run(r["id"]) if r else None


def current_turn_id(run_id: int) -> int | None:
    r = db.row("SELECT id FROM game_turns WHERE run_id=? AND status IN ('awaiting','generating','error') "
               "ORDER BY idx LIMIT 1", (run_id,))
    if r:
        return r["id"]
    r = db.row("SELECT id FROM game_turns WHERE run_id=? ORDER BY idx DESC LIMIT 1", (run_id,))
    return r["id"] if r else None


def payload(run_id: int, turn_id: int, judged_id: int | None = None) -> dict:
    run, t = get_run(run_id), get_turn(turn_id)
    out = {"run": run_public(run), **turn_view(t), "judged": None, "rewards": None,
           "ended": run["status"] != "active", "stage": (_stage.get(turn_id) or [None])[-1]}
    judged = None
    if judged_id:
        judged = get_turn(judged_id)
    elif t["answer"] is None and t["idx"] > 1:
        r = db.row("SELECT id FROM game_turns WHERE run_id=? AND idx=? AND status='done'", (run_id, t["idx"] - 1))
        judged = get_turn(r["id"]) if r else None
    if judged:
        out["judged"] = public_judged(judged["judgement"])
    if out["ended"]:
        rewards = jload(run["summary"], {}) or {}
        if not rewards and run.get("xp") is not None:
            rewards = {
                "xp": run["xp"],
                "bonuses": {},
                "level_before": 1,
                "level_after": 1,
                "level_up": False,
                "accuracy": round(run["correct"] / run["total"], 3) if run["total"] else 0.0,
                "newly_mastered": (run["state"] or {}).get("newly_mastered", []),
                "achievements": [],
                "quests": [],
                "quest_xp": 0,
            }
        out["rewards"] = rewards
    return out


def wait(turn_id: int, emit=None, timeout: float = 170.0) -> dict:
    """Pantau giliran yang sedang dibuat: teruskan teks parsial & tahap ke `emit`, kembalikan payload."""
    sent, seen, t0 = 0, 0, time.time()
    while True:
        t = get_turn(turn_id)
        if emit:
            part = t["partial"] or ""
            if len(part) > sent:                       # termasuk sisa terakhir setelah generasi selesai
                emit({"chunk": part[sent:]})
                sent = len(part)
            log_ = _stage.get(turn_id, [])
            for st in log_[seen:]:
                emit({"stage": st})
            seen = len(log_)
        if t["status"] != "generating" or time.time() - t0 > timeout:
            out = payload(t["run_id"], turn_id)
            if t["status"] != "generating":
                _stage.pop(turn_id, None)
            return out
        time.sleep(0.2)


def op_start(p: dict) -> dict:
    game = str(p.get("game") or "")
    m = G.mode(game)
    key = _key(p)
    existing = _by_key(key)
    if existing:                                    # permintaan diulang: jangan membuat run kedua
        return {"turn_id": existing["id"], "run_id": existing["run_id"]}
    kind = str(p.get("scope_kind") or "")
    sid = clamp(p.get("scope_id"), 0, 10 ** 9, 0)
    if kind not in ("document", "subject", "all"):
        raise UserError("Cakupan tidak valid.")
    ids = doc_ids(sid if kind == "document" else None, sid if kind == "subject" else None)
    if not ids or (kind == "document" and not db.scalar("SELECT COUNT(*) FROM documents WHERE id=? AND status='ready'", (sid,))):
        raise UserError("Materi belum siap dipelajari.")
    from concepts import concept_rows
    if len(concept_rows(ids)) < 3:
        raise UserError("Materi ini belum punya cukup istilah (minimal 3). Gunakan 'Perbanyak istilah' dulu.")
    sweep_stale()
    act = active_run()
    if act:
        raise UserError("Masih ada permainan yang berjalan. Lanjutkan atau tinggalkan dulu.")
    opts = G.normalize_options(game, p.get("options"))
    now = db.now()
    run_id = db.run("INSERT INTO game_runs(game,scope_kind,scope_id,options,status,state,max_turns,started_at,updated_at) "
                    "VALUES(?,?,?,?,'active',?,?,?,?)",
                    (game, kind, sid if kind != "all" else 0, jdump(opts), jdump(G.initial_state(game, opts)),
                     opts["jumlah_giliran"], now, now))
    turn_id = _new_turn(run_id, 1, "generating", kind=m["kind"], client_key=key, directive={"op": "start"})
    POOL.submit(job_start, run_id, turn_id)
    return {"turn_id": turn_id, "run_id": run_id}


def _judge_short(game: str, turn: dict) -> dict | None:
    """Isian ambigu pada mode Kilat: panggilan kecil ke model cepat; gagal -> None (fallback fuzzy)."""
    def validate(obj):
        if not isinstance(obj, dict) or "skor" not in obj:
            raise ValueError("butuh 'skor'")
        return {"skor": max(0.0, min(1.0, float(obj["skor"])))}
    try:
        return llm.chat_json(PR.judge_directive(game, turn["public"], turn["answer"], turn["secret"]), "fast", validate)
    except Exception:  # noqa: BLE001
        log.info("Penilaian AI isian gagal; memakai fuzzy lokal")
        return None


def _answer_batch(run: dict, turn: dict, key: str) -> dict:
    game, run_id = run["game"], run["id"]
    local = G.grade_local(game, turn["public"], turn["secret"], turn["answer"])
    db.run("UPDATE game_turns SET client_key=? WHERE id=?", (key, turn["id"]))
    judged = None
    if game == "boss":
        if local["skor"] is None:
            _set_turn(turn["id"], status="judging")          # isian ambigu: dinilai bersama rapor
        else:
            _finalize(run_id, turn, local, None, hidden=True)
    else:
        ai = _judge_short(game, turn) if local["need_ai"] and local["skor"] is None else None
        judged = _finalize(run_id, turn, local, ai)
    run = get_run(run_id)
    awaiting = db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=? AND status='awaiting'", (run_id,))
    generated = db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=? AND kind!='end'", (run_id,))
    if game == "kilat":
        if run["turn_count"] >= run["max_turns"]:
            _finish(run_id, "finished")
        elif awaiting <= 2 and generated < run["max_turns"] and not db.scalar(
                "SELECT COUNT(*) FROM game_turns WHERE run_id=? AND status IN ('generating','error')", (run_id,)):
            want = min(G.MODES[game]["batch"], run["max_turns"] - generated)
            tid = _new_turn(run_id, _next_idx(run_id), "generating", kind=G.MODES[game]["kind"],
                            directive={"op": "prefetch", "want": want})
            POOL.submit(job_prefetch, run_id, tid, want)
    elif game == "boss" and awaiting == 0:
        tid = _new_turn(run_id, _next_idx(run_id), "generating", kind="end", directive={"op": "report"})
        POOL.submit(job_report, run_id, tid)
        return {"wait_turn": tid, "judged_id": turn["id"]}
    cur = current_turn_id(run_id)
    return {"payload": payload(run_id, cur, judged_id=turn["id"])}


def op_answer(p: dict) -> dict:
    key = _key(p)
    existing = _by_key(key)
    if existing:                                             # replay idempoten
        if existing["answer"] is not None:                   # giliran yang dijawab (mode batch)
            return {"payload": payload(existing["run_id"], current_turn_id(existing["run_id"]), judged_id=existing["id"])}
        return {"wait_turn": existing["id"]}
    turn = get_turn(clamp(p.get("turn_id"), 1, 10 ** 9, 0))
    run_id = turn["run_id"]
    with _lock(run_id):
        run = get_run(run_id)
        if run["status"] != "active":
            raise UserError("Permainan ini sudah selesai.")
        turn = get_turn(turn["id"])
        if turn["status"] != "awaiting":
            raise UserError("Giliran ini belum siap atau sudah dijawab.")
        first = db.row("SELECT id FROM game_turns WHERE run_id=? AND status='awaiting' ORDER BY idx LIMIT 1", (run_id,))
        if first["id"] != turn["id"]:
            raise UserError("Jawab soal yang sedang aktif lebih dulu.")
        game = run["game"]
        cleaned = G.clean_answer(game, turn["public"], p.get("answer"))
        _set_turn(turn["id"], answer=cleaned, status="judging")
        if G.MODES[game]["batch"]:
            return _answer_batch(run, get_turn(turn["id"]), key)
        tid = _new_turn(run_id, _next_idx(run_id), "generating", kind=G.MODES[game]["kind"], client_key=key,
                        directive={"op": "answer", "prev": turn["id"]})
        POOL.submit(job_answer, run_id, tid, turn["id"])
        return {"wait_turn": tid}


def op_hint(p: dict, emit=None) -> dict:
    turn = get_turn(clamp(p.get("turn_id"), 1, 10 ** 9, 0))
    run_id = turn["run_id"]
    with _lock(run_id):
        run, turn = get_run(run_id), get_turn(turn["id"])
        game = run["game"]
        if run["status"] != "active" or turn["status"] != "awaiting":
            raise UserError("Petunjuk hanya untuk soal yang sedang aktif.")
        if not G.MODES[game]["hints"]:
            raise UserError("Ujian Boss tidak memberi petunjuk.")
        want = clamp(p.get("level"), 1, 3, turn["hint_level"] + 1)
        hints = (turn["public"] or {}).get("hints", [])
        if want <= turn["hint_level"] and want <= len(hints):         # permintaan diulang
            return {"turn_id": turn["id"], "level": want, "hint": hints[want - 1]}
        if turn["hint_level"] >= 3:
            raise UserError("Petunjuk sudah habis.")
        level = turn["hint_level"] + 1
        directive = PR.hint_directive(game, level, {k: v for k, v in turn["public"].items() if k != "hints"},
                                      turn["secret"], run["turn_count"] + 1, run["max_turns"])
        try:
            text, _, _ = _converse(run_id, None, directive, lambda n, d: None, _Direct(emit) if emit else _Direct(lambda d: None),
                                   parse=False, recent=_recent(run_id))
        except (EngineError, llm.LLMError) as exc:
            raise UserError(f"Petunjuk gagal dibuat: {exc}")
        public = dict(turn["public"])
        public["hints"] = hints + [text]
        _set_turn(turn["id"], public=public, hint_level=level)
        return {"turn_id": turn["id"], "level": level, "hint": text}


def op_attach(p: dict, emit=None) -> dict:
    """Sambung ulang setelah koneksi putus: lewat turn_id atau client_key permintaan yang tadi dikirim."""
    if p.get("turn_id"):
        return wait(clamp(p.get("turn_id"), 1, 10 ** 9, 0), emit)
    existing = _by_key(_key(p))
    if not existing:
        raise UserError("Permintaan itu belum sampai ke agent. Kirim ulang.")
    if existing["answer"] is not None:                      # giliran yang dijawab (mode batch)
        return payload(existing["run_id"], current_turn_id(existing["run_id"]), judged_id=existing["id"])
    return wait(existing["id"], emit)


def op_retry(p: dict) -> dict:
    turn = get_turn(clamp(p.get("turn_id"), 1, 10 ** 9, 0))
    if turn["status"] != "error":
        raise UserError("Giliran ini tidak sedang gagal.")
    d = turn["directive"] or {}
    run_id = turn["run_id"]
    _stage.pop(turn["id"], None)
    _set_turn(turn["id"], status="generating", error=None, partial=None, retries=turn["retries"] + 1)
    op = d.get("op")
    if op == "answer":
        POOL.submit(job_answer, run_id, turn["id"], d["prev"])
    elif op == "prefetch":
        POOL.submit(job_prefetch, run_id, turn["id"], d.get("want", 5))
    elif op == "report":
        POOL.submit(job_report, run_id, turn["id"])
    else:
        POOL.submit(job_start, run_id, turn["id"])
    return {"turn_id": turn["id"]}


def flag(turn_id: int) -> dict:
    """'Soal ini keliru': buang bukti penguasaannya, koreksi akurasi dan XP."""
    t = get_turn(turn_id)
    if t["flagged"]:
        return {"ok": True}
    run_id = t["run_id"]
    with _lock(run_id):
        run, j = get_run(run_id), t["judgement"] or {}
        D.drop_evidence(turn_id)
        _set_turn(turn_id, flagged=1)
        if t["status"] == "done" and j:
            xp = int(j.get("xp", 0))
            _touch(run_id, correct=max(0, run["correct"] - (1 if j.get("correct") else 0)),
                   total=max(0, run["total"] - 1), xp=max(0, run["xp"] - xp))
            if run["status"] != "active":
                PF.add_xp(-xp)
    return {"ok": True}
