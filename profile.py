"""Profil pemain: XP, level, lencana, dan misi harian. Tanpa koin (D1).

Lencana dan misi dihitung dari data (bukan dari AI) dan idempoten: membuka dua kali tidak memberi
hadiah dua kali.
"""
from __future__ import annotations

import math
import random

import db
import stats
from common import jload


def level_info(xp: int) -> dict:
    level = max(1, int((1 + math.sqrt(1 + xp / 12.5)) / 2))
    return {"level": level, "xp": xp, "level_start": 50 * (level - 1) * level, "next": 50 * level * (level + 1)}


def player() -> dict:
    db.run("INSERT OR IGNORE INTO player(id,xp,coins) VALUES(1,0,0)")
    return db.row("SELECT * FROM player WHERE id=1")


def profile() -> dict:
    return level_info(player()["xp"])


def add_xp(xp: int) -> tuple[int, int]:
    """Tambah/kurangi XP (tidak kurang dari 0); kembalikan (level_sebelum, level_sesudah)."""
    before = level_info(player()["xp"])["level"]
    db.run("UPDATE player SET xp=MAX(0, xp+?) WHERE id=1", (int(xp),))
    return before, level_info(player()["xp"])["level"]


# ---------------------------------------------------------------- lencana
def _mastered() -> int:
    from play_director import mastery_level   # impor lokal: memutus siklus impor play_director <-> profile
    n = 0
    for r in db.rows("SELECT score, evidence_n, kinds FROM mastery"):
        if mastery_level(r["score"], r["evidence_n"], jload(r["kinds"], [])) == "kuasai":
            n += 1
    return n


def _runs(where: str = "", params=()) -> list[dict]:
    return db.rows("SELECT * FROM game_runs WHERE status='finished'" + (" AND " + where if where else ""), params)


def _acc(r: dict) -> float:
    return r["correct"] / r["total"] if r["total"] else 0.0


def _hints(run_id: int) -> int:
    return db.scalar("SELECT COALESCE(SUM(hint_level),0) FROM game_turns WHERE run_id=?", (run_id,))


ACHIEVEMENTS = {
    "first_play": ("Langkah Pertama", "Selesaikan permainan pertamamu.", lambda: bool(_runs())),
    "mastery_1": ("Penguasa Pertama", "Kuasai 1 konsep.", lambda: _mastered() >= 1),
    "mastery_10": ("Kolektor Konsep", "Kuasai 10 konsep.", lambda: _mastered() >= 10),
    "streak_7": ("Konsisten", "Belajar 7 hari beruntun.", lambda: stats.streak_info().get("best", 0) >= 7),
    "perfect": ("Tanpa Cela", "Selesaikan permainan 5+ giliran dengan akurasi 100%.",
                lambda: any(r["total"] >= 5 and _acc(r) == 1.0 for r in _runs())),
    "no_hint": ("Mandiri", "Akurasi 80%+ pada permainan 5+ giliran tanpa petunjuk.",
                lambda: any(r["total"] >= 5 and _acc(r) >= 0.8 and _hints(r["id"]) == 0 for r in _runs())),
    "boss_win": ("Penakluk Boss", "Lulus Ujian Boss dengan akurasi 80%+.",
                 lambda: any(_acc(r) >= 0.8 for r in _runs("game='boss'"))),
    "explorer": ("Penjelajah", "Selesaikan semua 6 jenis permainan.",
                 lambda: len({r["game"] for r in _runs()}) >= 6),
    "cards_20": ("Rajin Mengulang", "Punya 20 kartu belajar.", lambda: db.scalar("SELECT COUNT(*) FROM cards") >= 20),
}


def achievements_list() -> list[dict]:
    got = {r["key"]: r["unlocked_at"] for r in db.rows("SELECT key, unlocked_at FROM achievements")}
    return [{"key": k, "title": t, "desc": d, "unlocked": k in got, "at": got.get(k)}
            for k, (t, d, _) in ACHIEVEMENTS.items()]


def _insert_once(sql: str, params) -> bool:
    """INSERT OR IGNORE; True hanya bila baris benar-benar baru (rowcount, bukan lastrowid)."""
    with db.tx() as c:
        return c.execute(sql, params).rowcount == 1


def unlock_achievements() -> list[dict]:
    """Periksa semua syarat; kembalikan lencana yang baru terbuka."""
    fresh = []
    for key, (title, desc, check) in ACHIEVEMENTS.items():
        if db.scalar("SELECT COUNT(*) FROM achievements WHERE key=?", (key,)):
            continue
        try:
            ok = bool(check())
        except Exception:
            ok = False
        if ok and _insert_once("INSERT OR IGNORE INTO achievements(key,unlocked_at) VALUES(?,?)", (key, db.now())):
            fresh.append({"key": key, "title": title, "desc": desc})
    return fresh


# ---------------------------------------------------------------- misi harian
def _day_runs() -> list[dict]:
    t = stats.today()
    return [r for r in _runs() if stats.day_of(r["finished_at"]) == t]


QUESTS = {
    "play_1": ("Selesaikan 1 permainan", 20, lambda: len(_day_runs()) >= 1),
    "two_modes": ("Mainkan 2 jenis permainan berbeda", 25, lambda: len({r["game"] for r in _day_runs()}) >= 2),
    "acc80": ("Capai akurasi 80%+ dalam satu permainan", 30, lambda: any(r["total"] >= 3 and _acc(r) >= 0.8 for r in _day_runs())),
    "ajari": ("Selesaikan Ajari Aku", 25, lambda: any(r["game"] == "ajari" for r in _day_runs())),
    "cards_5": ("Ulas 5 kartu", 20, lambda: db.scalar(
        "SELECT COUNT(*) FROM study_events WHERE day=? AND kind='cards'", (stats.today(),)) >= 5),
    "goal": ("Capai target belajar hari ini", 20, lambda: stats.streak_info()["today"]["done"]),
}


def daily_quests() -> list[dict]:
    """3 misi hari ini (dipilih deterministik dari tanggal). Misi yang terpenuhi diberi XP sekali saja."""
    day = stats.today()
    keys = random.Random(day).sample(sorted(QUESTS), 3)
    out = []
    for key in keys:
        title, xp, check = QUESTS[key]
        row = db.row("SELECT done_at FROM quests WHERE day=? AND key=?", (day, key))
        out.append({"key": key, "title": title, "xp": xp, "done": bool(row and row["done_at"])})
    return out


def check_quests() -> list[dict]:
    """Tandai misi yang baru terpenuhi, beri XP sekali. Mengembalikan misi yang baru selesai."""
    day, done = stats.today(), []
    for q in daily_quests():
        if q["done"]:
            continue
        try:
            met = bool(QUESTS[q["key"]][2]())
        except Exception:
            met = False
        if met and _insert_once("INSERT OR IGNORE INTO quests(day,key,done_at) VALUES(?,?,?)", (day, q["key"], db.now())):
            add_xp(q["xp"])
            done.append({**q, "done": True})
    return done
