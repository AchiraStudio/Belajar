"""Membuat DB skema v1 (sebelum v2) yang SINTETIS untuk menguji migrasi. Tidak memakai data/ asli."""
from __future__ import annotations

import sqlite3

# Tabel game lama yang dihapus oleh migrasi v2.
LEGACY_GAME_SQL = """
CREATE TABLE game_runs(
  id INTEGER PRIMARY KEY, game TEXT NOT NULL, ref_kind TEXT, ref_id INTEGER,
  attempt_id INTEGER REFERENCES attempts(id) ON DELETE SET NULL,
  won INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0, detail TEXT, created_at REAL NOT NULL);
CREATE TABLE city(slot INTEGER PRIMARY KEY, kind TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1, built_at REAL NOT NULL);
CREATE TABLE stories(
  id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL, intro TEXT NOT NULL, outro TEXT NOT NULL, rooms TEXT NOT NULL,
  ai INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL);
"""


def make_legacy_db(path) -> dict:
    """Buat DB v1 di `path`. Mengembalikan jumlah baris penting untuk dibandingkan setelah migrasi."""
    import db
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(db.SCHEMA)          # tabel dasar (termasuk player, achievements, concepts, cards)
    conn.executescript(LEGACY_GAME_SQL)
    ts = 1_700_000_000.0
    conn.execute("INSERT INTO subjects(id,name,created_at) VALUES(1,'IPA',?)", (ts,))
    conn.execute("INSERT INTO documents(id,subject_id,title,filename,status,key_concepts,topics,created_at,updated_at) "
                 "VALUES(1,1,'Biologi','b.pdf','ready','[]','[]',?,?)", (ts, ts))
    conn.execute("INSERT INTO chunks(document_id,idx,label,text) VALUES(1,0,'Halaman 1','Fotosintesis terjadi di kloroplas.')")
    conn.execute("INSERT INTO quizzes(id,document_id,title,created_at) VALUES(1,1,'Kuis',?)", (ts,))
    conn.execute("INSERT INTO questions(id,quiz_id,position,qtype,question,answer) VALUES(1,1,0,'tf','Benar?','true')")
    # attempt biasa (harus bertahan) dan attempt game (harus hilang bersama jawabannya)
    conn.execute("INSERT INTO attempts(id,quiz_id,mode,question_ids,started_at,finished_at,score,total) "
                 "VALUES(1,1,'practice','[1]',?,?,1,1)", (ts, ts))
    conn.execute("INSERT INTO answers(attempt_id,question_id,given,correct,ts) VALUES(1,1,'true',1,?)", (ts,))
    conn.execute("INSERT INTO attempts(id,quiz_id,mode,question_ids,started_at,finished_at,score,total) "
                 "VALUES(2,NULL,'game','[1]',?,?,1,1)", (ts, ts))
    conn.execute("INSERT INTO answers(attempt_id,question_id,given,correct,ts) VALUES(2,1,'true',1,?)", (ts,))
    conn.execute("INSERT INTO study_events(ts,day,kind,document_id,seconds,quizzes) VALUES(?,?,?,?,?,?)",
                 (ts, "2023-11-14", "quiz", 1, 300, 1))
    conn.execute("INSERT INTO player(id,xp,coins,city_collected_at) VALUES(1,500,70,?)", (ts,))
    conn.execute("INSERT INTO achievements(key,unlocked_at) VALUES('first_game',?)", (ts,))
    conn.execute("INSERT INTO concepts(id,document_id,term,definition,topic,seen,hits) "
                 "VALUES(1,1,'Klorofil','Pigmen hijau','Sel',5,3)")
    conn.execute("INSERT INTO cards(document_id,front,back,due_day,created_at) VALUES(1,'Klorofil','Pigmen hijau','2023-11-14',?)", (ts,))
    conn.execute("INSERT INTO city(slot,kind,level,built_at) VALUES(0,'rumah',2,?)", (ts,))
    conn.execute("INSERT INTO stories(document_id,title,intro,outro,rooms,created_at) VALUES(1,'Cerita','a','b','[]',?)", (ts,))
    conn.execute("INSERT INTO game_runs(game,ref_kind,ref_id,attempt_id,won,score,correct,total,xp,coins,duration,created_at) "
                 "VALUES('boss','document',1,2,1,100,1,1,35,10,60,?)", (ts,))
    conn.commit()
    conn.close()
    return {"documents": 1, "chunks": 1, "questions": 1, "study_events": 1, "cards": 1, "concepts": 1}
