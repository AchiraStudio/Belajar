"""Definisi tiap mode game: skema public/secret, validasi keluaran AI, penilai lokal, reveal, state.

AI hanya MENULIS tantangan. Kunci jawaban (secret) disimpan di SQLite dan tidak pernah dikirim ke
klien sebelum giliran selesai dinilai. Semua keluaran AI diperlakukan sebagai data tak tepercaya:
dipotong, di-clamp, dan field di luar skema dibuang.
"""
from __future__ import annotations

import random

import pipeline
import sanitize
from common import UserError, clamp, clamp01, jload
from play_protocol import ProtocolError

# Bukti penguasaan (model §4.3) dan bobot XP (§4.4) per jenis bukti.
KIND_W = {"recall": 0.25, "explain": 0.35, "apply": 0.35, "boss": 0.45}
XP_W = {"recall": 1.0, "explain": 1.4, "apply": 1.4, "boss": 1.6}
PASS_OBS = 0.7                       # obs >= ini dianggap "benar" (kombo, HP, akurasi)

THEMES = ("fantasi", "detektif", "scifi", "kantor")
LEVELS = ("mudah", "sedang", "sulit")

MODES: dict[str, dict] = {
    "ajari": {"title": "Ajari Aku", "kind": "explain", "turns": (6, 3, 10), "stay": 2, "batch": 0, "hints": True,
              "desc": "Jelaskan konsep dengan kata-katamu kepada murid yang kritis."},
    "detektif": {"title": "Detektif Salah Kaprah", "kind": "explain", "turns": (4, 2, 8), "stay": 1, "batch": 0,
                 "hints": True, "desc": "Temukan kalimat yang keliru di dalam penjelasan yang tampak meyakinkan."},
    "petualangan": {"title": "Petualangan", "kind": "apply", "turns": (8, 4, 12), "stay": 1, "batch": 0,
                    "hints": True, "desc": "Cerita bercabang: tiap rintangan adalah tantangan dari materimu."},
    "kasus": {"title": "Kasus Nyata", "kind": "apply", "turns": (5, 3, 8), "stay": 1, "batch": 0, "hints": True,
              "desc": "Terapkan konsep pada situasi dunia nyata tanpa disebut istilahnya."},
    "kilat": {"title": "Kilat", "kind": "recall", "turns": (10, 5, 20), "stay": 1, "batch": 5, "hints": True,
              "desc": "Soal cepat 5–10 menit, satu tangan."},
    "boss": {"title": "Ujian Boss", "kind": "boss", "turns": (8, 6, 12), "stay": 1, "batch": 12, "hints": False,
             "desc": "Ujian lintas topik tanpa petunjuk dan tanpa umpan balik, ditutup rapor."},
}


def mode(game: str) -> dict:
    if game not in MODES:
        raise UserError("Jenis game tidak dikenal.")
    return MODES[game]


def normalize_options(game: str, options) -> dict:
    m, options = mode(game), (options if isinstance(options, dict) else {})
    default, lo, hi = m["turns"]
    out = {"jumlah_giliran": clamp(options.get("jumlah_giliran"), lo, hi, default),
           "tingkat": options.get("tingkat") if options.get("tingkat") in LEVELS else "sedang"}
    if game == "petualangan":
        out["tema"] = options.get("tema") if options.get("tema") in THEMES else "fantasi"
    return out


def initial_state(game: str, options: dict) -> dict:
    state = {"combo": 0, "best_combo": 0}
    if game == "petualangan":
        state.update({"hp": 3, "max_hp": 3, "scene_no": 0, "theme": options.get("tema", "fantasi"),
                      "inventory": [], "location": ""})
    return state


# ---------------------------------------------------------------- validasi tantangan dari AI
def _c(value, n: int) -> str:
    return sanitize.clean_inline(str(value or ""))[:n]


def _term_in(text: str, term: str) -> bool:
    return bool(term) and f" {pipeline._norm(term)} " in f" {pipeline._norm(text)} "


def _focus_for(item: dict, focus: list[dict]) -> dict:
    """Konsep yang dimaksud item (field `konsep`), jatuh ke fokus pertama bila tak dikenali."""
    want = pipeline._norm(item.get("konsep") or item.get("concept") or "")
    for f in focus:
        if want and pipeline._norm(f["term"]) == want:
            return f
    return focus[0]


def _options(raw_options, answer_ref, lo: int = 3, hi: int = 4) -> tuple[list[dict], str]:
    """Normalisasi pilihan {id,text}: kunci dicari dari id/indeks/teks, urutan diacak, id diberi ulang."""
    if not isinstance(raw_options, list):
        raise ProtocolError("opsi pilihan harus berupa daftar")
    items: list[tuple[str, str]] = []
    for i, o in enumerate(raw_options[:hi]):
        if isinstance(o, dict):
            items.append((str(o.get("id", i)).strip().lower(), _c(o.get("text"), 220)))
        else:
            items.append((str(i), _c(o, 220)))
    items = [(k, t) for k, t in items if t]
    if not lo <= len(items) <= hi or len({pipeline._norm(t) for _, t in items}) != len(items):
        raise ProtocolError(f"butuh {lo}-{hi} opsi yang berbeda")
    ref = str(answer_ref).strip().lower()
    correct = next((t for k, t in items if k == ref), None)
    if correct is None and ref.isdigit() and int(ref) < len(items):
        correct = items[int(ref)][1]
    if correct is None:
        correct = next((t for _, t in items if pipeline._norm(t) == pipeline._norm(answer_ref)), None)
    if correct is None:
        raise ProtocolError("answer_id tidak cocok dengan opsi mana pun")
    texts = [t for _, t in items]
    random.shuffle(texts)                    # model cenderung menaruh jawaban di posisi yang sama
    opts = [{"id": chr(97 + i), "text": t} for i, t in enumerate(texts)]
    return opts, next(o["id"] for o in opts if o["text"] == correct)


def check_item(game: str, item, focus: list[dict]) -> tuple[dict, dict, int]:
    """Validasi satu tantangan {public, secret} dari AI -> (public, secret, concept_id)."""
    if not isinstance(item, dict) or not isinstance(item.get("public"), dict) or not isinstance(item.get("secret"), dict):
        raise ProtocolError("'next' harus memuat objek public dan secret")
    pub, sec = item["public"], item["secret"]
    f = _focus_for(item, focus)
    if game == "ajari":
        prompt = _c(pub.get("prompt"), 500)
        poin = [p for p in (_c(x, 200) for x in (sec.get("poin_kunci") or []) if x) if p]
        if len(prompt) < 10 or len(poin) < 2:
            raise ProtocolError("ajari: butuh public.prompt dan minimal 2 secret.poin_kunci")
        return {"prompt": prompt, "concept": f["term"], "input": "text"}, {"poin_kunci": poin[:6]}, f["id"]
    if game == "detektif":
        sents = [s for s in (_c(x, 320) for x in (pub.get("sentences") or [])) if s]
        try:
            wrong = sorted({int(i) for i in (sec.get("wrong") or [])})
        except (TypeError, ValueError):
            raise ProtocolError("detektif: secret.wrong harus daftar indeks angka")
        if not 4 <= len(sents) <= 10 or not 1 <= len(wrong) <= 2 or any(not 0 <= i < len(sents) for i in wrong):
            raise ProtocolError("detektif: butuh 4-10 kalimat dan 1-2 indeks salah yang valid")
        benar = sec.get("benar") if isinstance(sec.get("benar"), dict) else {}
        return ({"title": _c(pub.get("title"), 120) or f["term"], "sentences": sents, "input": "tap"},
                {"wrong": wrong, "benar": {str(k): _c(v, 320) for k, v in benar.items() if str(k).isdigit()}}, f["id"])
    if game == "petualangan":
        ch = pub.get("challenge")
        if not isinstance(ch, dict):
            raise ProtocolError("petualangan: butuh public.challenge")
        question, scene = _c(ch.get("question"), 400), _c(pub.get("scene"), 700)
        if len(question) < 8 or len(scene) < 10:
            raise ProtocolError("petualangan: public.scene dan challenge.question terlalu pendek")
        if ch.get("type") == "short":
            ans = _c(sec.get("answer"), 200)
            if not ans:
                raise ProtocolError("petualangan: secret.answer kosong")
            kws = [k for k in (_c(x, 60) for x in (sec.get("keywords") or [])) if k][:6]
            return ({"scene": scene, "challenge": {"type": "short", "question": question}},
                    {"answer": ans, "keywords": kws, "explain": _c(sec.get("explain"), 400)}, f["id"])
        opts, aid = _options(ch.get("options"), sec.get("answer_id"))
        return ({"scene": scene, "challenge": {"type": "choice", "question": question, "options": opts}},
                {"answer_id": aid, "explain": _c(sec.get("explain"), 400)}, f["id"])
    if game == "kasus":
        scenario, question = _c(pub.get("scenario"), 900), _c(pub.get("question"), 400)
        if len(scenario) < 30 or len(question) < 8:
            raise ProtocolError("kasus: public.scenario/question terlalu pendek")
        for fc in focus:
            if _term_in(scenario + " " + question, fc["term"]):
                raise ProtocolError(f"kasus: skenario tidak boleh menyebut istilah materi '{fc['term']}'")
        opts, aid = _options(pub.get("options"), sec.get("answer_id"))
        return ({"scenario": scenario, "question": question, "options": opts, "input": "choice_reason"},
                {"answer_id": aid, "concept": f["term"], "why": _c(sec.get("why"), 500)}, f["id"])
    if game in ("kilat", "boss"):
        raw = {**pub, **sec, "type": pub.get("type") or pub.get("qtype") or item.get("type") or sec.get("type")}
        q = pipeline.normalize_question(raw)
        if not q:
            raise ProtocolError("soal tidak valid (mcq butuh tepat 4 opsi berbeda + answer_index; tf butuh answer; short butuh answer)")
        return ({"qtype": q["qtype"], "question": q["question"], "options": q["options"]},
                {"answer": q["answer"], "keywords": q["keywords"], "explanation": q["explanation"]}, f["id"])
    raise ProtocolError("mode tidak dikenal")


# ---------------------------------------------------------------- jawaban pengguna
def clean_answer(game: str, public: dict, answer) -> dict:
    a = answer if isinstance(answer, dict) else {"text": answer}
    if game == "ajari":
        text = str(a.get("text") or "").strip()
        if len(text) < 3:
            raise UserError("Tulis penjelasanmu dulu.")
        return {"text": text[:2000]}
    if game == "detektif":
        n = len(public.get("sentences", []))
        try:
            taps = sorted({int(i) for i in (a.get("taps") or [])})
        except (TypeError, ValueError):
            raise UserError("Pilihan kalimat tidak valid.")
        if any(not 0 <= i < n for i in taps) or len(taps) > n:
            raise UserError("Pilihan kalimat tidak valid.")
        return {"taps": taps, "correction": str(a.get("correction") or "").strip()[:500]}
    if game in ("petualangan", "kasus"):
        ch = public.get("challenge") or {}
        if game == "kasus" or ch.get("type") == "choice":
            ids = {o["id"] for o in (public.get("options") if game == "kasus" else ch.get("options")) or []}
            cid = str(a.get("choice_id") or "").strip().lower()
            if cid not in ids:
                raise UserError("Pilih salah satu jawaban.")
            out = {"choice_id": cid}
            if game == "kasus":
                out["reason"] = str(a.get("reason") or "").strip()[:800]
            return out
        text = str(a.get("text") or "").strip()
        if not text:
            raise UserError("Tulis jawabanmu dulu.")
        return {"text": text[:300]}
    if game in ("kilat", "boss"):
        given = str(a.get("given") if a.get("given") is not None else a.get("text") or "").strip()[:300]
        qt = public.get("qtype")
        if qt == "mcq" and given and given not in ("0", "1", "2", "3"):
            raise UserError("Pilihan tidak valid.")
        if qt == "tf" and given and given.lower() not in ("true", "false"):
            raise UserError("Pilihan tidak valid.")
        return {"given": given}
    raise UserError("Jenis game tidak dikenal.")


# ---------------------------------------------------------------- penilai lokal
def _qdict(secret: dict) -> dict:
    return {"answer": secret.get("answer", ""), "keywords": secret.get("keywords") or []}


def grade_local(game: str, public: dict, secret: dict, answer: dict) -> dict:
    """{"skor": float|None, "need_ai": bool, "detail": dict}. skor None = belum bisa dinilai lokal."""
    if game == "ajari":
        return {"skor": None, "need_ai": True, "detail": {}}
    if game == "detektif":
        wrong, taps = set(secret["wrong"]), set(answer["taps"])
        tp, fp = len(taps & wrong), len(taps - wrong)
        skor = max(0.0, min(1.0, (tp - 0.5 * fp) / len(wrong)))
        return {"skor": skor, "need_ai": bool(answer.get("correction")), "detail": {"tp": tp, "fp": fp}}
    if game == "kasus":
        ok = answer["choice_id"] == secret["answer_id"]
        return {"skor": 1.0 if ok else 0.0, "need_ai": bool(answer.get("reason")), "detail": {"pilihan_benar": ok}}
    if game == "petualangan":
        if "choice_id" in answer:
            ok = answer["choice_id"] == secret["answer_id"]
            return {"skor": 1.0 if ok else 0.0, "need_ai": False, "detail": {}}
        verdict = pipeline.grade_short_local(answer["text"], _qdict(secret))
        return {"skor": None if verdict is None else (1.0 if verdict else 0.0), "need_ai": verdict is None, "detail": {}}
    if game in ("kilat", "boss"):
        given, qt = answer["given"], public["qtype"]
        if not given:
            return {"skor": 0.0, "need_ai": False, "detail": {"kosong": True}}
        if qt in ("mcq", "tf"):
            return {"skor": 1.0 if given.lower() == str(secret["answer"]).lower() else 0.0, "need_ai": False, "detail": {}}
        verdict = pipeline.grade_short_local(given, _qdict(secret))
        return {"skor": None if verdict is None else (1.0 if verdict else 0.0), "need_ai": verdict is None, "detail": {}}
    raise UserError("Jenis game tidak dikenal.")


def final_obs(game: str, local: dict, judgement: dict | None, fuzzy_fallback=None) -> float:
    """Skor akhir giliran 0..1. Agent yang memutuskan; skor AI hanya masukan yang di-clamp."""
    ai = judgement["skor"] if judgement and judgement.get("skor", -1) >= 0 else None
    base = local["skor"]
    if game == "ajari":
        return ai if ai is not None else 0.4
    if game == "detektif":
        return 0.7 * base + 0.3 * ai if (local["need_ai"] and ai is not None) else base
    if game == "kasus":
        if not local["need_ai"]:
            return 0.8 * base
        return 0.6 * base + 0.4 * ai if ai is not None else 0.8 * base
    # petualangan / kilat / boss: skor lokal; jawaban ambigu dinilai AI, lalu fallback fuzzy
    if base is not None:
        return base
    if ai is not None:
        return 1.0 if ai >= PASS_OBS else ai
    return 1.0 if (fuzzy_fallback and fuzzy_fallback()) else 0.0


def is_correct(obs: float) -> bool:
    return obs >= PASS_OBS


# ---------------------------------------------------------------- reveal setelah dinilai
def reveal(game: str, public: dict, secret: dict) -> dict:
    if game == "ajari":
        return {"poin_kunci": secret.get("poin_kunci", [])}
    if game == "detektif":
        return {"wrong": secret.get("wrong", []), "benar": secret.get("benar", {})}
    if game == "kasus":
        return {"answer_id": secret.get("answer_id"), "concept": secret.get("concept"), "why": secret.get("why", "")}
    if game == "petualangan":
        if "answer_id" in secret:
            return {"answer_id": secret["answer_id"], "explain": secret.get("explain", "")}
        return {"answer": secret.get("answer"), "explain": secret.get("explain", "")}
    if game in ("kilat", "boss"):
        ans = str(secret.get("answer", ""))
        if public.get("qtype") == "mcq" and ans.isdigit() and int(ans) < len(public.get("options") or []):
            text = public["options"][int(ans)]
        elif public.get("qtype") == "tf":
            text = "Benar" if ans == "true" else "Salah"
        else:
            text = ans
        return {"answer": ans, "answer_text": text, "explanation": secret.get("explanation", "")}
    return {}


# ---------------------------------------------------------------- state (reducer daftar-putih)
def reduce_state(game: str, state: dict, correct: bool, term: str = "", delta: dict | None = None) -> dict:
    """Perubahan state dihitung agent. state_delta dari AI hanya boleh mengubah `location` (kosmetik)."""
    s = dict(state)
    s["combo"] = s.get("combo", 0) + 1 if correct else 0
    s["best_combo"] = max(s.get("best_combo", 0), s["combo"])
    if game == "petualangan":
        s["scene_no"] = s.get("scene_no", 0) + 1
        if not correct:
            s["hp"] = max(0, s.get("hp", 3) - 1)
        elif term and term not in s.get("inventory", []):
            s["inventory"] = (s.get("inventory", []) + [term])[:12]
        loc = _c((delta or {}).get("location"), 60)
        if loc:
            s["location"] = loc
    return s


def is_over(game: str, state: dict) -> bool:
    return game == "petualangan" and state.get("hp", 1) <= 0
