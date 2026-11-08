"""Direktur (deterministik): memilih konsep fokus, bahan sumber, dan memperbarui penguasaan.

Agent adalah wasit: skor penguasaan hidup di SQLite (mastery/evidence), bukan di ingatan AI.
"""
from __future__ import annotations

import random
import re

import handlers  # noqa: F401  (harus dimuat paling dulu: memutus impor melingkar handlers<->concepts/cards)
import db
import pipeline
import stats
from common import jdump, jload
from concepts import concept_rows
from play_games import KIND_W

MAX_SOURCE_CHARS = 2500
PACKAGE_CHARS = 6000


# ---------------------------------------------------------------- penguasaan
def mastery_level(score: float, n: int, kinds) -> str:
    """baru | dikenal | paham | kuasai. Kuasai butuh skor>=75, >=4 bukti, dan >=2 jenis bukti."""
    if n <= 0:
        return "baru"
    if score < 50:
        return "dikenal"
    if score >= 75 and n >= 4 and len(set(kinds or [])) >= 2:
        return "kuasai"
    return "paham"


def _replay(rows: list[dict]) -> tuple[float, list[str]]:
    score, kinds = 0.0, []
    for r in rows:
        score += KIND_W.get(r["kind"], 0.3) * (100 * r["obs"] - score)
        if r["kind"] not in kinds:
            kinds.append(r["kind"])
    return round(score, 2), kinds


def _write_mastery(concept_id: int) -> None:
    rows = db.rows("SELECT kind, obs FROM evidence WHERE concept_id=? ORDER BY id", (concept_id,))
    if not rows:
        db.run("DELETE FROM mastery WHERE concept_id=?", (concept_id,))
        return
    score, kinds = _replay(rows)
    db.run("INSERT INTO mastery(concept_id,score,evidence_n,kinds,last_at) VALUES(?,?,?,?,?) "
           "ON CONFLICT(concept_id) DO UPDATE SET score=excluded.score, evidence_n=excluded.evidence_n, "
           "kinds=excluded.kinds, last_at=excluded.last_at",
           (concept_id, score, len(rows), jdump(kinds), db.now()))


def add_evidence(concept_ids: list[int], kind: str, obs: float, hint_level: int, run_id: int, turn_id: int) -> None:
    """obs sudah termasuk potongan petunjuk. Skor_baru = lama + w*(100*obs - lama)."""
    for cid in concept_ids:
        db.run("INSERT INTO evidence(concept_id,run_id,turn_id,kind,obs,hint_level,ts) VALUES(?,?,?,?,?,?,?)",
               (cid, run_id, turn_id, kind, obs, hint_level, db.now()))
        _write_mastery(cid)


def drop_evidence(turn_id: int) -> list[int]:
    """Batalkan bukti satu giliran ('Soal ini keliru') dan hitung ulang skor konsep terkait."""
    ids = [r["concept_id"] for r in db.rows("SELECT DISTINCT concept_id FROM evidence WHERE turn_id=?", (turn_id,))]
    db.run("DELETE FROM evidence WHERE turn_id=?", (turn_id,))
    for cid in ids:
        _write_mastery(cid)
    return ids


def struggling_cards(concept_ids: list[int], obs: float) -> None:
    """Konsep dengan obs rendah otomatis menjadi kartu SM-2 (INSERT OR IGNORE)."""
    if obs < 0.5:
        from cards import collect_cards
        collect_cards(concept_ids)


# ---------------------------------------------------------------- pemilihan fokus
def _due_terms() -> set[tuple[int, str]]:
    return {(r["document_id"], r["front"]) for r in db.rows("SELECT document_id, front FROM cards WHERE due_day<=?",
                                                              (stats.today(),))}


def weight(c: dict, due: set) -> float:
    kinds = jload(c.get("kinds"), [])
    level = mastery_level(c["score"], c["evidence_n"], kinds)
    w = 1.0
    if (c["document_id"], c["term"]) in due:
        w *= 3
    if level == "dikenal":
        w *= 2
    elif level == "baru":
        w *= 1.5
    elif level == "kuasai":
        w *= 0.3
    return w


def pick_focus(doc_ids: list[int], count: int, recent: list[list[int]], rng=random) -> list[dict]:
    """Sampel berbobot tanpa pengembalian. `recent` = daftar id konsep 3 giliran terakhir (penalti).
    Mode mapel: konsep dari materi yang sama dengan giliran terakhir diberi penalti (interleaving)."""
    cands = concept_rows(doc_ids)
    if not cands:
        return []
    due = _due_terms()
    last_ids = {i for ids in recent[-3:] for i in ids}
    last_doc = None
    if recent and recent[-1]:
        row = next((c for c in cands if c["id"] == recent[-1][0]), None)
        last_doc = row["document_id"] if row else None
    pool = []
    for c in cands:
        w = weight(c, due)
        if c["id"] in last_ids:
            w *= 0.2
        if len(doc_ids) > 1 and last_doc is not None and c["document_id"] == last_doc:
            w *= 0.5
        pool.append([c, max(w, 0.01)])
    chosen = []
    for _ in range(min(count, len(pool))):
        total = sum(w for _, w in pool)
        r, acc = rng.random() * total, 0.0
        for i, (c, w) in enumerate(pool):
            acc += w
            if r <= acc:
                chosen.append(c)
                pool.pop(i)
                break
    return chosen


# ---------------------------------------------------------------- bahan sumber
def _tokens(c: dict) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9]{4,}", f"{c['term']} {c['definition']}")
    seen, out = set(), []
    for w in [t for t in re.findall(r"[a-zA-Z0-9]{2,}", c["term"])] + words:
        k = w.lower()
        if k not in seen:
            seen.add(k)
            out.append(w)
    return out[:10]


def _excerpt(text: str, term: str) -> str:
    if len(text) <= MAX_SOURCE_CHARS:
        return text
    i = text.lower().find(term.lower())
    i = 0 if i < 0 else i
    start = max(0, i - MAX_SOURCE_CHARS // 2)
    return text[start:start + MAX_SOURCE_CHARS]


def source_for(c: dict, limit: int = 2) -> list[dict]:
    """1-2 potongan materi paling relevan: [{label, text}]. FTS5 (BM25) bila ada, jika tidak LIKE."""
    toks = _tokens(c)
    if not toks:
        return []
    hits: list[dict] = []
    if db.get_setting("fts5") == "1":
        q = " OR ".join('"' + t.replace('"', "") + '"' for t in toks)
        try:
            hits = db.rows("SELECT ch.label, ch.text FROM chunks_fts f JOIN chunks ch ON ch.id=f.rowid "
                           "WHERE chunks_fts MATCH ? AND ch.document_id=? ORDER BY bm25(chunks_fts) LIMIT ?",
                           (q, c["document_id"], limit))
        except Exception:  # sintaks FTS tak terduga: jatuh ke LIKE
            hits = []
    if not hits:
        rows = db.rows("SELECT label, text FROM chunks WHERE document_id=?", (c["document_id"],))
        scored = [(sum(1 for t in toks if t.lower() in r["text"].lower()), r) for r in rows]
        hits = [r for n, r in sorted(scored, key=lambda x: -x[0]) if n > 0][:limit]
    return [{"label": h["label"] or "Materi", "text": _excerpt(h["text"], c["term"])} for h in hits]


def material_for(focus: list[dict]) -> tuple[str, bool]:
    """Blok BAHAN untuk fokus giliran. (teks, terbatas). terbatas=True bila tak ada potongan materi."""
    parts, limited = [], True
    for c in focus:
        parts.append(f"## Konsep: {c['term']}\nDefinisi: {c['definition']}")
        for s in source_for(c):
            limited = False
            parts.append(f"[{s['label']}]\n{s['text']}")
    return "\n\n".join(parts)[:7000], limited


def package_for(scope_kind: str, scope_id: int, doc_ids: list[int]) -> str:
    """Paket materi sesi (<= 6000 karakter): judul, ringkasan, dan daftar konsep."""
    docs = db.rows(f"SELECT id, title, summary FROM documents WHERE id IN ({','.join('?' * len(doc_ids))})", doc_ids) \
        if doc_ids else []
    per = 700 if len(docs) > 1 else 1500
    parts = [f"### {d['title']}\n{(d['summary'] or '(tanpa ringkasan)')[:per]}" for d in docs]
    concepts = concept_rows(doc_ids)
    lines = [f"- {c['term']}: {c['definition'][:140]}" for c in concepts[:40]]
    text = "\n\n".join(parts) + "\n\nDAFTAR KONSEP:\n" + "\n".join(lines)
    return text[:PACKAGE_CHARS]
