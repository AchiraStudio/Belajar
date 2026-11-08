"""Jalankan tumpukan lokal (PAF tiruan + server + agent), isi data contoh, ambil screenshot semua halaman.
Pemakaian: python tests/shots.py <folder_keluaran> [dark]"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
DARK = len(sys.argv) > 2 and sys.argv[2] == "dark"
TMP = Path(tempfile.mkdtemp())
PORT, PAF = 3071, 9171
env = dict(os.environ, APP_PASSWORD="kata-sandi-uji-123", SESSION_SECRET="rahasia-sesi-uji-0123456789",
           BRIDGE_TOKEN="bridge-token-uji-0123456789", PORT=str(PORT), HOST="127.0.0.1", DATA_DIR=str(TMP / "data"))
procs = []


def spawn(cmd, cwd, extra=None):
    p = subprocess.Popen(cmd, cwd=cwd, env=dict(env, **(extra or {})), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procs.append(p)


def api(path, body=None, cookie=""):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json", "cookie": cookie})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}"), r.headers


try:
    subprocess.run([sys.executable, str(ROOT / "tests/make_fixtures.py"), str(TMP / "fx")], check=True, capture_output=True)
    spawn([sys.executable, str(ROOT / "tests/mock_paf.py"), str(PAF)], ROOT)
    spawn(["node", "server.js"], ROOT / "server")
    time.sleep(1.5)
    spawn([sys.executable, "agent.py"], ROOT, dict(BRIDGE_URL=f"ws://127.0.0.1:{PORT}/bridge", PAF_BASE_URL=f"http://127.0.0.1:{PAF}",
          PAF_API_TOKEN="paf_testtoken_1234567890", CHUNK_CHARS="1500", LLM_BACKOFF_BASE="0.05"))
    time.sleep(2.5)
    _, h = api("/api/login", {"password": "kata-sandi-uji-123"})
    cookie = h["Set-Cookie"].split(";")[0]
    rpc = lambda a, b=None: api("/api/rpc/" + a, b or {}, cookie)[0]["data"]  # noqa: E731

    # unggah lewat multipart
    import requests
    ids = []
    for name, extra in [("bio.docx", {"new_subject": "Biologi", "title": "Fotosintesis dan Respirasi"}),
                        ("slides.pptx", {"new_subject": "Sejarah", "title": "Revolusi Industri"}),
                        ("teks.pdf", {"title": "Ekonomi Makro"})]:
        r = requests.post(f"http://127.0.0.1:{PORT}/api/upload", files={"file": open(TMP / "fx" / name, "rb")},
                          data=extra, headers={"cookie": cookie}).json()
        ids.append(r["data"]["doc_id"])
    for i in ids:
        for _ in range(120):
            if rpc("get_document", {"id": i})["document"]["status"] == "ready":
                break
            time.sleep(0.5)
    # kuis + beberapa percobaan agar grafik terisi
    quizzes = []
    for i in ids[:2]:
        j = rpc("generate_quiz", {"document_id": i, "count": 10, "types": ["mcq", "tf", "short"]})["job_id"]
        for _ in range(120):
            job = rpc("get_job", {"id": j})
            if job["status"] in ("done", "failed"):
                break
            time.sleep(0.4)
        quizzes.append(job["result"]["quiz_id"])
    import random
    random.seed(4)
    for qz in quizzes * 2:
        att = rpc("start_attempt", {"quiz_id": qz, "mode": "practice"})
        for q in att["questions"]:
            given = random.choice(["0", "1", "0"]) if q["qtype"] == "mcq" else random.choice(["true", "false"]) if q["qtype"] == "tf" else random.choice(["klorofil", "salah"])
            rpc("check_answer", {"attempt_id": att["attempt"]["id"], "question_id": q["id"], "given": given})
        rpc("finish_attempt", {"attempt_id": att["attempt"]["id"], "answers": {}, "duration": 240})
    rpc("log_study", {"document_id": ids[0], "seconds": 100})
    # soal yang sedang dikerjakan (belum selesai) untuk screenshot runner
    live = rpc("start_attempt", {"quiz_id": quizzes[0], "mode": "practice"})
    first = live["questions"][0]
    rpc("check_answer", {"attempt_id": live["attempt"]["id"], "question_id": first["id"], "given": "0" if first["qtype"] == "mcq" else "true"})
    done_attempt = rpc("progress")["trend"][-1]["id"]

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        for tag, vp in [("d", {"width": 1366, "height": 860}), ("m", {"width": 390, "height": 800})]:
            ctx = br.new_context(viewport=vp, color_scheme="dark" if DARK else "light", device_scale_factor=1)
            page = ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            page.goto(f"http://127.0.0.1:{PORT}/")
            page.wait_for_selector("#pw")
            page.screenshot(path=str(OUT / f"{tag}-0-login.png"))
            page.fill("#pw", "kata-sandi-uji-123"); page.press("#pw", "Enter")
            page.wait_for_selector(".shell")
            pages = [("1-home", "#/"), ("2-materi", "#/materi"), ("3-catatan", f"#/materi/{ids[0]}"), ("4-kuis", "#/kuis"),
                     ("5-latihan", f"#/latihan/{live['attempt']['id']}"), ("6-hasil", f"#/hasil/{done_attempt}"), ("7-progres", "#/progres")]
            for name, hash_ in pages:
                page.evaluate(f"location.hash = '{hash_}'")
                page.wait_for_timeout(1300)
                page.screenshot(path=str(OUT / f"{tag}-{name}.png"), full_page=(tag == "d" and name in ("1-home", "3-catatan", "7-progres", "6-hasil")))
            # kondisi tambahan: dialog, ujian, hasil topik
            exam = rpc("start_attempt", {"quiz_id": quizzes[0], "mode": "exam", "time_limit_min": 10})
            extra = [("8-ujian", f"#/latihan/{exam['attempt']['id']}", None), ("9-unggah", "#/materi", "Unggah materi"),
                     ("10-kelola", "#/materi", "Kelola mata pelajaran"), ("11-cari", "#/materi?s=1", None)]
            for name, hash_, click in extra:
                page.evaluate(f"location.hash = '{hash_}'")
                page.wait_for_timeout(1000)
                if click:
                    page.get_by_role("button", name=click).first.click()
                    page.wait_for_timeout(500)
                page.screenshot(path=str(OUT / f"{tag}-{name}.png"))
                page.keyboard.press("Escape")
            if errs:
                print("ERROR JS:", errs[:5])
            ctx.close()
        br.close()
    print("screenshot selesai ->", OUT, sorted(p.name for p in OUT.iterdir()))
finally:
    for p in procs:
        p.terminate()
