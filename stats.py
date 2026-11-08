"""Streak harian, ringkasan waktu belajar, dan statistik progres."""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

import config
import db

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo(config.TIMEZONE)
except Exception:  # tzdata belum terpasang: pakai WIB tetap (UTC+7)
    _TZ = timezone(timedelta(hours=7))

MAX_FREEZES = 2          # streak freeze maksimal yang bisa disimpan
FREEZE_EVERY = 7         # dapat 1 freeze setiap kelipatan 7 hari streak


def day_of(ts: float | None = None) -> str:
    moment = datetime.fromtimestamp(time.time() if ts is None else ts, _TZ)
    return (moment - timedelta(hours=config.DAY_START_HOUR)).date().isoformat()


def today() -> str:
    return day_of()


def log_event(kind: str, document_id=None, seconds: int = 0, quizzes: int = 0) -> None:
    ts = time.time()
    db.run(
        "INSERT INTO study_events(ts,day,kind,document_id,seconds,quizzes) VALUES(?,?,?,?,?,?)",
        (ts, day_of(ts), kind, document_id, int(seconds), int(quizzes)),
    )


def daily_totals() -> dict:
    out = {}
    for r in db.rows("SELECT day, SUM(seconds) s, SUM(quizzes) q FROM study_events GROUP BY day"):
        out[r["day"]] = {"seconds": int(r["s"] or 0), "quizzes": int(r["q"] or 0)}
    return out


def goal_seconds() -> int:
    try:
        return max(60, int(float(db.get_setting("daily_goal_min", "10")) * 60))
    except (TypeError, ValueError):
        return 600


def is_active(day_info: dict | None, goal: int) -> bool:
    if not day_info:
        return False
    return day_info["quizzes"] >= 1 or day_info["seconds"] >= goal


def compute_streak(active: set, today_iso: str) -> dict:
    """Hitung streak. Hari terlewat dijembatani oleh freeze (didapat tiap 7 hari streak)."""
    if not active:
        return {"current": 0, "longest": 0, "freezes": 0, "freeze_used": []}
    cur = date.fromisoformat(min(active))
    end = date.fromisoformat(today_iso)
    streak = longest = freezes = 0
    used: list[str] = []
    while cur <= end:
        iso = cur.isoformat()
        if iso in active:
            streak += 1
            longest = max(longest, streak)
            if streak % FREEZE_EVERY == 0 and freezes < MAX_FREEZES:
                freezes += 1
        elif cur < end:  # hari ini belum dihakimi, masih bisa dikerjakan
            if freezes > 0:
                freezes -= 1
                used.append(iso)
            else:
                streak = 0
        cur += timedelta(days=1)
    return {"current": streak, "longest": longest, "freezes": freezes, "freeze_used": used[-5:]}


def streak_info() -> dict:
    totals = daily_totals()
    goal = goal_seconds()
    active = {d for d, info in totals.items() if is_active(info, goal)}
    t = today()
    info = compute_streak(active, t)
    today_info = totals.get(t, {"seconds": 0, "quizzes": 0})
    done = is_active(today_info, goal)
    info.update({
        "today": {
            "day": t,
            "seconds": today_info["seconds"],
            "quizzes": today_info["quizzes"],
            "goal_seconds": goal,
            "done": done,
        },
        "at_risk": (not done) and info["current"] > 0,
    })
    return info


def heatmap(days: int = 140) -> list[dict]:
    totals = daily_totals()
    goal = goal_seconds()
    end = date.fromisoformat(today())
    out = []
    for i in range(days - 1, -1, -1):
        d = (end - timedelta(days=i)).isoformat()
        info = totals.get(d, {"seconds": 0, "quizzes": 0})
        s, q = info["seconds"], info["quizzes"]
        if s == 0 and q == 0:
            level = 0
        elif q == 0 and s < goal / 2:
            level = 1
        elif q == 0 and s < goal:
            level = 2
        elif s >= goal * 2 or q >= 2:
            level = 4
        else:
            level = 3
        out.append({"day": d, "seconds": s, "quizzes": q, "level": level})
    return out


def week_range() -> tuple[str, str]:
    end = date.fromisoformat(today())
    start = end - timedelta(days=end.weekday())  # Senin
    return start.isoformat(), end.isoformat()


def weekly() -> dict:
    start, _ = week_range()
    totals = daily_totals()
    seconds = sum(v["seconds"] for d, v in totals.items() if d >= start)
    quizzes = sum(v["quizzes"] for d, v in totals.items() if d >= start)
    try:
        goal_min = int(float(db.get_setting("weekly_goal_min", "120")))
    except (TypeError, ValueError):
        goal_min = 120
    return {"start": start, "seconds": seconds, "quizzes": quizzes, "goal_min": goal_min}


def study_days(days: int = 14) -> list[dict]:
    totals = daily_totals()
    end = date.fromisoformat(today())
    out = []
    for i in range(days - 1, -1, -1):
        d = (end - timedelta(days=i)).isoformat()
        info = totals.get(d, {"seconds": 0, "quizzes": 0})
        out.append({"day": d, **info})
    return out


# ---------------------------------------------------------------- progres kuis
_FINISHED = "t.finished_at IS NOT NULL"


def weak_question_ids(subject_id: int | None = None, limit: int | None = None) -> list[int]:
    """Soal yang jawaban terakhirnya salah."""
    sql = f"""
      SELECT q.id FROM questions q
      JOIN quizzes z ON z.id = q.quiz_id
      LEFT JOIN documents d ON d.id = z.document_id
      JOIN answers a ON a.question_id = q.id
      JOIN attempts t ON t.id = a.attempt_id AND {_FINISHED}
      WHERE a.correct = 0
        AND a.id = (SELECT MAX(a2.id) FROM answers a2
                    JOIN attempts t2 ON t2.id = a2.attempt_id AND t2.finished_at IS NOT NULL
                    WHERE a2.question_id = q.id)
    """
    params: list = []
    if subject_id:
        sql += " AND COALESCE(d.subject_id, z.subject_id) = ?"
        params.append(subject_id)
    sql += " ORDER BY a.ts ASC"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    return [r["id"] for r in db.rows(sql, params)]


def topic_stats() -> list[dict]:
    rows = db.rows(f"""
      SELECT COALESCE(NULLIF(q.topic,''),'Umum') AS topic,
             COUNT(*) AS n, SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END) AS ok
      FROM answers a
      JOIN attempts t ON t.id = a.attempt_id AND {_FINISHED}
      JOIN questions q ON q.id = a.question_id
      WHERE a.correct IS NOT NULL
      GROUP BY 1
    """)
    out = []
    for r in rows:
        acc = round(100 * (r["ok"] or 0) / r["n"]) if r["n"] else 0
        level = "weak" if (r["n"] >= 3 and acc < 60) else ("strong" if (r["n"] >= 3 and acc >= 80) else "mid")
        out.append({"topic": r["topic"], "n": r["n"], "ok": r["ok"] or 0, "acc": acc, "level": level})
    out.sort(key=lambda x: (x["acc"], -x["n"]))
    return out


def document_stats() -> list[dict]:
    rows = db.rows(f"""
      SELECT d.id, d.title, COUNT(a.id) AS n,
             SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END) AS ok
      FROM answers a
      JOIN attempts t ON t.id = a.attempt_id AND {_FINISHED}
      JOIN questions q ON q.id = a.question_id
      JOIN quizzes z ON z.id = q.quiz_id
      JOIN documents d ON d.id = z.document_id
      WHERE a.correct IS NOT NULL
      GROUP BY d.id ORDER BY d.title
    """)
    return [{"id": r["id"], "title": r["title"], "n": r["n"],
             "acc": round(100 * (r["ok"] or 0) / r["n"]) if r["n"] else 0} for r in rows]


def score_trend(limit: int = 30) -> list[dict]:
    rows = db.rows(f"""
      SELECT t.id, t.finished_at AS ts, t.score, t.total, t.mode,
             COALESCE(z.title, 'Ulangi soal lemah') AS title
      FROM attempts t LEFT JOIN quizzes z ON z.id = t.quiz_id
      WHERE {_FINISHED} AND t.total > 0
      ORDER BY t.finished_at DESC LIMIT ?
    """, (limit,))
    rows.reverse()
    for r in rows:
        r["pct"] = round(100 * (r["score"] or 0) / r["total"])
    return rows


def overall() -> dict:
    a = db.row(f"""
      SELECT COUNT(*) AS attempts FROM attempts t WHERE {_FINISHED}
    """)
    ans = db.row(f"""
      SELECT COUNT(*) AS n, SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END) AS ok
      FROM answers a JOIN attempts t ON t.id=a.attempt_id AND {_FINISHED}
      WHERE a.correct IS NOT NULL
    """)
    n = ans["n"] or 0
    return {
        "attempts": a["attempts"],
        "answers": n,
        "accuracy": round(100 * (ans["ok"] or 0) / n) if n else None,
        "study_seconds": int(db.scalar("SELECT SUM(seconds) FROM study_events", default=0)),
        "documents": db.scalar("SELECT COUNT(*) FROM documents"),
        "quizzes": db.scalar("SELECT COUNT(*) FROM quizzes"),
        "questions": db.scalar("SELECT COUNT(*) FROM questions"),
    }
