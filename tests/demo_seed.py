import json, random, sqlite3, sys, time
from datetime import datetime, timedelta
from pathlib import Path
import requests
D = Path(sys.argv[1]); B = "http://127.0.0.1:3060"
s = requests.Session()
s.post(B + "/api/login", json={"password": "demo-password-123"}).raise_for_status()
def rpc(a, **k):
    r = s.post(f"{B}/api/rpc/{a}", json=k); r.raise_for_status(); return r.json()["data"]
def up(name, **f):
    with open(D / "fx" / name, "rb") as fh:
        r = s.post(B + "/api/upload", files={"file": (name, fh)}, data=f); r.raise_for_status(); return r.json()["data"]
def wait(job):
    for _ in range(200):
        j = rpc("get_job", id=job)
        if j["status"] in ("done", "failed"): return j
        time.sleep(0.2)
docs = [up("bio.docx", new_subject="Biologi", title="Fotosintesis dan Respirasi Seluler", style="ringkas"),
        up("slides.pptx", new_subject="Sejarah", title="Revolusi Industri di Eropa", style="detail"),
        up("teks.pdf", subject_id="2", title="Catatan Kuliah Ekonomi Makro")]
for d in docs: wait(d["job_id"])
random.seed(7)
quizzes = []
for d in docs[:2]:
    j = wait(rpc("generate_quiz", document_id=d["doc_id"], count=10, types=["mcq", "tf", "short"])["job_id"])
    quizzes.append(j["result"]["quiz_id"])
for qi, pcts in zip(quizzes, [[0.4, 0.6, 0.8], [0.5, 0.7]]):
    for p in pcts:
        att = rpc("start_attempt", quiz_id=qi, mode="practice")
        aid = att["attempt"]["id"]
        for q in att["questions"]:
            good = random.random() < p
            if q["qtype"] == "mcq": g = "0" if good else "2"
            elif q["qtype"] == "tf": g = "true" if good else "false"
            else: g = "klorofil" if good else "mitokondria"
            rpc("check_answer", attempt_id=aid, question_id=q["id"], given=g)
        r = rpc("finish_attempt", attempt_id=aid, answers={}, duration=240)
        if r["attempt"]["grading"] == "pending": wait(r["attempt"]["grading_job"])
# riwayat belajar 9 hari terakhir (streak) + sebaran acak sebelumnya
con = sqlite3.connect(D / "data" / "belajar.db")
today = datetime.now().date()
rows = []
for i in range(1, 140):
    day = today - timedelta(days=i)
    if i <= 9 or (i > 12 and random.random() < 0.45):
        sec = random.choice([300, 600, 900, 1500, 2400]) if i > 1 else 1500
        rows.append((time.time() - i * 86400, day.isoformat(), "read", None, sec, 1 if random.random() < .3 else 0))
con.executemany("INSERT INTO study_events(ts,day,kind,document_id,seconds,quizzes) VALUES(?,?,?,?,?,?)", rows)
con.commit(); con.close()
print("seed ok")
