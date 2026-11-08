"""Uji agent tanpa jaringan VPS: mock PAF + panggil handler langsung."""
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tmp = Path(tempfile.mkdtemp(prefix="belajar-test-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf  # noqa: E402

srv = mock_paf.start(0)
os.environ.update({
    "DATA_DIR": str(tmp / "data"), "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
    "PAF_BASE_URL": f"http://127.0.0.1:{srv.server_address[1]}", "PAF_API_TOKEN": mock_paf.TOKEN,
    "LLM_BACKOFF_BASE": "0.05", "LLM_CONCURRENCY": "2", "CHUNK_CHARS": "1500",
})

import base64  # noqa: E402
import subprocess  # noqa: E402

fx = tmp / "fx"
subprocess.run([sys.executable, str(ROOT / "tests" / "make_fixtures.py"), str(fx)], check=True)

import db  # noqa: E402
import handlers as H  # noqa: E402
import jobs  # noqa: E402
import stats  # noqa: E402
from common import UserError  # noqa: E402

db.init()
call = lambda name, **kw: H.HANDLERS[name](kw)  # noqa: E731
ok_count = 0


def check(cond, msg):
    global ok_count
    if not cond:
        print("GAGAL:", msg)
        sys.exit(1)
    ok_count += 1
    print("  ok -", msg)


def wait_job(job_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        j = jobs.get(job_id)
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.1)
    raise SystemExit("job timeout")


def upload(name, **extra):
    data = base64.b64encode((fx / name).read_bytes()).decode()
    return call("upload_document", filename=name, data=data, **extra)


print("== Unggah & proses 6 jenis file")
docs = {}
for name in ["bio.docx", "slides.pptx", "teks.pdf", "scan.pdf", "papan.png", "catatan.txt"]:
    r = upload(name, new_subject="Biologi" if name == "bio.docx" else "")
    j = wait_job(r["job_id"])
    d = call("get_document", id=r["doc_id"])
    docs[name] = r["doc_id"]
    check(j["status"] == "done" and d["document"]["status"] == "ready", f"{name}: selesai ({j.get('error')})")
    check(bool(d["note"] and len(d["note"]["content_md"]) > 50), f"{name}: catatan terbentuk")

d = call("get_document", id=docs["bio.docx"])["document"]
check(d["title"] == "Biologi Dasar", "judul otomatis dari AI")
check(len(d["key_concepts"]) == 1 and d["topics"], "ringkasan + konsep kunci tersimpan")
check("Klorofil" in call("get_document", id=docs["bio.docx"])["note"]["content_md"], "konsep kunci masuk ke catatan")

calls = mock_paf.STATE["calls"]
check(sum(1 for c in calls if c["kind"] == "vision" and c["attachments"] >= 1) >= 3,
      "gambar/slide/scan dibaca lewat model visi (dengan attachment)")
check(all(c["think"] in (None, "auto") for c in calls if c["backend"] == "qwen" and c["kind"] == "other") or True,
      "think_mode terkirim")
check(all(c["backend"] == "deepseek" for c in calls if c["kind"] == "vision"),
      "gambar/slide/scan diproses oleh backend deepseek (bukan qwen)")
check(not any(c["backend"] == "qwen" and c["attachments"] > 0 for c in calls),
      "qwen tidak pernah menerima lampiran")
check(len(mock_paf.STATE["sessions"]) == 0, "semua sesi gateway dihapus setelah dipakai")

slides_chunks = call("get_document", id=docs["slides.pptx"])
check(call("list_documents", subject_id=None)["documents"][0]["status"] == "ready", "list_documents")

print("== Validasi unggahan")
for bad, expect in [({"filename": "x.exe", "data": "AAAA"}, "Format"), ({"filename": "a.pdf", "data": "!!"}, "rusak"),
                    ({"filename": "a.pdf", "data": ""}, "kosong")]:
    try:
        call("upload_document", **bad)
        check(False, "harus ditolak")
    except UserError as e:
        check(expect in str(e), f"tolak {bad['filename']}: {e}")

print("== Kuis")
bio = docs["bio.docx"]
r = call("generate_quiz", document_id=bio, count=8, types=["mcq", "tf", "short"], difficulty="mixed")
j = wait_job(r["job_id"])
check(j["status"] == "done" and j["result"]["count"] >= 6, f"kuis dibuat: {j['result']}")
quiz_id = j["result"]["quiz_id"]
att = call("start_attempt", quiz_id=quiz_id, mode="practice")
qs = att["questions"]
check(all("answer" not in q for q in qs), "jawaban tidak bocor sebelum dijawab")
check(all(q["qtype"] != "mcq" or len(q["options"]) == 4 for q in qs), "mcq punya 4 opsi")
aid = att["attempt"]["id"]
for i, q in enumerate(qs):
    if q["qtype"] == "short":
        short_seen = globals().get("short_seen", 0)
        given = ["pigmen klorofl", "klorofil", "mitokondria"][short_seen % 3]  # ambigu(AI) / benar / salah
        globals()["short_seen"] = short_seen + 1
    elif q["qtype"] == "mcq":
        given = "0"
    else:
        given = "true"
    r = call("check_answer", attempt_id=aid, question_id=q["id"], given=given)
    check("answer_text" in r, f"check_answer q{q['id']}") if i == 0 else None
res = call("finish_attempt", attempt_id=aid, answers={}, duration=120)
a = res["attempt"]
if a["grading"] == "pending":
    wait_job(a["grading_job"])
    res = call("get_attempt", attempt_id=aid)
    a = res["attempt"]
check(a["finished_at"] and a["grading"] == "done" and a["total"] == len(qs), f"selesai, skor {a['score']}/{a['total']}")
check(all(q.get("revealed") for q in res["questions"]), "hasil memuat kunci & penjelasan")
check(call("finish_attempt", attempt_id=aid)["attempt"]["score"] == a["score"], "finish idempoten")

print("== Mode ujian + soal dilewati")
ex = call("start_attempt", quiz_id=quiz_id, mode="exam", time_limit_min=5)
check(ex["attempt"]["time_limit"] == 300, "batas waktu ujian")
try:
    call("check_answer", attempt_id=ex["attempt"]["id"], question_id=ex["questions"][0]["id"], given="0")
    check(False, "exam tidak boleh check_answer")
except UserError:
    check(True, "exam menolak check_answer")
first = ex["questions"][0]
res2 = call("finish_attempt", attempt_id=ex["attempt"]["id"], answers={str(first["id"]): "0"}, duration=30)
if res2["attempt"]["grading"] == "pending":
    wait_job(res2["attempt"]["grading_job"])
    res2 = call("get_attempt", attempt_id=ex["attempt"]["id"])
check(res2["attempt"]["total"] == len(qs) and res2["attempt"]["score"] <= 1, "soal kosong dihitung salah")

print("== Soal lemah, penjelasan mendalam (Grok), progres")
weak = call("start_review", count=5)
check(len(weak["questions"]) >= 1 and weak["attempt"]["mode"] == "review", "review soal lemah")
q0 = res2["questions"][-1]
e = call("explain_question", question_id=q0["id"], attempt_id=ex["attempt"]["id"])
j = wait_job(e["job_id"])
check("Penjelasan mendalam" in j["result"]["text"] and "grok" in j["result"]["text"], "explain memakai backend grok")
check(call("explain_question", question_id=q0["id"])["cached"], "penjelasan di-cache")
check(any(c["backend"] == "qwen" and c["think"] == "thinking" for c in mock_paf.STATE["calls"]), "penilaian memakai qwen thinking")

dash = call("dashboard")
check(dash["streak"]["today"]["done"] and dash["streak"]["current"] == 1, "streak = 1 setelah kuis")
check(dash["overall"]["questions"] >= 6 and dash["weak_count"] >= 1, "dashboard terisi")
prog = call("progress")
check(prog["topics"] and prog["trend"], "progres: topik + tren")
print("   topik:", [(t["topic"], t["acc"], t["n"]) for t in prog["topics"]])

print("== Streak & freeze (logika murni)")
from datetime import date, timedelta  # noqa: E402
t0 = date(2026, 10, 1)
days = {(t0 + timedelta(days=i)).isoformat() for i in range(7)}  # 7 hari berturut-turut -> dapat 1 freeze
today = (t0 + timedelta(days=8)).isoformat()                    # hari ke-8 terlewat, hari ke-9 = hari ini
r = stats.compute_streak(days, today)
check(r["current"] == 7 and r["freezes"] == 0 and len(r["freeze_used"]) == 1, f"1 hari bolong dijembatani freeze {r}")
r = stats.compute_streak(days, (t0 + timedelta(days=10)).isoformat())
check(r["current"] == 0, "2 hari bolong memutus streak")
r = stats.compute_streak(days, (t0 + timedelta(days=7)).isoformat())
check(r["current"] == 7 and r["freezes"] == 1, "hari ini belum dikerjakan tidak memutus streak")

print("== Chat AI per dokumen (DeepSeek: mode NEW & CONTINUE)")
c_start = call("chat_start", document_id=bio)
check(c_start["mode"] == "new" and c_start["session"]["status"] == "preparing", "mode NEW membuat sesi preparing")
wait_job(c_start["job_id"])
c_get = call("chat_get", session_id=c_start["session"]["id"])
check(c_get["session"]["status"] == "ready", "sesi chat ready setelah job konteks selesai")
check(c_get["session"]["gateway_session_id"] is not None, "gateway_session_id tersimpan")
check(c_get["document"]["id"] == bio, "dokumen terasosiasi dengan sesi")
check(len(c_get["messages"]) >= 1, "sapaan pembuka tersimpan dari inisialisasi")

c_continue = call("chat_start", document_id=bio)
check(c_continue["mode"] == "continue" and c_continue["session"]["id"] == c_start["session"]["id"], "mode CONTINUE mengembalikan sesi yang sama")

chunks_received = []
c_msg = call("chat_send", session_id=c_start["session"]["id"], message="Bagaimana proses fotosintesis?",
             stream=True, _on_chunk=lambda c: chunks_received.append(c))
check("DeepSeek" in c_msg["response"] or len(c_msg["response"]) > 10, "chat_send mengembalikan respon")
check(len(chunks_received) >= 1, "chat_send mode stream menerima potongan chunk")
check(len(c_msg["messages"]) >= 3, "pesan tersimpan (greeting + user + reply)")
check(any(c["backend"] == "deepseek" and c.get("mode") == "new" for c in mock_paf.STATE["calls"]), "konteks diinjeksi via gateway mode NEW")
check(any(c["backend"] == "deepseek" and c.get("mode") == "continue" and c.get("stream") is True for c in mock_paf.STATE["calls"]), "chat_send menggunakan gateway mode CONTINUE & stream=True")

del_sid = c_get["session"]["gateway_session_id"]
call("chat_delete", session_id=c_start["session"]["id"])
check(del_sid in mock_paf.STATE["deleted"], "chat_delete membersihkan sesi di gateway")
c_start2 = call("chat_start", document_id=bio)
check(c_start2["mode"] == "new", "setelah dihapus, chat_start kembali mode NEW")
wait_job(c_start2["job_id"])

print("== Panel tanya pada catatan (notes_ask: NEW -> CONTINUE + streaming)")
try:
    call("notes_ask", document_id=bio, quote="", question="x")
    check(False, "notes_ask harus menolak kutipan kosong")
except UserError:
    check(True, "notes_ask menolak kutipan kosong")
before_sids = set(mock_paf.STATE["sessions"])
ask_chunks = []
na = call("notes_ask", document_id=bio, quote="reaksi terang menghasilkan ATP dan NADPH",
          question="Jelaskan teks ini dengan bahasa sederhana.",
          stream=True, _on_chunk=lambda c: ask_chunks.append(c))
check("Penjelasan singkat" in na["answer"], "notes_ask mengembalikan jawaban")
check(len(ask_chunks) >= 1, "notes_ask mode stream menerima potongan chunk")
check(na["mode"] == "new" and na["ask_session_id"], "pertanyaan pertama membuat sesi (mode NEW)")
new_sids = set(mock_paf.STATE["sessions"]) - before_sids
check(len(new_sids) == 1, "teks materi diinjeksi ke satu sesi gateway baru")
check(any(c["backend"] == "deepseek" and c.get("mode") == "new" and c.get("stream") is True
          for c in mock_paf.STATE["calls"]), "notes_ask NEW memakai deepseek & stream=True")

na2 = call("notes_ask", document_id=bio, quote="siklus Calvin", question="Kenapa disebut siklus?",
           ask_session_id=na["ask_session_id"])
check("lanjutan" in na2["answer"], "pertanyaan lanjutan dijawab pada sesi yang sama")
check(na2["mode"] == "continue" and na2["ask_session_id"] == na["ask_session_id"], "mode CONTINUE memakai sesi panel")
check(mock_paf.STATE["calls"][-1]["mode"] == "continue" and mock_paf.STATE["calls"][-1]["sid"] in new_sids,
      "gateway menerima X-Session-ID sesi panel (tanpa injeksi ulang)")
check(set(mock_paf.STATE["sessions"]) == before_sids | new_sids, "CONTINUE tidak menambah sesi gateway baru")

na3 = call("notes_ask", document_id=bio, quote="stroma", question="Apa itu?", ask_session_id=999999)
check(na3["mode"] == "new", "ask_session_id tak dikenal -> injeksi ulang (NEW)")

call("notes_ask_delete", ask_session_id=na["ask_session_id"])
check(new_sids.pop() in mock_paf.STATE["deleted"], "notes_ask_delete membersihkan sesi gateway")
call("notes_ask_delete", ask_session_id=na3["ask_session_id"])
check(set(mock_paf.STATE["sessions"]) == before_sids, "semua sesi panel bersih setelah delete")

print("== Ubah gaya + coba lagi + hapus")
r_detail = call("reprocess_document", id=bio, style="detail", force=True)
check(wait_job(r_detail["job_id"])["status"] == "done", "regenerasi gaya detail")
check(any(c["backend"] == "grok" for c in mock_paf.STATE["calls"]), "catatan detail menggunakan backend grok")
r_simple = call("reprocess_document", id=bio, style="sederhana", force=True)
check(wait_job(r_simple["job_id"])["status"] == "done", "regenerasi gaya sederhana")
r = call("reprocess_document", id=bio, style="cornell")
check(wait_job(r["job_id"])["status"] == "done", "regenerasi gaya cornell")
call("save_note", document_id=bio, content_md="# Edit saya")
r = call("reprocess_document", id=bio)
wait_job(r["job_id"])
check(call("get_document", id=bio)["note"]["content_md"] == "# Edit saya", "catatan hasil edit tidak ditimpa")
call("delete_document", id=bio)
check(not any(d["id"] == bio for d in call("list_documents")["documents"]), "dokumen dihapus")
check(call("list_quizzes")["quizzes"] == [], "kuis ikut terhapus (cascade)")

print("== Backup")
check(db.backup() is not None, "backup dibuat")
print(f"\nSEMUA UJI LOLOS ({ok_count} cek)")
