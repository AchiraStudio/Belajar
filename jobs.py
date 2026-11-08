"""Job latar belakang (proses dokumen, buat kuis, penilaian, penjelasan mendalam)."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import config
import db
from common import UserError, jdump, jload
import llm

log = logging.getLogger("jobs")
EXEC = ThreadPoolExecutor(max_workers=config.JOB_WORKERS, thread_name_prefix="job")


class Ctx:
    def __init__(self, job_id: int):
        self.id = job_id

    def update(self, progress: float | None = None, message: str | None = None) -> None:
        sets, vals = ["updated_at=?"], [db.now()]
        if progress is not None:
            sets.append("progress=?")
            vals.append(max(0.0, min(100.0, float(progress))))
        if message is not None:
            sets.append("message=?")
            vals.append(message[:300])
        vals.append(self.id)
        db.run(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", vals)


def start(kind: str, ref_id, fn, **kwargs) -> int:
    ts = db.now()
    job_id = db.run(
        "INSERT INTO jobs(kind,status,progress,message,ref_id,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (kind, "queued", 0, "Menunggu giliran", ref_id, ts, ts),
    )
    EXEC.submit(_run, job_id, fn, kwargs)
    return job_id


def _run(job_id: int, fn, kwargs: dict) -> None:
    ctx = Ctx(job_id)
    db.run("UPDATE jobs SET status='running', message='Memulai', updated_at=? WHERE id=?",
           (db.now(), job_id))
    try:
        result = fn(ctx=ctx, **kwargs) or {}
        db.run("UPDATE jobs SET status='done', progress=100, message='Selesai', result=?, "
               "updated_at=? WHERE id=?", (jdump(result), db.now(), job_id))
    except (UserError, llm.LLMError) as exc:
        log.warning("Job %s gagal: %s", job_id, exc)
        _fail(job_id, str(exc))
    except Exception as exc:  # noqa: BLE001
        log.exception("Job %s error", job_id)
        _fail(job_id, f"Kesalahan internal: {exc.__class__.__name__}")


def _fail(job_id: int, message: str) -> None:
    db.run("UPDATE jobs SET status='failed', error=?, message=?, updated_at=? WHERE id=?",
           (message[:500], message[:300], db.now(), job_id))


def get(job_id: int) -> dict | None:
    r = db.row("SELECT * FROM jobs WHERE id=?", (job_id,))
    if r:
        r["result"] = jload(r.get("result"), {})
    return r


def recover() -> None:
    """Dipanggil saat agent start: tandai job yang terputus sebagai gagal."""
    db.run("UPDATE jobs SET status='failed', error='Agent dihentikan saat memproses', "
           "message='Terputus' WHERE status IN ('queued','running')")
    db.run("UPDATE documents SET status='error', error='Pemrosesan terputus karena agent berhenti. "
           "Tekan Coba lagi.' WHERE status IN ('queued','processing')")
    db.run("UPDATE attempts SET grading='done' WHERE grading='pending'")
    try:
        db.run("UPDATE chat_sessions SET status='error' WHERE status='preparing'")
    except Exception:
        pass
