"""SQLite lokal: skema, helper query, dan backup harian."""
from __future__ import annotations

import logging
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime

import config

log = logging.getLogger("db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#4f7cac',
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_locked INTEGER NOT NULL DEFAULT 0,
  filename TEXT NOT NULL,
  mime TEXT,
  size INTEGER DEFAULT 0,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  warning TEXT,
  page_count INTEGER DEFAULT 0,
  summary TEXT,
  key_concepts TEXT,
  topics TEXT,
  style TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  label TEXT,
  text TEXT NOT NULL,
  note_md TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id, idx);

CREATE TABLE IF NOT EXISTS notes(
  document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes(
  id INTEGER PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  difficulty TEXT,
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  qtype TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT,
  answer TEXT NOT NULL,
  keywords TEXT,
  explanation TEXT,
  topic TEXT,
  source TEXT,
  deep_explanation TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, position);

CREATE TABLE IF NOT EXISTS attempts(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'practice',
  question_ids TEXT NOT NULL,
  time_limit INTEGER,
  started_at REAL NOT NULL,
  finished_at REAL,
  score INTEGER,
  total INTEGER,
  duration INTEGER,
  grading TEXT NOT NULL DEFAULT 'done',
  grading_job INTEGER
);

CREATE TABLE IF NOT EXISTS answers(
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  given TEXT,
  correct INTEGER,
  feedback TEXT,
  graded_by TEXT,
  ts REAL NOT NULL,
  UNIQUE(attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_answers_q ON answers(question_id);

CREATE TABLE IF NOT EXISTS study_events(
  id INTEGER PRIMARY KEY,
  ts REAL NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  quizzes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_day ON study_events(day);

CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  result TEXT,
  error TEXT,
  ref_id INTEGER,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_ref ON jobs(kind, ref_id);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preparing',
  gateway_session_id TEXT,
  context_md TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_doc ON chat_sessions(document_id);

CREATE TABLE IF NOT EXISTS chat_messages(
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS ask_sessions(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  gateway_session_id TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ask_sessions_doc ON ask_sessions(document_id);
-- ---- Profil, pencapaian, istilah, kartu SM-2 (dipertahankan sejak v1) ----
CREATE TABLE IF NOT EXISTS player(
  id INTEGER PRIMARY KEY CHECK(id = 1),
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  city_collected_at REAL
);

CREATE TABLE IF NOT EXISTS achievements(
  key TEXT PRIMARY KEY,
  unlocked_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS concepts(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  topic TEXT,
  seen INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  UNIQUE(document_id, term)
);
CREATE INDEX IF NOT EXISTS idx_concepts_doc ON concepts(document_id);

CREATE TABLE IF NOT EXISTS cards(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_day TEXT NOT NULL,
  last_review REAL,
  created_at REAL NOT NULL,
  UNIQUE(document_id, front)
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_day);

"""

# ---------------------------------------------------------------- migrasi berversi
# Versi 1 = skema lama (tanpa tabel schema_version). Versi 2 = game interaktif berbasis AI.
# Versi 3 = mind map per materi (hanya menambah tabel).
SCHEMA_VERSION = 3

SCHEMA_V2 = """
CREATE TABLE IF NOT EXISTS game_runs(
  id INTEGER PRIMARY KEY,
  game TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id INTEGER NOT NULL,
  options TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  gateway_session_id TEXT,
  state TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  max_turns INTEGER NOT NULL DEFAULT 8,
  resumes INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  started_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  finished_at REAL
);
CREATE INDEX IF NOT EXISTS idx_game_runs_status ON game_runs(status, updated_at);

CREATE TABLE IF NOT EXISTS game_turns(
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  client_key TEXT UNIQUE,
  status TEXT NOT NULL,
  concept_ids TEXT,
  kind TEXT,
  directive TEXT,
  narration TEXT,
  partial TEXT,
  public TEXT,
  secret TEXT,
  answer TEXT,
  judgement TEXT,
  hint_level INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_run ON game_turns(run_id, idx);

CREATE TABLE IF NOT EXISTS mastery(
  concept_id INTEGER PRIMARY KEY REFERENCES concepts(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  evidence_n INTEGER NOT NULL DEFAULT 0,
  kinds TEXT,
  last_at REAL
);

CREATE TABLE IF NOT EXISTS evidence(
  id INTEGER PRIMARY KEY,
  concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  run_id INTEGER,
  turn_id INTEGER,
  kind TEXT NOT NULL,
  obs REAL NOT NULL,
  hint_level INTEGER NOT NULL DEFAULT 0,
  ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_concept ON evidence(concept_id, id);
CREATE INDEX IF NOT EXISTS idx_evidence_turn ON evidence(turn_id);

CREATE TABLE IF NOT EXISTS quests(
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  done_at REAL,
  PRIMARY KEY(day, key)
);
"""


def _migrate_v2(conn: sqlite3.Connection) -> dict:
    """Hapus data & tabel game lama (D4), lalu buat tabel game v2. study_events tidak disentuh."""
    counts: dict = {}

    def count(sql: str) -> int:
        try:
            return conn.execute(sql).fetchone()[0]
        except sqlite3.OperationalError:
            return 0

    counts["attempts_game"] = count("SELECT COUNT(*) FROM attempts WHERE mode='game'")
    for name in ("city", "stories", "game_runs", "achievements"):
        counts[name] = count(f"SELECT COUNT(*) FROM {name}")
    conn.execute("DELETE FROM attempts WHERE mode='game'")            # cascade ke answers
    for name in ("city", "stories", "game_runs"):
        conn.execute(f"DROP TABLE IF EXISTS {name}")
    conn.execute("DELETE FROM achievements")
    conn.execute("INSERT OR IGNORE INTO player(id,xp,coins) VALUES(1,0,0)")
    conn.execute("UPDATE player SET xp=0, coins=0, city_collected_at=NULL")
    conn.execute("UPDATE concepts SET seen=0, hits=0")
    for stmt in [s for s in SCHEMA_V2.split(";") if s.strip()]:
        conn.execute(stmt)
    return counts


SCHEMA_V3 = """
CREATE TABLE IF NOT EXISTS mindmaps(
  document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  tree TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  source_ts REAL,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
"""


def _migrate_v3(conn: sqlite3.Connection) -> dict:
    """Tambah tabel mindmaps. Murni aditif: tidak ada data yang dihapus."""
    for stmt in [s for s in SCHEMA_V3.split(";") if s.strip()]:
        conn.execute(stmt)
    return {}


MIGRATIONS = {2: _migrate_v2, 3: _migrate_v3}
# Migrasi yang hanya menambah tabel/kolom tidak perlu backup pra-migrasi.
ADDITIVE_MIGRATIONS = {3}


def schema_version(conn: sqlite3.Connection) -> int:
    """Nomor versi skema. DB tanpa tabel schema_version dianggap v1."""
    has = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'").fetchone()
    if not has:
        return 1
    r = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
    return int(r[0]) if r and r[0] else 1


def _premigrate_backup(conn: sqlite3.Connection, target_version: int) -> str | None:
    """Salin DB utuh sebelum migrasi yang menghapus data. Mengembalikan path berkas backup."""
    target = config.BACKUP_DIR / f"belajar-premigrate-v{target_version}.db"
    if target.exists():
        return str(target)
    dst = sqlite3.connect(str(target))
    try:
        conn.backup(dst)
    finally:
        dst.close()
    log.info("Backup pra-migrasi: %s", target.name)
    return str(target)


def run_migrations(conn: sqlite3.Connection, had_data: bool) -> list[int]:
    """Jalankan migrasi yang belum diterapkan; tiap versi dalam satu transaksi."""
    conn.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL)")
    conn.commit()
    current = schema_version(conn)
    applied: list[int] = []
    for version in sorted(MIGRATIONS):
        if version <= current:
            continue
        if had_data and version not in ADDITIVE_MIGRATIONS:
            _premigrate_backup(conn, version)
        conn.execute("BEGIN")
        try:
            counts = MIGRATIONS[version](conn)
            conn.execute("DELETE FROM schema_version")
            conn.execute("INSERT INTO schema_version(version) VALUES(?)", (version,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        log.info("Migrasi v%d selesai. Baris dihapus/dibuang: %s", version, counts)
        applied.append(version)
        current = version
    return applied


def fts5_available() -> bool:
    try:
        probe = sqlite3.connect(":memory:")
        try:
            probe.execute("CREATE VIRTUAL TABLE t USING fts5(x)")
        finally:
            probe.close()
        return True
    except sqlite3.OperationalError:
        return False


FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(label, text, content='chunks', content_rowid='id',
                                                         tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS chunks_fts_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, label, text) VALUES (new.id, new.label, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_fts_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, label, text) VALUES('delete', old.id, old.label, old.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_fts_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, label, text) VALUES('delete', old.id, old.label, old.text);
  INSERT INTO chunks_fts(rowid, label, text) VALUES (new.id, new.label, new.text);
END;
"""


def _ensure_fts(conn: sqlite3.Connection) -> bool:
    """Pasang indeks FTS5 bila SQLite mendukung; simpan hasil probe di settings.fts5."""
    ok = fts5_available()
    if ok:
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE name='chunks_fts'").fetchone()
        if not exists:
            conn.executescript(FTS_SQL)
            conn.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')")
    conn.execute("INSERT INTO settings(key,value) VALUES('fts5',?) "
                 "ON CONFLICT(key) DO UPDATE SET value=excluded.value", ("1" if ok else "0",))
    return ok


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(config.DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


@contextmanager
def tx():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rows(sql: str, params=()) -> list[dict]:
    with tx() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def row(sql: str, params=()):
    found = rows(sql, params)
    return found[0] if found else None


def run(sql: str, params=()) -> int:
    with tx() as c:
        return c.execute(sql, params).lastrowid


def scalar(sql: str, params=(), default=0):
    r = row(sql, params)
    if not r:
        return default
    value = next(iter(r.values()))
    return default if value is None else value


def init() -> None:
    existed = config.DB_PATH.exists() and config.DB_PATH.stat().st_size > 0
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.FILES_DIR.mkdir(parents=True, exist_ok=True)
    config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        had_data = existed and bool(conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'").fetchone())
        conn.executescript(SCHEMA)
        try:
            conn.execute("ALTER TABLE chat_sessions ADD COLUMN gateway_session_id TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()
        run_migrations(conn, had_data)
        _ensure_fts(conn)
        conn.commit()
    finally:
        conn.close()


# ---- Pengaturan ----
def get_setting(key: str, default=None):
    r = row("SELECT value FROM settings WHERE key=?", (key,))
    if r and r["value"] is not None:
        return r["value"]
    if default is not None:
        return default
    return config.DEFAULT_SETTINGS.get(key)


def set_setting(key: str, value) -> None:
    run(
        "INSERT INTO settings(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, str(value)),
    )


def all_settings() -> dict:
    out = dict(config.DEFAULT_SETTINGS)
    for r in rows("SELECT key,value FROM settings"):
        out[r["key"]] = r["value"]
    return out


# ---- Backup ----
def backup(keep: int = 7) -> str | None:
    """Salin database ke data/backup/belajar-YYYYMMDD.db (sekali per hari)."""
    stamp = datetime.now().strftime("%Y%m%d")
    target = config.BACKUP_DIR / f"belajar-{stamp}.db"
    if target.exists():
        return None
    src = connect()
    try:
        dst = sqlite3.connect(str(target))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    old = sorted(config.BACKUP_DIR.glob("belajar-*.db"))
    for path in old[:-keep]:
        try:
            path.unlink()
        except OSError:
            pass
    log.info("Backup database: %s", target.name)
    return str(target)


def now() -> float:
    return time.time()
