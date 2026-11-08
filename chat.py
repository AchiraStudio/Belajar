"""Sesi tanya-jawab per dokumen menggunakan model DeepSeek (fallback Qwen).

Alur Gateway PAF-Model:
  - Sesi baru (mode NEW): Konteks dirangkai dari metadata dan catatan dokumen,
    lalu dikirim ke gateway dalam mode 'new'. Gateway DeepSeek menyimpan sesi
    dan mengembalikan gateway_session_id (X-Session-ID). Status: preparing -> ready.
  - Sesi berjalan (mode CONTINUE & STREAM): Pesan pertanyaan siswa dikirim ke gateway
    menggunakan gateway_session_id, mode 'continue', dan stream=True (SSE). DeepSeek langsung
    melanjutkan percakapan menggunakan konteks yang sudah tersimpan tanpa perlu re-injeksi konteks.
  - Hapus sesi: Gateway session dibersihkan melalui DELETE /v1/sessions/{id}.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Callable

import config
import db
import llm
import sanitize
from common import UserError, jload

log = logging.getLogger("chat")

# ── batas ────────────────────────────────────────────────────────────────────
MAX_CONTEXT_CHARS = 16_000   # maks teks catatan yang disertakan saat inisialisasi NEW


# ── helper ────────────────────────────────────────────────────────────────────
def _lang_rule() -> str:
    """Ambil aturan bahasa dari pengaturan (sama dengan pipeline.lang_rule)."""
    lang = db.get_setting("language", "auto")
    if lang == "id":
        return "Tulis dalam Bahasa Indonesia (pertahankan istilah teknis dalam bahasa aslinya bila lazim)."
    if lang == "en":
        return "Write in English."
    return ("Gunakan bahasa yang sama dengan materi. Jika bercampur, pakai Bahasa Indonesia "
            "dan pertahankan istilah teknis dalam bahasa aslinya.")


def _build_context_data(doc_id: int) -> dict:
    """Rangkai metadata + catatan dokumen menjadi dict context."""
    doc = db.row("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not doc:
        raise UserError("Dokumen tidak ditemukan.")

    title = sanitize.clean_inline((doc["title"] or "Materi")[:120], one_line=True)
    summary = sanitize.clean_md((doc["summary"] or "(ringkasan belum tersedia)")[:600])

    concepts_list = jload(doc["key_concepts"], [])
    concepts_text = "\n".join(
        f"- **{c['term']}**: {c.get('definition', '')}"
        for c in (concepts_list or [])
        if isinstance(c, dict) and c.get("term")
    ) or "(belum tersedia)"

    chunks = db.rows(
        "SELECT label, note_md FROM chunks WHERE document_id=? ORDER BY idx",
        (doc_id,),
    )

    notes_parts: list[str] = []
    total = 0
    for chunk in chunks:
        note = sanitize.clean_md((chunk.get("note_md") or "").strip())
        if not note:
            continue
        piece = f"[{chunk['label']}]\n{note}"
        left = MAX_CONTEXT_CHARS - total
        if left <= 0:
            notes_parts.append(f"[{chunk['label']}]\n_(dihilangkan karena batas konteks)_")
            continue
        if len(piece) > left:
            piece = piece[:left] + "\n...(terpotong)"
        notes_parts.append(piece)
        total += len(piece)

    notes_text = "\n\n".join(notes_parts) if notes_parts else "(catatan belum tersedia)"

    return {
        "title": title,
        "summary": summary,
        "concepts": concepts_text,
        "notes": notes_text,
    }


# ── pekerjaan latar belakang: inisialisasi mode NEW ──────────────────────────
def prepare_session(ctx, session_id: int, doc_id: int) -> dict:
    """Job latar belakang: merangkai konteks materi dan menginjeksi ke DeepSeek (mode NEW)."""
    ctx.update(10, "Memeriksa dokumen")

    doc = db.row("SELECT status FROM documents WHERE id=?", (doc_id,))
    if not doc:
        db.run(
            "UPDATE chat_sessions SET status='error', updated_at=? WHERE id=?",
            (db.now(), session_id),
        )
        raise UserError("Dokumen tidak ditemukan.")

    if doc["status"] != "ready":
        db.run(
            "UPDATE chat_sessions SET status='error', updated_at=? WHERE id=?",
            (db.now(), session_id),
        )
        raise UserError(
            "Dokumen belum selesai diproses. Tunggu hingga catatan siap, lalu buka chat lagi."
        )

    ctx.update(35, "Merangkai konteks materi dari catatan")

    try:
        ctx_data = _build_context_data(doc_id)
    except Exception:
        db.run(
            "UPDATE chat_sessions SET status='error', updated_at=? WHERE id=?",
            (db.now(), session_id),
        )
        raise

    ctx.update(50, "Menginjeksi konteks ke DeepSeek (mode NEW)")

    context_prompt = (
        f"Kamu adalah tutor AI untuk materi pembelajaran: \"{ctx_data['title']}\".\n\n"
        f"Berikut adalah seluruh konteks materi yang harus kamu pelajari dan pahami untuk sesi belajar ini:\n\n"
        f"RINGKASAN MATERI:\n{ctx_data['summary']}\n\n"
        f"KONSEP KUNCI:\n{ctx_data['concepts']}\n\n"
        f"CATATAN LENGKAP MATERI:\n<<<MATERI\n{ctx_data['notes']}\nMATERI>>>\n\n"
        f"Aturan:\n"
        f"- {_lang_rule()}\n"
        f"- Jawab pertanyaan siswa berdasarkan konteks materi di atas secara akurat, ramah, dan mendalam.\n"
        f"- Format penjelasan menggunakan Markdown yang rapi (tebal, daftar, rumus LaTeX bila perlu).\n"
        f"- Keluarkan teks Markdown biasa: bukan JSON, tanpa membungkus seluruh jawaban dalam blok kode, "
        f"dan tanpa penanda baris baru literal seperti \\n — gunakan baris baru sungguhan.\n"
        f"- Sesi ini adalah sesi baru (mode NEW) untuk persiapan konteks materi.\n\n"
        f"Instruksi respon pembuka: Berikan sapaan pembuka ramah (2-3 kalimat) yang menyatakan "
        f"bahwa kamu sudah memahami seluruh materi \"{ctx_data['title']}\" dan siap membantu menjawab pertanyaan siswa."
    )

    try:
        greeting, gateway_sid = llm.chat_call(prompt=context_prompt, gateway_session_id=None, mode="new", stream=False)
    except Exception as exc:
        log.exception("Injeksi konteks chat gagal: %s", exc)
        db.run(
            "UPDATE chat_sessions SET status='error', updated_at=? WHERE id=?",
            (db.now(), session_id),
        )
        raise
    greeting = sanitize.clean_md(greeting)

    ctx.update(90, "Menyimpan sesi dan konteks")

    now = db.now()
    db.run(
        "UPDATE chat_sessions SET status='ready', gateway_session_id=?, context_md=?, updated_at=? WHERE id=?",
        (gateway_sid, json.dumps(ctx_data, ensure_ascii=False), now, session_id),
    )

    if greeting:
        db.run(
            "INSERT INTO chat_messages(session_id, role, content, ts) VALUES(?,?,?,?)",
            (session_id, "assistant", greeting, now),
        )

    ctx.update(100, "Sesi siap (mode CONTINUE & STREAM aktif)")
    log.info("Sesi chat %d siap (doc %d, gateway_sid %s)", session_id, doc_id, gateway_sid)
    return {"session_id": session_id, "gateway_session_id": gateway_sid}


# ── kirim pesan: mode CONTINUE + STREAM ───────────────────────────────────────
def send_message(session_id: int, user_message: str, on_chunk: Callable[[str], None] | None = None) -> str:
    """Kirim pertanyaan siswa ke DeepSeek dalam mode CONTINUE (dengan streaming SSE) dan simpan percakapan."""
    session = db.row("SELECT * FROM chat_sessions WHERE id=?", (session_id,))
    if not session:
        raise UserError("Sesi chat tidak ditemukan.")
    if session["status"] == "preparing":
        raise UserError("Sesi chat masih dipersiapkan. Tunggu sebentar lalu coba lagi.")
    if session["status"] == "error":
        raise UserError("Sesi chat gagal dipersiapkan. Hapus dan buat sesi baru.")
    if session["status"] != "ready":
        raise UserError("Sesi chat tidak dalam kondisi siap.")

    gateway_sid = session["gateway_session_id"]
    mode = "continue" if gateway_sid else "new"

    # Jika gateway_sid ada, DeepSeek sudah memiliki seluruh konteks dari sesi sebelumnya (CONTINUE mode)
    if gateway_sid:
        prompt = user_message[:3000]
    else:
        # Fallback cadangan jika gateway_sid hilang: sertakan ringkasan materi
        try:
            ctx_data: dict = json.loads(session["context_md"] or "{}")
        except (ValueError, TypeError):
            ctx_data = {}
        prompt = (
            f"KONTEKS MATERI: {ctx_data.get('title', 'Materi')}\n"
            f"{ctx_data.get('summary', '')}\n\n"
            f"PERTANYAAN: {user_message[:3000]}"
        )

    response, new_sid = llm.chat_call(prompt=prompt, gateway_session_id=gateway_sid, mode=mode, stream=True, on_chunk=on_chunk)
    response = sanitize.clean_md(response)

    now = db.now()
    if new_sid and new_sid != gateway_sid:
        db.run("UPDATE chat_sessions SET gateway_session_id=?, updated_at=? WHERE id=?",
               (new_sid, now, session_id))

    db.run(
        "INSERT INTO chat_messages(session_id, role, content, ts) VALUES(?,?,?,?)",
        (session_id, "user", user_message[:5000], now),
    )
    db.run(
        "INSERT INTO chat_messages(session_id, role, content, ts) VALUES(?,?,?,?)",
        (session_id, "assistant", response, now + 0.001),
    )
    db.run("UPDATE chat_sessions SET updated_at=? WHERE id=?", (now, session_id))

    return response


# ── hapus sesi ────────────────────────────────────────────────────────────────
def delete_session(session_id: int) -> None:
    """Hapus sesi chat dari database dan bersihkan sesi di server gateway PAF."""
    session = db.row("SELECT gateway_session_id FROM chat_sessions WHERE id=?", (session_id,))
    if session and session["gateway_session_id"]:
        try:
            llm.delete_session(session["gateway_session_id"])
        except Exception:
            pass
    db.run("DELETE FROM chat_sessions WHERE id=?", (session_id,))


# ── ringkasan sesi (tanpa context_md yang besar) ─────────────────────────────
def public_session(s: dict) -> dict:
    """Kembalikan dict sesi publik tanpa kolom context_md."""
    return {k: v for k, v in s.items() if k != "context_md"}
