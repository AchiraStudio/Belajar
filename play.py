"""Handler RPC untuk game belajar interaktif (v2). Logika ada di play_engine/play_games/play_director."""
from __future__ import annotations

import db
import play_director as D
import play_engine as E
import play_games as G
import profile as PF
import stats
from common import UserError, clamp, doc_ids, jload, source
from concepts import concept_rows, seed_all
from handlers import need_int, opt_int, register


def _modes() -> list[dict]:
    return [{"key": k, "title": m["title"], "desc": m["desc"], "kind": m["kind"], "hints": m["hints"],
             "turns": {"default": m["turns"][0], "min": m["turns"][1], "max": m["turns"][2]}} for k, m in G.MODES.items()]


def _levels(rows: list[dict]) -> dict:
    out = {"baru": 0, "dikenal": 0, "paham": 0, "kuasai": 0}
    for r in rows:
        out[D.mastery_level(r["score"], r["evidence_n"], jload(r["kinds"], []))] += 1
    return out


@register("play_hub")
def play_hub(p):
    seed_all()
    ready = db.rows("SELECT d.id, d.title, d.subject_id, s.name AS subject, "
                    "(SELECT COUNT(*) FROM concepts c WHERE c.document_id=d.id) AS concepts "
                    "FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id WHERE d.status='ready' ORDER BY d.title")
    all_ids = [d["id"] for d in ready]
    rows = concept_rows(all_ids)
    due = {(r["document_id"], r["front"]) for r in db.rows("SELECT document_id, front FROM cards WHERE due_day<=?", (stats.today(),))}
    weak = sorted([r for r in rows if r["evidence_n"] > 0 and r["score"] < 50 or (r["document_id"], r["term"]) in due],
                  key=lambda r: ((r["document_id"], r["term"]) not in due, r["score"]))[:6]
    E.sweep_stale()
    act = E.active_run()
    from cards import card_counts
    return {"profile": PF.profile(), "streak": stats.streak_info(), "quests": PF.daily_quests(), "modes": _modes(),
            "documents": ready, "subjects": db.rows("SELECT id, name FROM subjects ORDER BY name"),
            "levels": _levels(rows), "weak": [{"id": w["id"], "term": w["term"], "doc_title": w["doc_title"],
                                               "score": round(w["score"])} for w in weak],
            "cards": card_counts(), "active": E.run_public(act) if act else None,
            "achievements": PF.achievements_list()}


@register("play_turn")
def play_turn(p):
    """Streaming: op = start | answer | hint | retry | attach. Hasil akhir dikirim sebagai event `done`."""
    emit = p.get("_emit")
    if not callable(emit):
        emit = None
    op = str(p.get("op") or "")
    if op == "start":
        return E.wait(E.op_start(p)["turn_id"], emit)
    if op == "answer":
        r = E.op_answer(p)
        if "payload" in r:
            return r["payload"]
        out = E.wait(r["wait_turn"], emit)
        if r.get("judged_id"):
            out["judged"] = E.public_judged(E.get_turn(r["judged_id"])["judgement"])
        return out
    if op == "hint":
        return E.op_hint(p, emit)
    if op == "retry":
        return E.wait(E.op_retry(p)["turn_id"], emit)
    if op == "attach":
        return E.op_attach(p, emit)
    raise UserError("Operasi game tidak dikenal.")


@register("play_turn_get")
def play_turn_get(p):
    """Ambil keadaan sebuah giliran tanpa menunggu (untuk polling setelah koneksi putus)."""
    t = E.get_turn(need_int(p, "turn_id"))
    return E.payload(t["run_id"], t["id"])


@register("play_get")
def play_get(p):
    """Lanjutkan permainan aktif (atau run tertentu): kembalikan giliran saat ini."""
    run_id = opt_int(p, "run_id")
    run = E.get_run(run_id) if run_id else E.active_run()
    if not run:
        return {"run": None}
    cur = E.current_turn_id(run["id"])
    return E.payload(run["id"], cur) if cur else {"run": E.run_public(run)}


@register("play_finish")
def play_finish(p):
    """Akhiri lebih awal: hadiah dihitung dari giliran yang sudah dijawab."""
    return E.finish(need_int(p, "run_id"))


@register("play_abandon")
def play_abandon(p):
    return E.finish(need_int(p, "run_id"), abandon=True)


@register("play_flag")
def play_flag(p):
    return E.flag(need_int(p, "turn_id"))


@register("play_map")
def play_map(p):
    """Peta penguasaan: konsep dikelompokkan per topik, dengan tingkat dan status kartu jatuh tempo."""
    ids = doc_ids(opt_int(p, "document_id"), opt_int(p, "subject_id"))
    rows = concept_rows(ids)
    due = {(r["document_id"], r["front"]) for r in db.rows("SELECT document_id, front FROM cards WHERE due_day<=?", (stats.today(),))}
    groups: dict[str, list] = {}
    for r in rows:
        kinds = jload(r["kinds"], [])
        item = {"id": r["id"], "term": r["term"], "definition": r["definition"], "doc_title": r["doc_title"],
                "score": round(r["score"]), "evidence_n": r["evidence_n"], "kinds": kinds,
                "level": D.mastery_level(r["score"], r["evidence_n"], kinds), "due": (r["document_id"], r["term"]) in due}
        groups.setdefault(r["topic"] or r["doc_title"], []).append(item)
    return {"groups": [{"title": t, "concepts": c} for t, c in groups.items()], "counts": _levels(rows),
            "source": source(opt_int(p, "document_id"), opt_int(p, "subject_id"))}


@register("play_runs")
def play_runs(p):
    runs = db.rows("SELECT id, game, scope_kind, scope_id, correct, total, xp, started_at, finished_at FROM game_runs "
                   "WHERE status='finished' ORDER BY finished_at DESC LIMIT ?", (clamp(p.get("limit"), 1, 50, 10),))
    for r in runs:
        r["title"] = G.MODES[r["game"]]["title"]
    return {"runs": runs}


@register("play_profile")
def play_profile(p):
    return {"profile": PF.profile(), "streak": stats.streak_info(), "quests": PF.daily_quests(),
            "achievements": PF.achievements_list()}
