"""Uji: migrasi v2 dari DB lama sintetis, SM-2, kartu/Anki, istilah (porting dari smoke_games)."""
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tmp = Path(tempfile.mkdtemp(prefix="belajar-cards-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
os.environ.update({"DATA_DIR": str(tmp / "data"), "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
                   "PAF_API_TOKEN": "x", "PAF_BASE_URL": "http://127.0.0.1:9"})

import config  # noqa: E402
import db  # noqa: E402
import handlers as H  # noqa: E402
import cards  # noqa: E402
import jobs  # noqa: E402
import llm  # noqa: E402
from common import UserError, jdump  # noqa: E402
from legacy_v1 import make_legacy_db  # noqa: E402

ok_count = 0


def check(cond, msg):
    global ok_count
    if not cond:
        raise SystemExit(f"GAGAL: {msg}")
    ok_count += 1
    print(f"  ok  {msg}")


def raises(fn, text=None):
    try:
        fn()
    except UserError as exc:
        return text is None or text in str(exc)
    return False


call = lambda name, **kw: H.HANDLERS[name](kw)  # noqa: E731


def point_config(base: Path):
    config.DATA_DIR = base
    config.DB_PATH = base / "belajar.db"
    config.FILES_DIR = base / "files"
    config.BACKUP_DIR = base / "backup"


# ============================================================ migrasi v2
print("migrasi v2 dari DB lama (sintetis)")
old = tmp / "old"
old.mkdir()
counts = make_legacy_db(old / "belajar.db")
point_config(old)
conn = db.connect()
check(db.schema_version(conn) == 1, "DB tanpa schema_version dianggap v1")
conn.close()
db.init()
conn = db.connect()
check(db.schema_version(conn) == 3, "init menaikkan skema ke v3 (lewat v2)")
conn.close()
check((old / "backup" / "belajar-premigrate-v2.db").exists(), "backup pra-migrasi dibuat sebelum migrasi")
names = {r["name"] for r in db.rows("SELECT name FROM sqlite_master WHERE type='table'")}
check({"city", "stories"}.isdisjoint(names), "tabel city dan stories dihapus")
check({"game_runs", "game_turns", "mastery", "evidence", "quests", "schema_version"} <= names, "tabel game v2 dibuat")
check("mindmaps" in names, "tabel mindmaps (v3) dibuat")
check(not (old / "backup" / "belajar-premigrate-v3.db").exists(), "migrasi v3 aditif: tanpa backup pra-migrasi tambahan")
check("scope_kind" in {r["name"] for r in db.rows("PRAGMA table_info(game_runs)")}, "game_runs memakai skema baru")
check(db.scalar("SELECT COUNT(*) FROM attempts WHERE mode='game'") == 0, "attempt mode game dihapus")
check(db.scalar("SELECT COUNT(*) FROM answers") == 1, "jawaban attempt game ikut terhapus (cascade), jawaban kuis biasa tetap")
check(db.scalar("SELECT COUNT(*) FROM achievements") == 0, "pencapaian dikosongkan")
pl = db.row("SELECT * FROM player WHERE id=1")
check(pl["xp"] == 0 and pl["coins"] == 0 and pl["city_collected_at"] is None, "player di-reset")
c1 = db.row("SELECT * FROM concepts WHERE id=1")
check(c1["term"] == "Klorofil" and c1["seen"] == 0 and c1["hits"] == 0, "konsep tetap, penghitung lama di-nol-kan")
check(db.scalar("SELECT COUNT(*) FROM cards") == counts["cards"], "kartu SM-2 tetap")
check(db.scalar("SELECT COUNT(*) FROM study_events") == counts["study_events"], "study_events tidak disentuh (streak aman)")
check(db.scalar("SELECT COUNT(*) FROM documents") == 1 and db.scalar("SELECT COUNT(*) FROM questions") == 1, "materi dan soal utuh")
bak = db.row("SELECT 1 FROM sqlite_master LIMIT 1")
import sqlite3  # noqa: E402
b = sqlite3.connect(str(old / "backup" / "belajar-premigrate-v2.db"))
check(b.execute("SELECT COUNT(*) FROM city").fetchone()[0] == 1 and b.execute("SELECT xp FROM player").fetchone()[0] == 500,
      "backup pra-migrasi menyimpan data lama utuh")
b.close()
mtime = (old / "backup" / "belajar-premigrate-v2.db").stat().st_mtime
db.init()
check((old / "backup" / "belajar-premigrate-v2.db").stat().st_mtime == mtime, "init kedua idempoten (backup tidak ditimpa)")
check(db.get_setting("fts5") in ("0", "1"), "hasil probe FTS5 disimpan di settings")

print("DB baru (bersih)")
fresh = tmp / "fresh"
point_config(fresh)
db.init()
conn = db.connect()
check(db.schema_version(conn) == 3, "DB baru langsung v3")
conn.close()
check(not list((fresh / "backup").glob("belajar-premigrate-*")), "DB kosong tidak perlu backup pra-migrasi")

# ============================================================ data contoh
ts = db.now()
sid = db.run("INSERT INTO subjects(name,created_at) VALUES('IPA',?)", (ts,))
concepts = [{"term": t, "definition": f"Definisi {t} yang cukup panjang untuk diuji"} for t in
            ("Fotosintesis", "Klorofil", "Stomata", "Respirasi", "Mitokondria", "Enzim")]
doc = db.run("INSERT INTO documents(subject_id,title,filename,status,key_concepts,topics,summary,created_at,updated_at) "
             "VALUES(?,?,?,?,?,?,?,?,?)", (sid, "Biologi Sel", "b.pdf", "ready", jdump(concepts), jdump(["Sel"]), "Ringkasan", ts, ts))
doc2 = db.run("INSERT INTO documents(title,filename,status,created_at,updated_at) VALUES('Kosong','k.pdf','processing',?,?)", (ts, ts))

print("istilah")
lst = call("concepts_list", document_id=doc)
check(lst["count"] == 6 and lst["concepts"][0]["score"] == 0, "concepts_list: seed dari key_concepts, skor awal 0")
ids = [c["id"] for c in lst["concepts"]]
check(call("concepts_list", subject_id=sid)["count"] == 6, "cakupan per mata pelajaran")
check(call("concepts_list", document_id=doc2)["count"] == 0, "dokumen belum siap tidak punya istilah")

print("kartu SM-2")
check(cards.collect_cards(ids) == 6 and cards.collect_cards(ids) == 0, "kartu dibuat sekali (tidak dobel)")
due = call("cards_due")
check(len(due["cards"]) == 6 and due["counts"]["new"] == 6, "semua kartu baru jatuh tempo hari ini")
card = {"ease": 2.5, "interval": 0, "reps": 0, "lapses": 0}
a = cards.sm2(card, 4, "2026-01-01")
check(a["interval"] == 1 and a["reps"] == 1 and a["due_day"] == "2026-01-02", "SM-2: pertama baik -> 1 hari")
b2 = cards.sm2({**card, **a}, 4, "2026-01-02")
check(b2["interval"] == 6, "SM-2: kedua baik -> 6 hari")
c3 = cards.sm2({**card, **b2}, 4, "2026-01-08")
check(c3["interval"] == 15 and c3["ease"] == 2.5, "SM-2: ketiga -> 6*2.5 = 15")
lap = cards.sm2({**card, **c3}, 1, "2026-01-23")
check(lap["reps"] == 0 and lap["interval"] == 1 and lap["lapses"] == 1 and lap["ease"] == 2.3, "SM-2: lupa mengulang & ease turun")
easy, hard = cards.sm2(card, 5, "2026-01-01"), cards.sm2(card, 3, "2026-01-01")
check(easy["ease"] > card["ease"] > hard["ease"], "SM-2: mudah menaikkan, sulit menurunkan ease")
check(cards.sm2({**card, "ease": 1.3}, 1, "2026-01-01")["ease"] == 1.3, "SM-2: ease minimum 1.3")
rv = call("cards_review", id=due["cards"][0]["id"], grade=4, seconds=12)
check(rv["interval"] == 1 and rv["counts"]["due"] == 5, "review menjadwalkan ulang kartu")
check(raises(lambda: call("cards_review", id=due["cards"][1]["id"], grade=9)), "nilai review di luar batas ditolak")
check(call("cards_build", document_id=doc)["counts"]["total"] == 6, "bangun kartu dari semua istilah materi")
ex = call("cards_export")
check(ex["count"] == 6 and ex["text"].count("\t") == 12, "ekspor TSV (Anki) 3 kolom")
check(call("cards_stats")["counts"]["total"] == 6, "cards_stats")

print("perluas istilah (AI dipalsukan)")
def fake_chat_json(prompt, level="normal", validate=None, **kw):
    return validate({"concepts": [{"term": "Ribosom", "definition": "Pabrik protein"},
                                  {"term": "Fotosintesis", "definition": "dobel"}]})
llm.chat_json = fake_chat_json
llm.ask_tool = lambda prompt, tool_spec, level="normal", validate=None, **kw: fake_chat_json(prompt, level, validate, **kw)
def wait(job_id):
    for _ in range(100):
        j = jobs.get(job_id)
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.05)
j = wait(call("concepts_expand", document_id=doc)["job_id"])
check(j["status"] == "done" and j["result"]["added"] == 1, "AI menambah istilah baru, duplikat dilewati")
check(raises(lambda: call("concepts_expand", document_id=doc2), "belum selesai"), "dokumen belum siap ditolak")

print("hapus dokumen")
db.run("DELETE FROM documents WHERE id=?", (doc,))
check(db.scalar("SELECT COUNT(*) FROM cards") == 0 and db.scalar("SELECT COUNT(*) FROM concepts") == 0,
      "kartu dan istilah ikut terhapus")
print(f"\nSemua {ok_count} pemeriksaan lolos.")
