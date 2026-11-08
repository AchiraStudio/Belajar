"""Konfigurasi agent. Nilai dibaca dari environment atau file .env di folder ini."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


_load_env_file(BASE_DIR / ".env")


def _str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# --- Penyimpanan lokal ---
DATA_DIR = Path(_str("DATA_DIR") or (BASE_DIR / "data"))
FILES_DIR = DATA_DIR / "files"
BACKUP_DIR = DATA_DIR / "backup"
DB_PATH = DATA_DIR / "belajar.db"

# --- Koneksi ke VPS (bridge) ---
BRIDGE_URL = _str("BRIDGE_URL")          # contoh: wss://belajar.example.com/bridge
BRIDGE_TOKEN = _str("BRIDGE_TOKEN")
RECONNECT_DELAY = 5
RECONNECT_MAX = 60

# --- Gateway PAF-Model ---
PAF_BASE_URL = _str("PAF_BASE_URL", "http://20.239.192.10:9000").rstrip("/")
PAF_API_TOKEN = _str("PAF_API_TOKEN")
PAF_TIMEOUT = _int("PAF_TIMEOUT", 340)         # dokumen gateway: minimal 330 detik
LLM_CONCURRENCY = max(1, _int("LLM_CONCURRENCY", 2))
LLM_CONCURRENCY_STREAM = max(1, _int("LLM_CONCURRENCY_STREAM", 1))   # DeepSeek: chat + game
LLM_RETRIES = max(0, _int("LLM_RETRIES", 2))
LLM_BACKOFF_BASE = _float("LLM_BACKOFF_BASE", 4.0)
LLM_FALLBACK = _str("LLM_FALLBACK", "1") != "0"  # pindah backend bila terkena 429/504

# --- Pemrosesan materi ---
CHUNK_CHARS = _int("CHUNK_CHARS", 7000)
MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 40)
MAX_VISION_PAGES = _int("MAX_VISION_PAGES", 80)
JOB_WORKERS = _int("JOB_WORKERS", 4)

# --- Waktu & streak ---
TIMEZONE = _str("TIMEZONE", "Asia/Jakarta")
DAY_START_HOUR = _int("DAY_START_HOUR", 0)     # 3 = hari baru dimulai jam 03:00

# --- Pengaturan bawaan (bisa diubah dari UI) ---
DEFAULT_SETTINGS = {
    "daily_goal_min": "10",
    "weekly_goal_min": "120",
    "notes_style": "ringkas",
    "language": "auto",
}

VERSION = "2.3.1"


def missing_required() -> list[str]:
    out = []
    if not BRIDGE_URL:
        out.append("BRIDGE_URL")
    if not BRIDGE_TOKEN:
        out.append("BRIDGE_TOKEN")
    if not PAF_API_TOKEN:
        out.append("PAF_API_TOKEN")
    return out
