from __future__ import annotations

import json


class UserError(Exception):
    """Kesalahan yang pesannya aman ditampilkan ke pengguna."""


def jdump(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def jload(text, default=None):
    if text in (None, ""):
        return default
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default


def clamp(value, lo: int, hi: int, default: int = 0) -> int:
    """Ubah ke int lalu batasi ke [lo, hi]; nilai tak valid memakai `default`."""
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


def clamp01(value, default: float = 0.0) -> float:
    """Batasi angka ke [0, 1]. Dipakai untuk skor yang berasal dari keluaran AI (tak tepercaya)."""
    try:
        x = float(value)
    except (TypeError, ValueError):
        return default
    if x != x:  # NaN
        return default
    return max(0.0, min(1.0, x))


def doc_ids(document_id=None, subject_id=None) -> list[int]:
    """Id dokumen berstatus 'ready' menurut cakupan: satu dokumen, satu mapel, atau semuanya."""
    import db  # impor lokal: common dipakai juga oleh modul yang tidak butuh DB
    if document_id:
        return [document_id]
    if subject_id:
        return [r["id"] for r in db.rows(
            "SELECT id FROM documents WHERE subject_id=? AND status='ready'", (subject_id,))]
    return [r["id"] for r in db.rows("SELECT id FROM documents WHERE status='ready'")]


def source(document_id=None, subject_id=None) -> dict:
    """Deskripsi cakupan {kind, id, title} untuk ditampilkan ke pengguna."""
    import db
    if document_id:
        d = db.row("SELECT id, title FROM documents WHERE id=?", (document_id,))
        if not d:
            raise UserError("Dokumen tidak ditemukan.")
        return {"kind": "document", "id": d["id"], "title": d["title"]}
    if subject_id:
        s = db.row("SELECT id, name FROM subjects WHERE id=?", (subject_id,))
        if not s:
            raise UserError("Mata pelajaran tidak ditemukan.")
        return {"kind": "subject", "id": s["id"], "title": s["name"]}
    return {"kind": "all", "id": None, "title": "Semua materi"}
