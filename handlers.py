"""Handler RPC: setiap fungsi dipanggil dari VPS lewat bridge dan mengembalikan dict."""
from __future__ import annotations

import base64
import binascii
import logging
import math
import os
import random
import uuid
from difflib import SequenceMatcher
from pathlib import Path

import config
import db
import extract
import jobs
import llm
import mindmap
import pipeline
import stats
from common import UserError, jdump, jload

log = logging.getLogger("handlers")
HANDLERS: dict = {}


def register(name: str):
    def deco(fn):
        HANDLERS[name] = fn
        return fn
    return deco


# ------------------------------------------------------------------ helper
def need_int(p: dict, key: str, lo: int | None = None, hi: int | None = None) -> int:
    try:
        value = int(p.get(key))
    except (TypeError, ValueError):
        raise UserError(f"Parameter '{key}' tidak valid.")
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        raise UserError(f"Parameter '{key}' di luar batas.")
    return value


def opt_int(p: dict, key: str):
    value = p.get(key)
    if value in (None, "", 0, "0"):
        return None
    return need_int(p, key)


def clip(value, n: int) -> str:
    return str(value or "").strip()[:n]


def public_doc(d: dict) -> dict:
    out = {k: v for k, v in d.items() if k not in ("file_path",)}
    for key in ("key_concepts", "topics"):
        out[key] = jload(out.get(key), [])
    return out


def public_question(q: dict) -> dict:
    return {
        "id": q["id"], "qtype": q["qtype"], "question": q["question"],
        "options": jload(q["options"], []) if q["options"] else None,
        "topic": q["topic"], "source": q["source"], "position": q["position"],
    }


def _doc_row(doc_id: int) -> dict:
    d = db.row("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise UserError("Dokumen tidak ditemukan.")
    return d


# ------------------------------------------------------------------ umum
@register("ping")
def ping(p):
    return {"version": config.VERSION, "time": db.now(), "llm_configured": bool(config.PAF_API_TOKEN)}


@register("llm_check")
def llm_check(p):
    """Cek koneksi gateway. probe_stream=true juga menguji stream DeepSeek (--enable-stream)."""
    return llm.health(probe=bool(p.get("probe_stream")))


@register("get_job")
def get_job(p):
    job = jobs.get(need_int(p, "id"))
    if not job:
        raise UserError("Job tidak ditemukan.")
    return job


@register("get_settings")
def get_settings(p):
    return {"settings": db.all_settings(), "timezone": config.TIMEZONE}


@register("save_settings")
def save_settings(p):
    s = p.get("settings") or {}
    rules = {
        "daily_goal_min": lambda v: str(max(1, min(600, int(float(v))))),
        "weekly_goal_min": lambda v: str(max(10, min(3000, int(float(v))))),
        "notes_style": lambda v: v if v in pipeline.STYLES else (_ for _ in ()).throw(ValueError()),
        "language": lambda v: v if v in ("auto", "id", "en") else (_ for _ in ()).throw(ValueError()),
    }
    for key, fn in rules.items():
        if key in s:
            try:
                db.set_setting(key, fn(s[key]))
            except (TypeError, ValueError):
                raise UserError(f"Nilai '{key}' tidak valid.")
    return {"settings": db.all_settings()}


# ------------------------------------------------------------------ mata pelajaran
@register("list_subjects")
def list_subjects(p):
    return {"subjects": db.rows(
        "SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.subject_id=s.id) AS doc_count "
        "FROM subjects s ORDER BY s.name COLLATE NOCASE")}


@register("create_subject")
def create_subject(p):
    name = clip(p.get("name"), 60)
    if not name:
        raise UserError("Nama mata pelajaran wajib diisi.")
    color = clip(p.get("color"), 9)
    if not (color.startswith("#") and len(color) in (4, 7)):
        color = random.choice(["#4f7cac", "#c0793f", "#5e8c61", "#8a6bb1", "#b8566b", "#3f8f8f"])
    existing = db.row("SELECT * FROM subjects WHERE name=? COLLATE NOCASE", (name,))
    if existing:
        return {"subject": existing}
    sid = db.run("INSERT INTO subjects(name,color,created_at) VALUES(?,?,?)", (name, color, db.now()))
    return {"subject": db.row("SELECT * FROM subjects WHERE id=?", (sid,))}


@register("delete_subject")
def delete_subject(p):
    db.run("DELETE FROM subjects WHERE id=?", (need_int(p, "id"),))
    return {}


# ------------------------------------------------------------------ dokumen
@register("upload_document")
def upload_document(p):
    name = os.path.basename(clip(p.get("filename"), 200).replace("\\", "/")) or "file"
    ext = Path(name).suffix.lower()
    if ext not in extract.SUPPORTED:
        raise UserError("Format tidak didukung. Gunakan PDF, DOCX, PPTX, gambar (PNG/JPG), TXT, atau MD.")
    try:
        blob = base64.b64decode(p.get("data") or "", validate=True)
    except (binascii.Error, ValueError):
        raise UserError("Data file rusak.")
    if not blob:
        raise UserError("File kosong.")
    if len(blob) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise UserError(f"File melebihi {config.MAX_UPLOAD_MB} MB.")

    subject_id = opt_int(p, "subject_id")
    new_subject = clip(p.get("new_subject"), 60)
    if new_subject:
        subject_id = create_subject({"name": new_subject})["subject"]["id"]
    elif subject_id and not db.row("SELECT id FROM subjects WHERE id=?", (subject_id,)):
        raise UserError("Mata pelajaran tidak ditemukan.")

    style = p.get("style") if p.get("style") in pipeline.STYLES else db.get_setting("notes_style", "ringkas")
    title = clip(p.get("title"), 120)
    stored = config.FILES_DIR / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(blob)
    ts = db.now()
    doc_id = db.run(
        "INSERT INTO documents(subject_id,title,title_locked,filename,mime,size,file_path,status,style,"
        "created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (subject_id, title or Path(name).stem[:120], 1 if title else 0, name,
         extract.MIME_BY_EXT.get(ext, "image/*"), len(blob), str(stored), "queued", style, ts, ts),
    )
    job_id = jobs.start("process_document", doc_id, pipeline.process_document, doc_id=doc_id, style=style)
    return {"doc_id": doc_id, "job_id": job_id}


@register("list_documents")
def list_documents(p):
    sql = """
      SELECT d.id, d.subject_id, d.title, d.filename, d.size, d.status, d.error, d.warning,
             d.page_count, d.style, d.created_at, d.updated_at,
             s.name AS subject_name, s.color AS subject_color,
             (SELECT COUNT(*) FROM quizzes z WHERE z.document_id=d.id) AS quiz_count,
             (SELECT id FROM jobs j WHERE j.kind='process_document' AND j.ref_id=d.id ORDER BY j.id DESC LIMIT 1) AS job_id,
             (SELECT progress FROM jobs j WHERE j.kind='process_document' AND j.ref_id=d.id ORDER BY j.id DESC LIMIT 1) AS job_progress,
             (SELECT message FROM jobs j WHERE j.kind='process_document' AND j.ref_id=d.id ORDER BY j.id DESC LIMIT 1) AS job_message
      FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id
    """
    params: list = []
    sid = opt_int(p, "subject_id")
    if sid:
        sql += " WHERE d.subject_id=?"
        params.append(sid)
    sql += " ORDER BY d.created_at DESC"
    return {"documents": db.rows(sql, params)}


@register("get_document")
def get_document(p):
    doc_id = need_int(p, "id")
    doc = _doc_row(doc_id)
    subject = db.row("SELECT id,name,color FROM subjects WHERE id=?", (doc["subject_id"],)) if doc["subject_id"] else None
    note = db.row("SELECT content_md, edited, version, updated_at FROM notes WHERE document_id=?", (doc_id,))
    quizzes = db.rows("""
      SELECT z.id, z.title, z.difficulty, z.created_at,
             (SELECT COUNT(*) FROM questions q WHERE q.quiz_id=z.id) AS question_count,
             (SELECT COUNT(*) FROM attempts t WHERE t.quiz_id=z.id AND t.finished_at IS NOT NULL) AS attempt_count,
             (SELECT MAX(100.0*t.score/t.total) FROM attempts t WHERE t.quiz_id=z.id AND t.finished_at IS NOT NULL AND t.total>0) AS best_pct,
             (SELECT 100.0*t.score/t.total FROM attempts t WHERE t.quiz_id=z.id AND t.finished_at IS NOT NULL AND t.total>0 ORDER BY t.finished_at DESC LIMIT 1) AS last_pct
      FROM quizzes z WHERE z.document_id=? ORDER BY z.created_at DESC""", (doc_id,))
    for z in quizzes:
        for k in ("best_pct", "last_pct"):
            if z[k] is not None:
                z[k] = round(z[k])
    job = db.row("SELECT id, status, progress, message, error FROM jobs WHERE kind='process_document' "
                 "AND ref_id=? ORDER BY id DESC LIMIT 1", (doc_id,))
    return {"document": public_doc(doc), "subject": subject, "note": note, "quizzes": quizzes, "job": job}


@register("update_document")
def update_document(p):
    doc_id = need_int(p, "id")
    _doc_row(doc_id)
    if "title" in p:
        title = clip(p.get("title"), 120)
        if not title:
            raise UserError("Judul tidak boleh kosong.")
        db.run("UPDATE documents SET title=?, title_locked=1, updated_at=? WHERE id=?", (title, db.now(), doc_id))
    if "subject_id" in p:
        sid = opt_int(p, "subject_id")
        if sid and not db.row("SELECT id FROM subjects WHERE id=?", (sid,)):
            raise UserError("Mata pelajaran tidak ditemukan.")
        db.run("UPDATE documents SET subject_id=?, updated_at=? WHERE id=?", (sid, db.now(), doc_id))
    return {}


@register("delete_document")
def delete_document(p):
    doc_id = need_int(p, "id")
    doc = _doc_row(doc_id)
    db.run("DELETE FROM documents WHERE id=?", (doc_id,))
    if doc["file_path"]:
        try:
            Path(doc["file_path"]).unlink()
        except OSError:
            pass
    return {}


@register("reprocess_document")
def reprocess_document(p):
    """Coba lagi bagian yang gagal (default), atau buat ulang semua catatan dengan gaya baru."""
    doc_id = need_int(p, "id")
    doc = _doc_row(doc_id)
    if doc["status"] in ("queued", "processing"):
        raise UserError("Dokumen sedang diproses.")
    style = p.get("style") if p.get("style") in pipeline.STYLES else None
    force = bool(p.get("force")) or (style is not None and style != doc["style"])
    reextract = bool(p.get("reextract"))
    db.run("UPDATE documents SET status='queued', error=NULL, updated_at=? WHERE id=?", (db.now(), doc_id))
    job_id = jobs.start("process_document", doc_id, pipeline.process_document,
                        doc_id=doc_id, style=style, force=force, reextract=reextract)
    return {"job_id": job_id}


@register("save_note")
def save_note(p):
    doc_id = need_int(p, "document_id")
    _doc_row(doc_id)
    content = str(p.get("content_md") or "")
    if len(content) > 600_000:
        raise UserError("Catatan terlalu panjang.")
    db.run(
        "INSERT INTO notes(document_id,content_md,edited,version,updated_at) VALUES(?,?,1,1,?) "
        "ON CONFLICT(document_id) DO UPDATE SET content_md=excluded.content_md, edited=1, "
        "updated_at=excluded.updated_at", (doc_id, content, db.now()))
    return {}


@register("log_study")
def log_study(p):
    seconds = max(1, min(120, need_int(p, "seconds")))
    doc_id = opt_int(p, "document_id")
    if doc_id and not db.row("SELECT id FROM documents WHERE id=?", (doc_id,)):
        doc_id = None
    stats.log_event("read", doc_id, seconds=seconds)
    return {"streak": stats.streak_info()}


# ------------------------------------------------------------------ kuis
@register("generate_quiz")
def generate_quiz(p):
    document_id = opt_int(p, "document_id")
    subject_id = opt_int(p, "subject_id")
    if not document_id and not subject_id:
        raise UserError("Pilih dokumen atau mata pelajaran.")
    if document_id and _doc_row(document_id)["status"] == "processing":
        raise UserError("Dokumen masih diproses.")
    types = p.get("types") if isinstance(p.get("types"), list) else ["mcq", "tf"]
    job_id = jobs.start(
        "generate_quiz", document_id or subject_id, pipeline.generate_quiz,
        document_id=document_id, subject_id=None if document_id else subject_id,
        count=need_int(p, "count", 1, 40) if p.get("count") else 10,
        difficulty=p.get("difficulty") or "mixed", types=types,
        quality="high" if p.get("quality") == "high" else "normal", title=clip(p.get("title"), 120) or None)
    return {"job_id": job_id}


@register("list_quizzes")
def list_quizzes(p):
    sql = """
      SELECT z.id, z.title, z.difficulty, z.created_at, z.document_id,
             COALESCE(d.title, s.name) AS source_title,
             (SELECT COUNT(*) FROM questions q WHERE q.quiz_id=z.id) AS question_count,
             (SELECT COUNT(*) FROM attempts t WHERE t.quiz_id=z.id AND t.finished_at IS NOT NULL) AS attempt_count,
             (SELECT 100.0*t.score/t.total FROM attempts t WHERE t.quiz_id=z.id AND t.finished_at IS NOT NULL AND t.total>0 ORDER BY t.finished_at DESC LIMIT 1) AS last_pct
      FROM quizzes z LEFT JOIN documents d ON d.id=z.document_id LEFT JOIN subjects s ON s.id=z.subject_id
      ORDER BY z.created_at DESC LIMIT 100"""
    quizzes = db.rows(sql)
    for z in quizzes:
        if z["last_pct"] is not None:
            z["last_pct"] = round(z["last_pct"])
    return {"quizzes": quizzes}


@register("delete_quiz")
def delete_quiz(p):
    db.run("DELETE FROM quizzes WHERE id=?", (need_int(p, "id"),))
    return {}


def _questions_by_ids(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    by_id = {q["id"]: q for q in db.rows(f"SELECT * FROM questions WHERE id IN ({marks})", ids)}
    return [by_id[i] for i in ids if i in by_id]


def _new_attempt(quiz_id, mode: str, qids: list[int], time_limit) -> dict:
    attempt_id = db.run(
        "INSERT INTO attempts(quiz_id,mode,question_ids,time_limit,started_at) VALUES(?,?,?,?,?)",
        (quiz_id, mode, jdump(qids), time_limit, db.now()))
    return get_attempt({"attempt_id": attempt_id})


@register("start_attempt")
def start_attempt(p):
    quiz_id = need_int(p, "quiz_id")
    quiz = db.row("SELECT id FROM quizzes WHERE id=?", (quiz_id,))
    if not quiz:
        raise UserError("Kuis tidak ditemukan.")
    mode = "exam" if p.get("mode") == "exam" else "practice"
    qids = [r["id"] for r in db.rows("SELECT id FROM questions WHERE quiz_id=? ORDER BY position", (quiz_id,))]
    if not qids:
        raise UserError("Kuis ini belum memiliki soal.")
    if p.get("shuffle"):
        random.shuffle(qids)
    limit = None
    if mode == "exam":
        minutes = need_int(p, "time_limit_min", 1, 240) if p.get("time_limit_min") else max(1, math.ceil(len(qids) * 1.0))
        limit = minutes * 60
    return _new_attempt(quiz_id, mode, qids, limit)


@register("start_review")
def start_review(p):
    count = need_int(p, "count", 1, 40) if p.get("count") else 10
    qids = stats.weak_question_ids(opt_int(p, "subject_id"), limit=count)
    if not qids:
        raise UserError("Belum ada soal lemah. Kerjakan kuis dulu, soal yang salah akan masuk ke sini.")
    random.shuffle(qids)
    return _new_attempt(None, "review", qids, None)


def _grade_basic(q: dict, given) -> bool | None:
    if given is None or str(given).strip() == "":
        return False
    if q["qtype"] in ("mcq", "tf"):
        return str(given).strip().lower() == str(q["answer"]).lower()
    return pipeline.grade_short_local(str(given), q)


def _reveal(q: dict, a: dict | None) -> dict:
    out = {
        "answer": q["answer"], "answer_text": pipeline.answer_text(q, q["answer"]),
        "explanation": q["explanation"], "deep_explanation": q["deep_explanation"],
        "correct": None if a is None else (None if a["correct"] is None else bool(a["correct"])),
        "feedback": a["feedback"] if a else None,
    }
    if q["qtype"] == "mcq" and a and a["given"] not in (None, ""):
        out["given_text"] = pipeline.answer_text(q, a["given"])
    return out


@register("get_attempt")
def get_attempt(p):
    attempt_id = need_int(p, "attempt_id")
    t = db.row("SELECT * FROM attempts WHERE id=?", (attempt_id,))
    if not t:
        raise UserError("Percobaan kuis tidak ditemukan.")
    qids = jload(t["question_ids"], [])
    questions = _questions_by_ids(qids)
    answers = {a["question_id"]: a for a in db.rows("SELECT * FROM answers WHERE attempt_id=?", (attempt_id,))}
    finished = t["finished_at"] is not None
    items = []
    for q in questions:
        item = public_question(q)
        a = answers.get(q["id"])
        if a:
            item["given"] = a["given"]
        if finished or (t["mode"] != "exam" and a):
            item.update(_reveal(q, a))
            item["revealed"] = True
        items.append(item)
    title = "Ulangi soal lemah"
    if t["quiz_id"]:
        z = db.row("SELECT title, document_id FROM quizzes WHERE id=?", (t["quiz_id"],))
        title = z["title"] if z else "Kuis"
    attempt = {k: t[k] for k in ("id", "quiz_id", "mode", "time_limit", "started_at", "finished_at",
                                 "score", "total", "duration", "grading", "grading_job")}
    attempt["title"] = title
    return {"attempt": attempt, "questions": items}


@register("check_answer")
def check_answer(p):
    attempt_id, qid = need_int(p, "attempt_id"), need_int(p, "question_id")
    t = db.row("SELECT * FROM attempts WHERE id=?", (attempt_id,))
    if not t or t["finished_at"] is not None:
        raise UserError("Percobaan kuis sudah selesai atau tidak ditemukan.")
    if t["mode"] == "exam":
        raise UserError("Mode ujian tidak menampilkan jawaban sebelum selesai.")
    if qid not in jload(t["question_ids"], []):
        raise UserError("Soal bukan bagian dari percobaan ini.")
    q = db.row("SELECT * FROM questions WHERE id=?", (qid,))
    existing = db.row("SELECT * FROM answers WHERE attempt_id=? AND question_id=?", (attempt_id, qid))
    if not existing:
        given = str(p.get("given", ""))[:500]
        verdict = _grade_basic(q, given)
        db.run("INSERT INTO answers(attempt_id,question_id,given,correct,graded_by,ts) VALUES(?,?,?,?,?,?)",
               (attempt_id, qid, given, None if verdict is None else int(verdict),
                "auto" if verdict is not None else "pending", db.now()))
        existing = db.row("SELECT * FROM answers WHERE attempt_id=? AND question_id=?", (attempt_id, qid))
    return _reveal(q, existing)


def _fuzzy_fallback(q: dict, given: str) -> bool:
    g, a = pipeline._norm(given), pipeline._norm(q["answer"])
    if SequenceMatcher(None, g, a).ratio() >= 0.6:
        return True
    kws = [pipeline._norm(k) for k in (jload(q["keywords"], []) or []) if pipeline._norm(k)]
    return bool(kws) and sum(1 for k in kws if k in g) * 2 >= len(kws)


def _recompute(attempt_id: int) -> None:
    score = db.scalar("SELECT COUNT(*) FROM answers WHERE attempt_id=? AND correct=1", (attempt_id,))
    db.run("UPDATE attempts SET score=? WHERE id=?", (score, attempt_id))


def grade_attempt_job(ctx, attempt_id: int) -> dict:
    ctx.update(10, "Menilai jawaban isian")
    pending = db.rows("SELECT a.id, a.question_id, a.given FROM answers a WHERE a.attempt_id=? "
                      "AND a.correct IS NULL AND a.given IS NOT NULL AND a.given != ''", (attempt_id,))
    qs = {q["id"]: q for q in _questions_by_ids([a["question_id"] for a in pending])}
    items = [{"id": a["id"], "question": qs[a["question_id"]]["question"],
              "kunci": qs[a["question_id"]]["answer"], "jawaban": a["given"]} for a in pending]
    verdicts: dict = {}
    source = "ai"
    try:
        if items:
            verdicts = pipeline.grade_short_ai(items)
    except llm.LLMError as exc:
        log.warning("Penilaian AI gagal, pakai pencocokan kasar: %s", exc)
        source = "fuzzy"
    for a in pending:
        q = qs[a["question_id"]]
        if a["id"] in verdicts:
            ok, feedback = verdicts[a["id"]]
            by = "ai"
        else:
            ok, feedback, by = _fuzzy_fallback(q, a["given"]), "Dinilai otomatis tanpa AI.", "fuzzy"
        db.run("UPDATE answers SET correct=?, feedback=?, graded_by=? WHERE id=?",
               (int(ok), feedback, by if source == "ai" else "fuzzy", a["id"]))
    db.run("UPDATE answers SET correct=0, graded_by='skip' WHERE attempt_id=? AND correct IS NULL", (attempt_id,))
    _recompute(attempt_id)
    db.run("UPDATE attempts SET grading='done' WHERE id=?", (attempt_id,))
    return {"graded": len(pending), "source": source}


@register("finish_attempt")
def finish_attempt(p):
    attempt_id = need_int(p, "attempt_id")
    t = db.row("SELECT * FROM attempts WHERE id=?", (attempt_id,))
    if not t:
        raise UserError("Percobaan kuis tidak ditemukan.")
    if t["finished_at"] is not None:
        return get_attempt({"attempt_id": attempt_id})

    qids = jload(t["question_ids"], [])
    provided = p.get("answers") if isinstance(p.get("answers"), dict) else {}
    have = {a["question_id"]: a for a in db.rows("SELECT * FROM answers WHERE attempt_id=?", (attempt_id,))}
    answered = 0
    for q in _questions_by_ids(qids):
        if q["id"] in have:
            if have[q["id"]]["given"] not in (None, ""):
                answered += 1
            continue
        given = provided.get(str(q["id"]))
        given = None if given is None else str(given)[:500]
        if given not in (None, ""):
            answered += 1
        verdict = _grade_basic(q, given)
        db.run("INSERT INTO answers(attempt_id,question_id,given,correct,graded_by,ts) VALUES(?,?,?,?,?,?)",
               (attempt_id, q["id"], given, None if verdict is None else int(verdict),
                "skip" if not given else ("auto" if verdict is not None else "pending"), db.now()))

    now = db.now()
    try:
        claimed = max(0, int(p.get("duration") or 0))
    except (TypeError, ValueError):
        claimed = 0
    duration = int(min(claimed or (now - t["started_at"]), now - t["started_at"] + 2, 6 * 3600))
    uncertain = db.scalar("SELECT COUNT(*) FROM answers WHERE attempt_id=? AND correct IS NULL AND given != ''",
                          (attempt_id,))
    db.run("UPDATE attempts SET finished_at=?, total=?, duration=?, grading=? WHERE id=?",
           (now, len(qids), duration, "pending" if uncertain else "done", attempt_id))
    db.run("UPDATE answers SET correct=0, graded_by='skip' WHERE attempt_id=? AND correct IS NULL "
           "AND (given IS NULL OR given='')", (attempt_id,))
    _recompute(attempt_id)
    if uncertain:
        job_id = jobs.start("grade_attempt", attempt_id, grade_attempt_job, attempt_id=attempt_id)
        db.run("UPDATE attempts SET grading_job=? WHERE id=?", (job_id, attempt_id))

    doc_id = None
    if t["quiz_id"]:
        z = db.row("SELECT document_id FROM quizzes WHERE id=?", (t["quiz_id"],))
        doc_id = z["document_id"] if z else None
    counts_for_streak = answered >= min(3, len(qids))
    stats.log_event("quiz", doc_id, seconds=min(duration, 3600), quizzes=1 if counts_for_streak else 0)
    return get_attempt({"attempt_id": attempt_id})


@register("explain_question")
def explain_question(p):
    qid = need_int(p, "question_id")
    q = db.row("SELECT deep_explanation FROM questions WHERE id=?", (qid,))
    if not q:
        raise UserError("Soal tidak ditemukan.")
    if q["deep_explanation"]:
        return {"cached": True, "text": q["deep_explanation"]}
    job_id = jobs.start("explain", qid, pipeline.explain_question, question_id=qid,
                        attempt_id=opt_int(p, "attempt_id"))
    return {"cached": False, "job_id": job_id}


# ------------------------------------------------------------------ dashboard & progres
@register("dashboard")
def dashboard(p):
    recent_docs = db.rows("""
      SELECT d.id, d.title, d.status, d.page_count, d.updated_at, s.name AS subject_name, s.color AS subject_color
      FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id
      ORDER BY d.updated_at DESC LIMIT 6""")
    topics = stats.topic_stats()
    return {
        "streak": stats.streak_info(),
        "heatmap": stats.heatmap(140),
        "weekly": stats.weekly(),
        "overall": stats.overall(),
        "recent_docs": recent_docs,
        "recent_attempts": list(reversed(stats.score_trend(5))),
        "weak_topics": [t for t in topics if t["level"] == "weak"][:4],
        "weak_count": len(stats.weak_question_ids()),
    }


@register("progress")
def progress(p):
    topics = stats.topic_stats()
    return {
        "overall": stats.overall(),
        "streak": stats.streak_info(),
        "weekly": stats.weekly(),
        "trend": stats.score_trend(30),
        "topics": topics,
        "documents": stats.document_stats(),
        "study_days": stats.study_days(14),
        "weak_count": len(stats.weak_question_ids()),
        "settings": db.all_settings(),
    }


# ------------------------------------------------------------------ chat per dokumen
@register("chat_start")
def chat_start(p):
    """Mulai atau lanjutkan sesi chat untuk satu dokumen.

    Mode NEW : sesi belum ada → buat baru, jalankan job persiapan konteks.
    Mode CONTINUE: sesi sudah ada → kembalikan riwayat langsung.
    """
    import chat as _chat
    doc_id = need_int(p, "document_id")
    doc = _doc_row(doc_id)

    if doc["status"] != "ready":
        raise UserError("Dokumen belum selesai diproses. Tunggu hingga catatan siap.")

    existing = db.row("SELECT * FROM chat_sessions WHERE document_id=?", (doc_id,))
    if existing and existing["status"] in ("ready", "preparing"):
        messages = db.rows(
            "SELECT id, role, content, ts FROM chat_messages "
            "WHERE session_id=? ORDER BY ts ASC",
            (existing["id"],),
        )
        return {
            "session": _chat.public_session(existing),
            "document": {"id": doc["id"], "title": doc["title"]},
            "messages": messages,
            "mode": "continue",
        }

    # Jika sesi sebelumnya berstatus error, hapus dulu agar bersih
    if existing:
        _chat.delete_session(existing["id"])

    # Buat sesi baru (mode NEW)
    ts = db.now()
    session_id = db.run(
        "INSERT INTO chat_sessions(document_id, status, created_at, updated_at) "
        "VALUES(?,?,?,?)",
        (doc_id, "preparing", ts, ts),
    )
    job_id = jobs.start(
        "prepare_chat", session_id, _chat.prepare_session,
        session_id=session_id, doc_id=doc_id,
    )
    session = db.row("SELECT * FROM chat_sessions WHERE id=?", (session_id,))
    return {
        "session": _chat.public_session(session),
        "document": {"id": doc["id"], "title": doc["title"]},
        "messages": [],
        "mode": "new",
        "job_id": job_id,
    }


@register("chat_get")
def chat_get(p):
    """Ambil status sesi dan seluruh riwayat pesan."""
    import chat as _chat
    session_id = need_int(p, "session_id")
    session = db.row("SELECT * FROM chat_sessions WHERE id=?", (session_id,))
    if not session:
        raise UserError("Sesi chat tidak ditemukan.")
    doc = db.row("SELECT id, title FROM documents WHERE id=?", (session["document_id"],))
    messages = db.rows(
        "SELECT id, role, content, ts FROM chat_messages "
        "WHERE session_id=? ORDER BY ts ASC",
        (session_id,),
    )
    return {
        "session": _chat.public_session(session),
        "document": {"id": doc["id"], "title": doc["title"]} if doc else None,
        "messages": messages,
    }


@register("chat_send")
def chat_send(p):
    """Kirim pesan pengguna dalam sesi chat dan kembalikan jawaban AI."""
    import chat as _chat
    session_id = need_int(p, "session_id")
    message = str(p.get("message") or "").strip()
    if not message:
        raise UserError("Pesan tidak boleh kosong.")
    if len(message) > 5000:
        raise UserError("Pesan terlalu panjang (maks 5.000 karakter).")
    on_chunk = p.get("_on_chunk")
    response = _chat.send_message(session_id, message, on_chunk=on_chunk)
    messages = db.rows(
        "SELECT id, role, content, ts FROM chat_messages "
        "WHERE session_id=? ORDER BY ts ASC",
        (session_id,),
    )
    return {"response": response, "messages": messages}


@register("chat_delete")
def chat_delete(p):
    """Hapus sesi chat (beserta semua pesan) dan bebaskan sesi di gateway PAF."""
    import chat as _chat
    session_id = need_int(p, "session_id")
    if not db.row("SELECT id FROM chat_sessions WHERE id=?", (session_id,)):
        raise UserError("Sesi chat tidak ditemukan.")
    _chat.delete_session(session_id)
    return {}


# ------------------------------------------------------------------ panel tanya pada catatan
@register("notes_ask")
def notes_ask(p):
    """Panel Tanya: injeksi konteks materi (mode NEW) pada pertanyaan pertama, lalu
    mode CONTINUE pada sesi gateway yang sama untuk semua pertanyaan berikutnya."""
    doc = _doc_row(need_int(p, "document_id"))
    quote = str(p.get("quote") or "").strip()
    question = str(p.get("question") or "").strip()
    if not quote:
        raise UserError("Teks yang dipertanyakan tidak boleh kosong.")
    if not question:
        raise UserError("Pertanyaan tidak boleh kosong.")
    ask_id = opt_int(p, "ask_session_id")
    row = db.row("SELECT gateway_session_id FROM ask_sessions WHERE id=?", (ask_id,)) if ask_id else None
    answer, new_id, sid, mode = pipeline.ask_notes(
        doc, quote, question,
        gateway_session_id=(row["gateway_session_id"] if row else None),
        on_chunk=p.get("_on_chunk"))
    if new_id:
        ask_id = new_id
    elif ask_id:
        db.run("UPDATE ask_sessions SET updated_at=? WHERE id=?", (db.now(), ask_id))
    return {"answer": answer, "ask_session_id": ask_id, "mode": mode}


@register("notes_ask_delete")
def notes_ask_delete(p):
    """Tutup sesi panel Tanya: bebaskan sesi di gateway PAF lalu hapus barisnya."""
    ask_id = need_int(p, "ask_session_id")
    row = db.row("SELECT gateway_session_id FROM ask_sessions WHERE id=?", (ask_id,))
    if row and row["gateway_session_id"]:
        try:
            llm.delete_session(row["gateway_session_id"])
        except Exception:
            pass
    db.run("DELETE FROM ask_sessions WHERE id=?", (ask_id,))
    return {}
# ---------------------------------------------------------------- mind map catatan
def _mindmap_job(doc_id: int):
    return db.row("SELECT id, status, progress, message, error FROM jobs WHERE kind='generate_mindmap' "
                  "AND ref_id=? ORDER BY id DESC LIMIT 1", (doc_id,))


@register("mindmap_get")
def mindmap_get(p):
    """Mind map tersimpan (bila ada) + status job terakhir, supaya UI bisa polling."""
    doc_id = need_int(p, "document_id")
    _doc_row(doc_id)
    return {"mindmap": mindmap.get(doc_id), "job": _mindmap_job(doc_id)}


@register("mindmap_generate")
def mindmap_generate(p):
    """Buat (atau buat ulang) mind map dari catatan materi sebagai job latar belakang."""
    doc_id = need_int(p, "document_id")
    doc = _doc_row(doc_id)
    if doc["status"] != "ready":
        raise UserError("Materi belum selesai diproses.")
    if not db.scalar("SELECT COUNT(*) FROM notes WHERE document_id=?", (doc_id,)):
        raise UserError("Catatan belum tersedia, mind map belum bisa dibuat.")
    running = _mindmap_job(doc_id)
    if running and running["status"] in ("queued", "running"):
        return {"job_id": running["id"], "already_running": True}
    job_id = jobs.start("generate_mindmap", doc_id, mindmap.generate, doc_id=doc_id)
    return {"job_id": job_id}


@register("mindmap_delete")
def mindmap_delete(p):
    doc_id = need_int(p, "document_id")
    _doc_row(doc_id)
    db.run("DELETE FROM mindmaps WHERE document_id=?", (doc_id,))
    return {}


import cards  # noqa: E402,F401  (mendaftarkan handler kartu; letakkan paling bawah)
import concepts  # noqa: E402,F401
import play  # noqa: E402,F401
