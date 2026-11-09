"""Generate golden corpora from the LEGACY Python implementation.

The Rust port (`crates/belajar-core`) is tested against these files, so they must come from the real
legacy code, not from a re-implementation. Run from the repository root with the legacy
dependencies installed (`pip install -r requirements.txt`):

    python parity/gen_golden.py

Output (committed): parity/golden/py_round.jsonl, parity/golden/sm2.jsonl, parity/golden/META.json.
Generation is deterministic (fixed seeds), so re-running on the same legacy code changes nothing.
"""
from __future__ import annotations

import json
import os
import random
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "parity" / "golden"
sys.path.insert(0, str(ROOT))

# The legacy modules read their configuration at import time; point them at a throwaway directory.
os.environ.update({
    "DATA_DIR": tempfile.mkdtemp(prefix="belajar-golden-"),
    "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
    "PAF_API_TOKEN": "x", "PAF_BASE_URL": "http://127.0.0.1:9",
})

import handlers  # noqa: E402,F401  (must be imported before cards: see README "Aturan impor")
import config  # noqa: E402
import db  # noqa: E402
import profile  # noqa: E402
import stats  # noqa: E402
from cards import sm2  # noqa: E402
from datetime import date, datetime, timedelta  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402


def dump(path: Path, rows: list[dict]) -> int:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(rows)


def py_round_cases() -> list[dict]:
    rng = random.Random(20261109)
    rows: list[dict] = []

    # 1. Every exact half in a wide range: the case where Python and f64::round disagree.
    for k in range(-200, 201):
        x = k + 0.5
        rows.append({"op": "round", "x": x, "out": round(x)})

    # 2. Every percentage the app can display: round(100 * ok / n) for n up to 60.
    for n in range(1, 61):
        for ok in range(0, n + 1):
            x = 100 * ok / n
            rows.append({"op": "round", "x": x, "out": round(x)})

    # 3. Random floats (ordinary rounding must agree too).
    for _ in range(3000):
        x = rng.uniform(-1000, 1000)
        rows.append({"op": "round", "x": x, "out": round(x)})

    # 4. round(x, n) for the digit counts the app uses (2, 3, 4), incl. classic ties/near-ties.
    classic = [2.675, 0.125, 0.375, 1.005, 2.5, 0.285, 1.115, 8.345, 0.045, 5.055, 1.0049999, 0.5]
    for n in (0, 1, 2, 3, 4):
        for x in classic:
            rows.append({"op": "round_nd", "x": x, "n": n, "out": round(x, n)})
    for n in (2, 3, 4):
        for _ in range(3000):
            x = rng.uniform(-50, 50)
            rows.append({"op": "round_nd", "x": x, "n": n, "out": round(x, n)})
        for _ in range(1500):  # values that sit exactly on a decimal boundary as typed
            x = rng.randint(-5000, 5000) / 10 ** n + 5 / 10 ** (n + 1)
            rows.append({"op": "round_nd", "x": x, "n": n, "out": round(x, n)})
    return rows


def sm2_cases() -> list[dict]:
    rng = random.Random(20261109)
    cases: list[dict] = []
    todays = ["2026-11-09", "2028-02-28", "2026-12-31"]  # incl. leap-year and year-end rollover

    def add(card: dict, grade: int, today: str) -> None:
        cases.append({"card": card, "grade": grade, "today": today, "out": sm2(dict(card), grade, today)})

    # Exhaustive small grid over the states the app really produces (ease moves in steps of 0.02).
    for ease in (1.3, 1.5, 2.36, 2.5, 2.6, 2.7):
        for interval in (0, 1, 5, 6, 9, 15, 25):
            for reps in (0, 1, 2, 5):
                for grade in range(0, 6):
                    add({"ease": ease, "interval": interval, "reps": reps, "lapses": 1}, grade, todays[0])

    # Random review histories: replay a card through many grades, recording every step.
    for _ in range(250):
        card = {"ease": 2.5, "interval": 0, "reps": 0, "lapses": 0}
        for _ in range(14):
            grade = rng.choice([1, 3, 4, 4, 4, 5])
            today = rng.choice(todays)
            out = sm2(dict(card), grade, today)
            cases.append({"card": dict(card), "grade": grade, "today": today, "out": out})
            card = {k: out[k] for k in ("ease", "interval", "reps", "lapses")}
    return cases


def stats_cases() -> list[dict]:
    """Real stats.streak_info / heatmap / weekly / study_days with the database inputs patched.

    The functions read three things from outside: today, the per-day totals, and the goal settings.
    Patching those module attributes lets us call the genuine legacy functions on synthetic history.
    """
    rng = random.Random(20261109)
    cases: list[dict] = []
    saved = (stats.daily_totals, stats.goal_seconds, stats.today, db.get_setting)
    try:
        for _ in range(150):
            today = date(2026, 11, 9) + timedelta(days=rng.randint(-900, 900))
            density = rng.choice([0.0, 0.05, 0.3, 0.6, 0.9, 1.0])
            totals: dict[str, dict] = {}
            for back in range(0, rng.choice([5, 30, 140, 400])):
                if rng.random() < density:
                    d = (today - timedelta(days=back)).isoformat()
                    totals[d] = {"seconds": rng.choice([0, 30, 119, 120, 300, 599, 600, 900, 1500, 3600]),
                                 "quizzes": rng.choice([0, 0, 0, 1, 2, 3])}
            goal = rng.choice([60, 300, 600, 1200, 3600])
            weekly_setting = rng.choice(["120", "60", "3000", "abc", "", "90.5"])

            stats.daily_totals = lambda totals=totals: totals
            stats.goal_seconds = lambda goal=goal: goal
            stats.today = lambda today=today: today.isoformat()
            db.get_setting = lambda key, default=None, ws=weekly_setting: ws if key == "weekly_goal_min" else default

            cases.append({
                "today": today.isoformat(), "goal": goal, "weekly_setting": weekly_setting, "totals": totals,
                "streak_info": stats.streak_info(),
                "heatmap": stats.heatmap(60),
                "weekly": stats.weekly(),
                "study_days": stats.study_days(14),
            })
    finally:
        stats.daily_totals, stats.goal_seconds, stats.today, db.get_setting = saved
    return cases


def day_of_cases() -> list[dict]:
    """stats.day_of(ts) across time zones (incl. DST zones) and DAY_START_HOUR values."""
    rng = random.Random(20261109)
    cases: list[dict] = []
    saved = (stats._TZ, config.DAY_START_HOUR)
    try:
        for zone in ("Asia/Jakarta", "UTC", "America/New_York", "Europe/London", "Australia/Lord_Howe"):
            for start_hour in (0, 3, 5):
                stats._TZ = ZoneInfo(zone)
                config.DAY_START_HOUR = start_hour
                stamps = [rng.uniform(1.4e9, 1.9e9) for _ in range(60)]
                # Instants right around local midnight / the day-start boundary and DST switches.
                for month, day in ((3, 8), (3, 9), (3, 30), (3, 31), (10, 25), (10, 26), (11, 1), (11, 2), (1, 1), (12, 31)):
                    base = datetime(2026, month, day, tzinfo=ZoneInfo("UTC")).timestamp()
                    stamps += [base + h * 1800 for h in range(0, 96, 2)]
                for ts in stamps:
                    cases.append({"zone": zone, "start_hour": start_hour, "ts": ts, "day": stats.day_of(ts)})
    finally:
        stats._TZ, config.DAY_START_HOUR = saved
    return cases


_WORDS = ["fotosintesis", "klorofil", "mitokondria", "respirasi", "glukosa", "atp", "sitoplasma", "nukleus",
          "ribosom", "enzim", "protein", "karbohidrat", "gravitasi", "kecepatan", "percepatan", "energi", "kinetik",
          "hukum", "newton", "massa", "gaya", "tekanan", "volume", "suhu", "kalor", "asam", "basa", "garam", "ion",
          "atom", "molekul", "unsur", "senyawa", "campuran", "reaksi", "katalis", "oksidasi", "reduksi", "elektron",
          "demokrasi", "pancasila", "konstitusi", "proklamasi", "kemerdekaan", "ekonomi", "inflasi", "permintaan",
          "penawaran", "pasar", "café", "naïve", "über", "Ångström", "résumé", "tahun", "1945", "17", "agustus"]


def _mutate(rng: random.Random, text: str) -> str:
    chars = list(text)
    for _ in range(rng.choice([0, 0, 1, 1, 2, 3, 5, 8])):
        if not chars:
            break
        kind = rng.choice(["del", "ins", "sub", "swap", "case", "punct"])
        i = rng.randrange(len(chars))
        if kind == "del":
            del chars[i]
        elif kind == "ins":
            chars.insert(i, rng.choice("abcdefghijklmnopqrstuvwxyz eé"))
        elif kind == "sub":
            chars[i] = rng.choice("abcdefghijklmnopqrstuvwxyz ")
        elif kind == "swap" and i + 1 < len(chars):
            chars[i], chars[i + 1] = chars[i + 1], chars[i]
        elif kind == "case":
            chars[i] = chars[i].upper() if chars[i].islower() else chars[i].lower()
        else:
            chars.insert(i, rng.choice(".,;:!?-()"))
    return "".join(chars)


def _phrase(rng: random.Random, lo: int, hi: int) -> str:
    return " ".join(rng.choice(_WORDS) for _ in range(rng.randint(lo, hi)))


def grading_cases() -> list[dict]:
    """difflib ratio, _norm, grade_short_local and handlers._fuzzy_fallback from the legacy code."""
    import difflib
    import pipeline

    rng = random.Random(20261109)
    cases: list[dict] = []

    # SequenceMatcher: short pairs, near-duplicates, and long strings (b >= 200 chars -> autojunk).
    for _ in range(2500):
        a = _phrase(rng, 1, 8)
        b = _mutate(rng, a) if rng.random() < 0.7 else _phrase(rng, 1, 8)
        cases.append({"op": "ratio", "a": a, "b": b, "out": difflib.SequenceMatcher(None, a, b).ratio()})
    for _ in range(400):
        a = _phrase(rng, 30, 60)
        b = _mutate(rng, a) if rng.random() < 0.6 else _phrase(rng, 30, 60)
        cases.append({"op": "ratio", "a": a, "b": b, "out": difflib.SequenceMatcher(None, a, b).ratio()})
    for a, b in [("", ""), ("a", ""), ("", "a"), ("abc", "abc"), ("abcd", "bcde"), ("aaaa", "aa")]:
        cases.append({"op": "ratio", "a": a, "b": b, "out": difflib.SequenceMatcher(None, a, b).ratio()})

    # _norm
    for _ in range(600):
        text = _mutate(rng, _phrase(rng, 0, 6)) + rng.choice(["", "  ", "\n", " (x) ", "—", "日本語"])
        cases.append({"op": "norm", "text": text, "out": pipeline._norm(text)})

    # grade_short_local and the fuzzy fallback
    import handlers as legacy_handlers
    numeric_answers = ["12", "12,5", "-3", "0.75", "80%", "80 %", "1945", "3.14", "-0,5%"]
    for _ in range(3000):
        kind = rng.choice(["word", "phrase", "phrase", "numeric", "long"])
        if kind == "numeric":
            answer = rng.choice(numeric_answers)
            given = rng.choice([answer, answer.replace(",", "."), answer.replace(".", ","), "sekitar " + answer,
                                answer + " persen", str(rng.randint(-5, 2000)), _mutate(rng, answer), "tidak tahu"])
        elif kind == "word":
            answer = rng.choice(_WORDS)
            given = rng.choice([answer, answer.upper(), _mutate(rng, answer), "adalah " + answer, answer + "nya",
                                _phrase(rng, 1, 3), ""])
        elif kind == "long":
            answer = _phrase(rng, 25, 45)
            given = rng.choice([answer, _mutate(rng, answer), _phrase(rng, 25, 45)])
        else:
            answer = _phrase(rng, 2, 6)
            given = rng.choice([answer, _mutate(rng, answer), _phrase(rng, 1, 8), answer + " dan " + _phrase(rng, 1, 3),
                                " ".join(answer.split()[:-1])])
        kws = [rng.choice(_WORDS) for _ in range(rng.choice([0, 0, 1, 2, 3]))]
        if kws and rng.random() < 0.5:
            kws[0] = answer.split()[0] if answer.split() else kws[0]
        q = {"answer": answer, "keywords": json.dumps(kws, ensure_ascii=False) if kws or rng.random() < 0.5 else None}
        cases.append({"op": "grade", "given": given, "answer": answer, "keywords": kws,
                      "out": pipeline.grade_short_local(given, q),
                      "fuzzy": legacy_handlers._fuzzy_fallback(q, given)})
    return cases


def extract_json_cases() -> list[dict]:
    """llm.extract_json on valid, fenced, prose-wrapped and LaTeX-damaged model output."""
    import llm
    rng = random.Random(20261109)
    latex = [r"\frac{a}{b}", r"\beta", r"\theta", r"\text{kg}", r"\neq", r"\times", r"\nabla f", r"\to",
             r"\rho", r"\tan x", r"\sum_{i=1}^n", r"\alpha", r"\Rightarrow", r"\right)", r"\boldsymbol{v}"]
    words = ["fotosintesis", "klorofil", "energi", "kecepatan", "x", "y", "hukum", "newton", "pH", "100%", "é", "日本"]
    cases: list[dict] = []

    def value(depth=0):
        k = rng.random()
        if depth > 2 or k < 0.35:
            return rng.choice([rng.choice(words), rng.randint(-5, 500), rng.random() < 0.5, None,
                               round(rng.random() * 10, 3)])
        if k < 0.7:
            return {rng.choice(["judul", "isi", "poin", "x", "kunci", "teks"]) + str(i): value(depth + 1)
                    for i in range(rng.randint(1, 4))}
        return [value(depth + 1) for _ in range(rng.randint(0, 4))]

    def add(text):
        try:
            out = llm.extract_json(text)
            cases.append({"text": text, "ok": True, "value": out})
        except ValueError:
            cases.append({"text": text, "ok": False})

    fence = "`" * 3
    nl = chr(10)
    for _ in range(900):
        obj = {"judul": rng.choice(words), "data": value()}
        raw = json.dumps(obj, ensure_ascii=rng.random() < 0.3)
        variant = rng.choice(["plain", "fence", "fence_plain", "prose", "think", "latex", "latex_prose", "two",
                              "trail", "garbage"])
        if variant == "plain":
            add(raw)
        elif variant == "fence":
            add(fence + "json" + nl + raw + nl + fence)
        elif variant == "fence_plain":
            add(fence + nl + raw + nl + fence)
        elif variant == "prose":
            add(rng.choice(["Tentu, ini hasilnya:" + nl, "Berikut JSON-nya: ", ""]) + raw
                + rng.choice(["", nl + nl + "Semoga membantu!", " [1]"]))
        elif variant == "think":
            add("<think>" + rng.choice(words) + ' {"x": 1}' + "</think>" + nl + raw)
        elif variant in ("latex", "latex_prose"):
            # A model writes LaTeX with single backslashes inside a JSON string: json.dumps escapes
            # them to a double backslash, so undo that to get the invalid-JSON form models produce.
            piece = rng.choice(latex)
            damaged = json.dumps({"judul": "rumus " + piece + " selesai", "n": rng.randint(0, 9)})
            damaged = damaged.replace(chr(92) * 2, chr(92))
            add(damaged if variant == "latex" else "Ini: " + damaged + " sekian")
        elif variant == "two":
            add("Pertama " + raw + " lalu [1, 2, 3] dan " + json.dumps({"z": 1}))
        elif variant == "trail":
            add(raw[:-1] + ",}")
        else:
            add(rng.choice(["tidak ada json", "", "{", "[1, 2", "}{", "  ", "x = 5; y = [", "{'a': 1}"]))
    return cases


_SAN_FRAGMENTS = [
    "# Judul Besar", "## Subjudul", "### Bagian", "#TanpaSpasi", "####### bukan judul",
    "Fotosintesis mengubah cahaya menjadi energi kimia.", "Rumus: $E = mc^2$ dan $$ \\frac{a}{b} $$ selesai.",
    "• butir satu", "◦ butir dua", "- butir biasa", "* bintang", "1. satu", "2) dua", "\t- bertab",
    "| Nama | Nilai |", "|---|---|", "| a | 1 |", "| b | 2 | 3 |", "| x |", "|:--|--:|",
    "Harga $5 dan $10 saja", "Biaya 100$ per $ item", "\\(x + y\\)", "\\[ z = 1 \\]", "\\[\na^2\n\\]",
    "x² + y³ = z", "√(x+1) dan √y", "E = mc²", "\\frac{1}{2}", "Nilai \\frac{a}{b} adalah", "- \\alpha + \\beta",
    "\\sum_{i=1}^n i", "α, β dan θ", "30° C", "A → B ⇒ C", "p ≤ q ≠ r", "a_1 dan b^2", "x^{10} + y^2",
    "```python\nprint('hai')\n\n\ndef f():\n    # komentar\n    return 1\n```", "```\nteks polos\n```",
    "~~~js\nlet a = 1;\n~~~", "```py\nx = 1", "Berikut kodenya: ```python\nprint(1)\n```", "`inline $x$ kode`",
    "```kode``` satu baris", "  ```bash\n  ls -la\n  ```", "```markdown\n# di dalam\n```",
    "baris dengan \\n literal dan \\t tab", "rumus $\\neq$ dan $\\theta$ dan $\\nabla f$ dan \\never \\next",
    "\\ne \\neq \\nu \\rho \\right \\times \\to \\tan", "<think>penalaran {\"a\":1}</think>Jawaban akhir",
    "<think>tidak ditutup", "{\"content\": \"isi bungkus\"}", "{\"a\": 1, \"b\": 2}", "{\"response\": \"  \"}",
    "", "   ", "\n\n\n\n", "teks\twith\ttabs", "akhir dengan spasi   ", "日本語 dan émoji 🙂", "$", "$$", "``", "```",
    "\\\\n ganda", "kutip \"dalam\" dan 'tunggal'", "\\begin{align} a &= b \\\\ c &= d \\end{align}",
    "$a + {b$ dan $c}$", "$$ \\sqrt{x $$", "Total $ 5", "$ spasi awal$ dan $akhir spasi $",
]


def sanitize_cases() -> list[dict]:
    """Every stage of sanitize.py, plus the composed cleaners, on fragment-built Markdown."""
    import sanitize as S
    rng = random.Random(20261109)
    seps = ["\n", "\n\n", " ", "\n\n\n", "\r\n", "\n  "]
    cases: list[dict] = []
    for _ in range(360):
        parts = [rng.choice(_SAN_FRAGMENTS) for _ in range(rng.randint(1, 7))]
        text = "".join(p + rng.choice(seps) for p in parts)
        if rng.random() < 0.15:
            text = "```markdown\n" + text + "\n```"
        if rng.random() < 0.08:
            text = '{"content": ' + json.dumps(text) + "}"
        if rng.random() < 0.1:
            text = _mutate(rng, text)
        cases.append({
            "text": text,
            "strip_think": S.strip_think(text),
            "unwrap_fence": S.unwrap_fence(text),
            "unwrap_json_shell": S.unwrap_json_shell(text),
            "unescape_literals": S.unescape_literals(text),
            "normalize_fence_markers": S.normalize_fence_markers(text),
            "clean_md": S.clean_md(text),
            "clean_inline": S.clean_inline(text),
            "clean_inline_one": S.clean_inline(text, one_line=True),
            "normalize_fences": S.normalize_fences(text),
            "normalize_math": S.normalize_math(text),
            "fix_math_text": S.fix_math_text(text),
            "normalize_structure": S.normalize_structure(text),
            "lint_math": S.lint_math(text),
            "clean_note": S.clean_note(text),
        })
    return cases


def level_cases() -> list[dict]:
    xps = list(range(0, 1500)) + list(range(1500, 200000, 97))
    return [{"xp": xp, "out": profile.level_info(xp)} for xp in xps]


def mastery_level_cases() -> list[dict]:
    """`play_director.mastery_level`: every boundary of score (50, 75), evidence count (4) and kinds (2)."""
    from play_director import mastery_level
    scores = [0, 0.0, 12.5, 49.99, 50, 50.0, 50.01, 74.99, 75, 75.0, 75.01, 99.5, 100]
    kind_sets = [None, [], ["a"], ["a", "a"], ["a", "b"], ["a", "a", "b"], ["a", "b", "c"]]
    rows = []
    for score in scores:
        for n in (-1, 0, 1, 3, 4, 5, 20):
            for kinds in kind_sets:
                rows.append({"score": score, "n": n, "kinds": kinds, "out": mastery_level(score, n, kinds)})
    return rows


def cards_export_cases() -> list[dict]:
    """`cards_export` run on the real legacy code against a real (temporary) legacy SQLite file."""
    import cards
    db.init()
    scenarios = [
        [],
        [("Fotosintesis", "Proses membuat makanan", "Biologi Bab 1")],
        [("a\tb", "x\ty", "T\tT"), ("line1\nline2", "r1\r\nr2", "multi\nline title"),
         ("kosong ", "", "  spasi  banyak  "), ("emoji 🚀", "café — naïve", "Título ñ")],
        [(f"istilah {i}", f"definisi {i}\nbaris dua", "Judul Panjang Sekali" if i % 2 else "J") for i in range(12)],
    ]
    out = []
    for n, scenario in enumerate(scenarios):
        db.run("DELETE FROM cards")
        db.run("DELETE FROM documents")
        titles: dict[str, int] = {}
        for front, back, title in scenario:
            if title not in titles:
                titles[title] = db.run(
                    "INSERT INTO documents(title, filename, status, created_at, updated_at) VALUES(?,?,?,?,?)",
                    (title, "f.pdf", "ready", 1.0, 1.0))
            doc_id = db.scalar("SELECT id FROM documents WHERE title=?", (title,))
            db.run("INSERT INTO cards(document_id, front, back, due_day, created_at) VALUES(?,?,?,?,?)",
                   (doc_id, front, back, "2026-01-01", 1.0))
        out.append({"cards": [{"front": f, "back": b, "title": t} for f, b, t in scenario],
                    "out": cards.cards_export({})})
    return out


# The commit whose Python code defines the reference behaviour. Pinned (not `git rev-parse HEAD`)
# so META.json does not change on every commit. The ported modules (cards.py, Python round()) are
# untouched since this commit; bump it only after re-checking that the corpora are unchanged.
LEGACY_REFERENCE_COMMIT = "71b23cc"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    counts = {
        "py_round.jsonl": dump(OUT / "py_round.jsonl", py_round_cases()),
        "sm2.jsonl": dump(OUT / "sm2.jsonl", sm2_cases()),
        "stats.jsonl": dump(OUT / "stats.jsonl", stats_cases()),
        "day_of.jsonl": dump(OUT / "day_of.jsonl", day_of_cases()),
        "level.jsonl": dump(OUT / "level.jsonl", level_cases()),
        "grading.jsonl": dump(OUT / "grading.jsonl", grading_cases()),
        "extract_json.jsonl": dump(OUT / "extract_json.jsonl", extract_json_cases()),
        "sanitize.jsonl": dump(OUT / "sanitize.jsonl", sanitize_cases()),
        "mastery_level.jsonl": dump(OUT / "mastery_level.jsonl", mastery_level_cases()),
        "cards_export.jsonl": dump(OUT / "cards_export.jsonl", cards_export_cases()),
    }
    meta = {
        "generated_by": "parity/gen_golden.py",
        "legacy_commit": LEGACY_REFERENCE_COMMIT,
        "python": sys.version.split()[0],
        "cases": counts,
        "note": "Outputs of the legacy Python code. Do not edit by hand; regenerate instead.",
    }
    (OUT / "META.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
