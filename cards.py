"""Kartu belajar SM-2 dan ekspor Anki. Dipindah dari games.py dengan perilaku identik."""
from __future__ import annotations

from datetime import date, timedelta

import db
import stats
from common import UserError, clamp, doc_ids
from concepts import concept_rows
from handlers import need_int, opt_int, register


def card_counts() -> dict:
    t = stats.today()
    return {"total": db.scalar("SELECT COUNT(*) FROM cards"),
            "due": db.scalar("SELECT COUNT(*) FROM cards WHERE due_day<=?", (t,)),
            "new": db.scalar("SELECT COUNT(*) FROM cards WHERE reps=0"),
            "learning": db.scalar("SELECT COUNT(*) FROM cards WHERE reps>0 AND interval<21"),
            "mature": db.scalar("SELECT COUNT(*) FROM cards WHERE interval>=21")}


def collect_cards(concept_ids) -> int:
    """Buat kartu dari konsep (INSERT OR IGNORE: tidak pernah menggandakan). Mengembalikan jumlah baru."""
    ids = [i for i in (clamp(x, 0, 10 ** 9) for x in concept_ids[:60]) if i]
    if not ids:
        return 0
    rows = db.rows(f"SELECT document_id, term, definition FROM concepts WHERE id IN ({','.join('?' * len(ids))})", ids)
    today, added = stats.today(), 0
    with db.tx() as c:
        for r in rows:
            added += c.execute(
                "INSERT OR IGNORE INTO cards(document_id,front,back,due_day,created_at) VALUES(?,?,?,?,?)",
                (r["document_id"], r["term"], r["definition"], today, db.now())).rowcount
    return added


def sm2(card: dict, grade: int, today: str) -> dict:
    """SM-2. grade: 1 = lagi, 3 = sulit, 4 = baik, 5 = mudah."""
    ease, interval, reps, lapses = card["ease"], card["interval"], card["reps"], card["lapses"]
    if grade < 3:
        reps, interval, lapses = 0, 1, lapses + 1
        ease = max(1.3, ease - 0.2)
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        if grade == 3:
            interval = max(1, round(interval * 0.8))
        reps += 1
        ease = max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    due = (date.fromisoformat(today) + timedelta(days=interval)).isoformat()
    return {"ease": round(ease, 3), "interval": interval, "reps": reps, "lapses": lapses, "due_day": due}


@register("cards_due")
def cards_due(p):
    limit = clamp(p.get("limit"), 1, 100, 20)
    sql = ("SELECT c.id, c.front, c.back, c.reps, c.interval, d.title AS doc_title FROM cards c "
           "JOIN documents d ON d.id=c.document_id WHERE c.due_day<=?")
    params: list = [stats.today()]
    doc_id = opt_int(p, "document_id")
    if doc_id:
        sql += " AND c.document_id=?"
        params.append(doc_id)
    sql += " ORDER BY c.due_day, c.id LIMIT ?"
    params.append(limit)
    return {"cards": db.rows(sql, params), "counts": card_counts()}


@register("cards_review")
def cards_review(p):
    card = db.row("SELECT * FROM cards WHERE id=?", (need_int(p, "id"),))
    if not card:
        raise UserError("Kartu tidak ditemukan.")
    grade = need_int(p, "grade", 1, 5)
    upd = sm2(card, grade, stats.today())
    db.run("UPDATE cards SET ease=?, interval=?, reps=?, lapses=?, due_day=?, last_review=? WHERE id=?",
           (upd["ease"], upd["interval"], upd["reps"], upd["lapses"], upd["due_day"], db.now(), card["id"]))
    stats.log_event("cards", card["document_id"], seconds=clamp(p.get("seconds"), 1, 90, 10))
    return {**upd, "counts": card_counts()}


@register("cards_build")
def cards_build(p):
    ids = doc_ids(opt_int(p, "document_id"), opt_int(p, "subject_id"))
    concept_ids = [c["id"] for c in concept_rows(ids)]
    added = collect_cards(concept_ids) if concept_ids else 0
    # collect_cards membatasi 60 per panggilan; ulangi untuk sisanya
    for i in range(60, len(concept_ids), 60):
        added += collect_cards(concept_ids[i:i + 60])
    try:
        import profile as _profile
        fresh = _profile.unlock_achievements()
    except Exception:  # lencana tidak boleh menggagalkan pembuatan kartu
        fresh = []
    return {"added": added, "counts": card_counts(), "achievements": fresh}


@register("cards_stats")
def cards_stats(p):
    docs = db.rows("SELECT d.id, d.title, COUNT(c.id) n, SUM(CASE WHEN c.due_day<=? THEN 1 ELSE 0 END) due "
                   "FROM documents d JOIN cards c ON c.document_id=d.id GROUP BY d.id ORDER BY d.title",
                   (stats.today(),))
    return {"counts": card_counts(), "documents": docs}


@register("cards_export")
def cards_export(p):
    rows = db.rows("SELECT c.front, c.back, d.title FROM cards c JOIN documents d ON d.id=c.document_id ORDER BY c.id")

    def cell(v: str) -> str:
        return str(v).replace("\t", " ").replace("\r", " ").replace("\n", "<br>")
    text = "\n".join(f"{cell(r['front'])}\t{cell(r['back'])}\t{cell(r['title']).replace(' ', '_')}" for r in rows)
    return {"text": text, "count": len(rows)}
