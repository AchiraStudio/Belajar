"""Uji end-to-end mesin game v2 terhadap gateway PAF tiruan (tanpa jaringan nyata, tanpa data/ asli)."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tmp = Path(tempfile.mkdtemp(prefix="belajar-play-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf  # noqa: E402

srv = mock_paf.start(0)
os.environ.update({"DATA_DIR": str(tmp / "data"), "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
                   "PAF_API_TOKEN": mock_paf.TOKEN, "PAF_BASE_URL": f"http://127.0.0.1:{srv.server_address[1]}",
                   "LLM_RETRIES": "0", "LLM_BACKOFF_BASE": "0.01"})

import config  # noqa: E402
import db  # noqa: E402
import handlers as H  # noqa: E402
import play_director as D  # noqa: E402
import play_engine as E  # noqa: E402
import play_games as G  # noqa: E402
import profile as PF  # noqa: E402
from common import UserError, jdump  # noqa: E402

ok_count = 0
STATE, GM = mock_paf.STATE, mock_paf.STATE["gm"]


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


db.init()
n_key = [0]


def key():
    n_key[0] += 1
    return f"key-{n_key[0]:06d}-{os.urandom(3).hex()}"


class Turn:
    """Hasil satu panggilan play_turn: payload akhir + semua event yang dipancarkan."""
    def __init__(self, data, events):
        self.d, self.events = data, events
        self.text = "".join(e["chunk"] for e in events if "chunk" in e)
        self.stages = [e["stage"] for e in events if "stage" in e]

    def __getitem__(self, k):
        return self.d[k]


def play(op, **kw):
    events = []
    data = H.HANDLERS["play_turn"]({"op": op, "_emit": events.append, **kw})
    return Turn(data, events)


def start(game, scope=None, **opts):
    scope = scope or {"scope_kind": "document", "scope_id": DOC}
    return play("start", game=game, client_key=key(), options=opts, **scope)


def answer(t, ans, k=None):
    return play("answer", turn_id=t["turn_id"], client_key=k or key(), answer=ans)


# ---------------------------------------------------------------- data contoh
ts = db.now()
SUBJ = db.run("INSERT INTO subjects(name,created_at) VALUES('IPA',?)", (ts,))
terms = ["Fotosintesis", "Klorofil", "Stomata", "Respirasi", "Mitokondria", "Enzim"]
kc = [{"term": t, "definition": f"Definisi {t} yang cukup panjang untuk diuji"} for t in terms]
DOC = db.run("INSERT INTO documents(subject_id,title,filename,status,key_concepts,topics,summary,created_at,updated_at) "
             "VALUES(?,?,?,?,?,?,?,?,?)", (SUBJ, "Biologi Sel", "b.pdf", "ready", jdump(kc), jdump(["Sel"]), "Ringkasan biologi sel", ts, ts))
for i, t in enumerate(terms):
    db.run("INSERT INTO chunks(document_id,idx,label,text) VALUES(?,?,?,?)",
           (DOC, i, f"Halaman {i+1}", f"{t} dijelaskan di sini. {t} berperan penting dalam sel tumbuhan. " * 3))
DOC_SMALL = db.run("INSERT INTO documents(title,filename,status,key_concepts,created_at,updated_at) VALUES('Kecil','k.pdf','ready',?,?,?)",
                   (jdump(kc[:2]), ts, ts))

print("hub")
hub = H.HANDLERS["play_hub"]({})
check(len(hub["modes"]) == 6 and hub["active"] is None and hub["profile"]["level"] == 1, "hub: 6 mode, tanpa run aktif, level 1")
check(any(d["id"] == DOC and d["concepts"] == 6 for d in hub["documents"]), "hub: dokumen siap dengan jumlah istilah")
check(raises(lambda: start("ajari", {"scope_kind": "document", "scope_id": DOC_SMALL}), "minimal 3"), "materi dengan <3 istilah ditolak")
check(raises(lambda: start("tidak_ada"), "tidak dikenal"), "jenis game tidak dikenal ditolak")
check(raises(lambda: play("start", game="ajari", scope_kind="document", scope_id=DOC), "client_key"), "client_key wajib")

print("Ajari Aku: alur penuh")
t1 = start("ajari", jumlah_giliran=3)
check(t1["status"] == "awaiting" and t1["idx"] == 1 and t1["public"]["prompt"], "start: giliran 1 siap dengan prompt murid")
check("Narasi ajari (start)" in t1.text and "GAME_DATA" not in t1.text and "<<<" not in t1.text,
      "narasi di-stream tanpa blok data/penanda (chunk kecil memotong penanda)")
check("poin_kunci" not in json.dumps(t1.d) and "secret" not in json.dumps(t1.d), "payload tidak membocorkan kunci/secret")
check(t1["run"]["status"] == "active" and t1["run"]["max_turns"] == 3, "run aktif, max_turns 3")
run_id = t1["run"]["id"]
check(raises(lambda: start("kilat"), "Masih ada permainan"), "hanya satu run aktif")
sess = E.get_run(run_id)["gateway_session_id"]
check(bool(sess) and STATE["calls"][-1]["mode"] == "new" and STATE["calls"][-1]["backend"] == "deepseek", "giliran 1 memakai DeepSeek mode NEW")

short = answer(t1, {"text": "tidak yakin"})
check(short["judged"]["obs"] < 0.5 and short["status"] == "awaiting" and short["idx"] == 2, "jawaban singkat: obs rendah, giliran 2 dibuat")
check(STATE["calls"][-1]["mode"] == "continue" and STATE["calls"][-1]["sid"] == sess, "giliran berikutnya CONTINUE pada sesi yang sama")
check(short["judged"]["rubrik"]["contoh"] == 0 and short["judged"]["reveal"]["poin_kunci"], "judged memuat rubrik dan reveal setelah dinilai")
nrows = db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=?", (run_id,))
k = key()
long_text = "Fotosintesis adalah proses tumbuhan mengubah cahaya, air, dan CO2 menjadi glukosa dan oksigen, misalnya pada daun."
a2 = answer(short, {"text": long_text}, k)
check(abs(a2["judged"]["obs"] - 10 / 12) < 0.01, "obs dihitung agent dari rubrik (10/12), bukan skor AI 0.2")
rows_after = db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=?", (run_id,))
again = answer(short, {"text": long_text}, k)
check(again["turn_id"] == a2["turn_id"] and db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=?", (run_id,)) == rows_after,
      "kunci idempoten: kirim ulang tidak membuat giliran ganda")
check(raises(lambda: answer(short, {"text": long_text}), "belum siap atau sudah dijawab"), "menjawab giliran yang sudah dijawab ditolak")
ev = db.scalar("SELECT COUNT(*) FROM evidence WHERE run_id=?", (run_id,))
check(ev == 2, "bukti penguasaan tercatat per giliran")
m = db.row("SELECT * FROM mastery ORDER BY last_at DESC LIMIT 1")
check(m["evidence_n"] >= 1 and m["score"] > 0, "mastery diperbarui")

fin = answer(a2, {"text": long_text})
check(fin["ended"] and fin["kind"] == "end" and fin["rewards"]["xp"] > 0 and "selesai" in fin["rewards"]["bonuses"],
      "giliran terakhir: run selesai dengan hadiah (bonus selesai)")
check(fin["judged"]["obs"] > 0.5, "giliran terakhir tetap dinilai")
run = E.get_run(run_id)
check(run["status"] == "finished" and run["turn_count"] == 3 and run["total"] == 3, "run finished, 3 giliran")
check(PF.player()["xp"] == fin["rewards"]["xp"] + fin["rewards"]["quest_xp"], "XP pemain = hadiah + XP misi (diberikan sekali)")
check(sess in STATE["deleted"], "sesi gateway dihapus setelah selesai")
check(any(a["key"] == "first_play" for a in fin["rewards"]["achievements"]), "lencana Langkah Pertama terbuka")
check(E.finish(run_id)["rewards"]["xp"] == fin["rewards"]["xp"] and PF.player()["xp"] == fin["rewards"]["xp"] + fin["rewards"]["quest_xp"], "finish berulang idempoten (XP tidak dobel)")
check(not PF.unlock_achievements(), "lencana tidak terbuka dua kali")


LONG = "Fotosintesis adalah proses tumbuhan mengubah cahaya, air, dan CO2 menjadi glukosa dan oksigen, misalnya pada daun."


def finish_run(t, game_answer, limit=30):
    """Jawab sampai selesai. game_answer(turn_payload) -> jawaban."""
    for _ in range(limit):
        if t["ended"]:
            return t
        t = answer(t, game_answer(t))
    raise SystemExit("GAGAL: run tidak selesai")


print("koreksi format dan retry")
t = start("ajari", jumlah_giliran=6)
GM["fail"] = ["nomarker"]
calls0 = len(STATE["calls"])
t2 = answer(t, {"text": LONG})
check(t2["status"] == "awaiting" and "merapikan" in t2.stages, "blok data hilang: AI diminta memperbaiki, klien hanya melihat status 'merapikan'")
check(len(STATE["calls"]) - calls0 == 2 and STATE["calls"][-1]["mode"] == "continue", "tepat 1 panggilan koreksi via CONTINUE")
check("lupa blok data" in t2.text and "lupa blok data" not in t2["narration"], "narasi final menggantikan teks percobaan gagal")
GM["fail"] = ["badjson", "badjson", "badjson"]
t3 = answer(t2, {"text": LONG})
check(t3["status"] == "error" and t3["retryable"] and "format" in t3["error"], "tiga kali format salah -> error bisa dicoba lagi")
prev = E.get_turn(t2["turn_id"])
check(prev["status"] == "judging", "giliran sebelumnya menunggu (belum dinilai) selagi pembuatan gagal")
check(db.scalar("SELECT COUNT(*) FROM evidence WHERE turn_id=?", (t2["turn_id"],)) == 0, "tidak ada bukti/XP tercatat dari giliran yang gagal")
GM["fail"] = []
t4 = play("retry", turn_id=t3["turn_id"])
check(t4["status"] == "awaiting" and t4["turn_id"] == t3["turn_id"] and E.get_turn(t4["turn_id"])["retries"] == 1, "retry memakai baris yang sama dan berhasil")
check(db.scalar("SELECT COUNT(*) FROM evidence WHERE turn_id=?", (t2["turn_id"],)) == 1, "bukti dicatat tepat sekali setelah retry berhasil")
check(raises(lambda: play("retry", turn_id=t4["turn_id"]), "tidak sedang gagal"), "retry pada giliran sehat ditolak")

print("pemulihan sesi gateway")
old_sid = E.get_run(t["run"]["id"])["gateway_session_id"]
STATE["sessions"].clear()                                   # gateway restart: semua sesi hilang
t5 = answer(t4, {"text": LONG})
r = E.get_run(t["run"]["id"])
check(t5["status"] == "awaiting" and r["resumes"] == 1 and r["gateway_session_id"] != old_sid, "mode_fallback terdeteksi: sesi dibangun ulang tanpa kehilangan giliran")
check("memulihkan_sesi" in t5.stages, "klien mendapat status 'memulihkan_sesi'")
check(STATE["calls"][-1]["mode"] == "new", "pemulihan memakai sesi baru (mode NEW) dengan preamble")
check(r["turn_count"] == 3, "state run berasal dari SQLite (turn_count tetap benar)")

print("petunjuk bertingkat")
h1 = play("hint", turn_id=t5["turn_id"])
check(h1["level"] == 1 and "Petunjuk tingkat 1" in h1["hint"] and "Petunjuk tingkat 1" in "".join(e.get("chunk", "") for e in h1.events), "petunjuk 1 di-stream")
check(play("hint", turn_id=t5["turn_id"], level=1)["hint"] == h1["hint"] and len(STATE["calls"]) > 0, "level yang sama diulang: tanpa panggilan AI baru")
n_calls = len(STATE["calls"])
play("hint", turn_id=t5["turn_id"], level=1)
check(len(STATE["calls"]) == n_calls, "permintaan petunjuk berulang idempoten")
play("hint", turn_id=t5["turn_id"])
play("hint", turn_id=t5["turn_id"])
check(raises(lambda: play("hint", turn_id=t5["turn_id"]), "habis"), "petunjuk ke-4 ditolak")
check(E.get_turn(t5["turn_id"])["hint_level"] == 3 and len(E.get_turn(t5["turn_id"])["public"]["hints"]) == 3, "tiga petunjuk tersimpan di giliran")
t6 = answer(t5, {"text": LONG})
check(abs(t6["judged"]["obs"] - (10 / 12) * (1 - 0.45)) < 0.01, "obs dipotong 15% per tingkat petunjuk")
check(t6["judged"]["xp"] < 15 * 1.4, "XP berkurang karena petunjuk")
play_hub = H.HANDLERS["play_hub"]({})
check(play_hub["active"]["id"] == t["run"]["id"], "hub menampilkan run aktif untuk dilanjutkan")
resumed = H.HANDLERS["play_get"]({})
check(resumed["turn_id"] == t6["turn_id"] and resumed["status"] == "awaiting", "play_get: lanjutkan di giliran saat ini")
ab = H.HANDLERS["play_abandon"]({"run_id": t["run"]["id"]})
check(ab["run"]["status"] == "abandoned" and ab["rewards"]["bonuses"] == {}, "tinggalkan: tanpa bonus selesai")
check(E.get_run(t["run"]["id"])["xp"] == ab["rewards"]["xp"] and ab["rewards"]["xp"] <= 60, "tinggalkan: hanya XP giliran yang sudah dijawab (tanpa bonus)")

print("Detektif: penilai lokal")
t = start("detektif", jumlah_giliran=2)
check(len(t["public"]["sentences"]) == 5 and "wrong" not in json.dumps(t.d), "kalimat tampil, indeks salah dirahasiakan")
a = answer(t, {"taps": [2]})
check(a["judged"]["obs"] == 1.0 and a["judged"]["reveal"]["wrong"] == [2] and a["judged"]["detail"] == {"tp": 1, "fp": 0}, "tebakan tepat: skor 1, jawaban terungkap")
b = answer(a, {"taps": [0, 1, 4]})
check(b["judged"]["obs"] == 0.0 and b["ended"], "tebakan salah semua: skor 0, run selesai")

print("Petunjuk: Petualangan, HP dan kalah")
t = start("petualangan", jumlah_giliran=8, tema="scifi")
check(t["run"]["state"]["hp"] == 3 and t["run"]["state"]["theme"] == "scifi", "state awal petualangan (HP 3, tema)")
for i in range(3):
    cur = E.get_turn(t["turn_id"])
    if cur["secret"].get("answer_id"):
        wrong = next(o["id"] for o in cur["public"]["challenge"]["options"] if o["id"] != cur["secret"]["answer_id"])
        t = answer(t, {"choice_id": wrong})
    else:
        t = answer(t, {"text": "salah"})
    if t["ended"]:
        break
check(t["ended"] and t["run"]["state"]["hp"] == 0 and E.get_run(t["run"]["id"])["total"] == 3, "HP habis: petualangan berakhir (kalah) setelah 3 salah")
check(E.get_run(t["run"]["id"])["state"].get("location") == "Gerbang Batu", "lokasi kosmetik dari state_delta diterapkan")
check(db.scalar("SELECT COUNT(*) FROM cards") >= 1, "jawaban salah (obs < 0.5) otomatis membuat kartu SM-2")
t = start("petualangan", jumlah_giliran=4)
cur = E.get_turn(t["turn_id"])
right = cur["secret"]["answer_id"] if cur["secret"].get("answer_id") else None
t = answer(t, {"choice_id": right} if right else {"text": "klorofil"})
check(t["judged"]["correct"] and t["run"]["state"]["inventory"] and t["run"]["state"]["combo"] == 1, "benar: item masuk inventori, kombo naik")
H.HANDLERS["play_abandon"]({"run_id": t["run"]["id"]})

print("Kasus: skenario tak boleh menyebut istilah")
GM["fail"] = ["badleak"]
t = start("kasus", jumlah_giliran=3)
check(t["status"] == "awaiting" and "skenario bocor" not in json.dumps(t["public"]), "skenario yang membocorkan istilah ditolak lalu diperbaiki")
check("merapikan" in t.stages, "perbaikan dilakukan lewat koreksi format")
cur = E.get_turn(t["turn_id"])
right = cur["secret"]["answer_id"]
a = answer(t, {"choice_id": right, "reason": "Karena daun menguning terkait proses penyerapan cahaya."})
check(abs(a["judged"]["obs"] - (0.6 + 0.4 * 0.9)) < 0.01, "pilihan benar + alasan dinilai AI: 0.6*1 + 0.4*0.9")
cur = E.get_turn(a["turn_id"])
a2 = answer(a, {"choice_id": cur["secret"]["answer_id"]})
check(abs(a2["judged"]["obs"] - 0.8) < 0.01, "tanpa alasan: obs maksimal 0.8")
H.HANDLERS["play_abandon"]({"run_id": t["run"]["id"]})

print("Kilat: batch, penilai lokal, prefetch")
t = start("kilat", jumlah_giliran=10)
rid = t["run"]["id"]
check(db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=? AND status='awaiting'", (rid,)) == 5, "batch pertama: 5 soal disiapkan sekali panggil")
check("secret" not in json.dumps(t.d) and "answer" not in json.dumps(t["public"]), "soal tidak membocorkan kunci")
calls0 = len(STATE["calls"])


def kilat_ans(tt, right=True):
    cur = E.get_turn(tt["turn_id"])
    sec, qt = cur["secret"], cur["public"]["qtype"]
    if qt == "mcq":
        return {"given": sec["answer"] if right else str((int(sec["answer"]) + 1) % 4)}
    if qt == "tf":
        return {"given": sec["answer"] if right else ("false" if sec["answer"] == "true" else "true")}
    return {"given": "klorofil" if right else "tidak tahu"}


a = answer(t, kilat_ans(t))
check(a["judged"]["correct"] and a["judged"]["reveal"]["answer_text"] and len(STATE["calls"]) == calls0, "jawaban dinilai lokal seketika (tanpa panggilan AI)")
check(a["status"] == "awaiting" and a["idx"] == 2, "soal berikutnya langsung tersedia")
a = answer(a, kilat_ans(a, False))
check(a["judged"]["correct"] is False, "jawaban salah dinilai lokal")
check(not STATE["gm"]["fail"] and db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=?", (rid,)) == 5, "belum prefetch (sisa soal masih >2)")
a = answer(a, kilat_ans(a))
for _ in range(200):
    if db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=? AND status IN ('awaiting','done','judging')", (rid,)) >= 10:
        break
    time.sleep(0.05)
check(db.scalar("SELECT COUNT(*) FROM game_turns WHERE run_id=?", (rid,)) == 10, "batch kedua diprefetch di latar saat sisa 2 soal")
for i in range(7):
    a = answer(a, kilat_ans(a, i % 2 == 0))
check(a["ended"] and a["run"]["total"] == 10 and a["rewards"]["xp"] > 0, "10 soal selesai: hadiah dibagikan")
check(a["run"]["correct"] == 6, "akurasi tercatat: 6 dari 10 benar")
k = key()
fresh = start("kilat", jumlah_giliran=5)
b1 = answer(fresh, kilat_ans(fresh), k)
b2 = answer(fresh, kilat_ans(fresh), k)
check(b1["judged"]["turn_id"] == b2["judged"]["turn_id"] and db.scalar("SELECT COUNT(*) FROM evidence WHERE turn_id=?", (b1["judged"]["turn_id"],)) == 1,
      "jawaban kilat dikirim ulang dengan kunci sama: tidak dinilai dua kali")
H.HANDLERS["play_abandon"]({"run_id": fresh["run"]["id"]})

print("Ujian Boss: tanpa umpan balik, rapor di akhir")
t = start("boss", jumlah_giliran=6)
rid = t["run"]["id"]
check(raises(lambda: play("hint", turn_id=t["turn_id"]), "tidak memberi petunjuk"), "boss: tanpa petunjuk")
seen_hidden, a = [], t
for i in range(6):
    a = answer(a, kilat_ans(a, i != 2))
    if i < 5:
        seen_hidden.append(a["judged"])
check(all(j.get("hidden") and "correct" not in j and "reveal" not in j for j in seen_hidden), "boss: hasil tiap soal tersembunyi sampai ujian selesai")
check(a["ended"] and a["kind"] == "end" and "Rapor" in a["narration"], "boss: rapor akhir dibuat AI setelah soal terakhir")
check("Rapor" in a.text, "rapor di-stream")
check(a["run"]["total"] == 6 and a["run"]["correct"] == 5, "boss: akurasi 5/6 (soal ke-3 sengaja salah)")
check(all(not (E.get_turn(r["id"])["judgement"] or {}).get("hidden") for r in db.rows("SELECT id FROM game_turns WHERE run_id=? AND kind='boss'", (rid,))), "setelah rapor, hasil per soal dibuka")
check("akurasi" in a["rewards"]["bonuses"] and a["rewards"]["bonuses"]["selesai"] == 25, "bonus akurasi >= 80% dan selesai")
check(any(x["key"] == "boss_win" for x in PF.achievements_list() if x["unlocked"]), "lencana Penakluk Boss")

print("flag soal keliru")
tid = db.scalar("SELECT id FROM game_turns WHERE run_id=? AND kind='boss' ORDER BY idx LIMIT 1", (rid,))
ev0 = db.scalar("SELECT COUNT(*) FROM evidence WHERE turn_id=?", (tid,))
xp0, run0 = PF.player()["xp"], E.get_run(rid)
H.HANDLERS["play_flag"]({"turn_id": tid})
check(ev0 >= 1 and db.scalar("SELECT COUNT(*) FROM evidence WHERE turn_id=?", (tid,)) == 0, "flag membuang bukti giliran itu")
run1 = E.get_run(rid)
check(run1["total"] == run0["total"] - 1 and PF.player()["xp"] < xp0, "flag mengoreksi akurasi dan XP pemain")
H.HANDLERS["play_flag"]({"turn_id": tid})
check(E.get_run(rid)["total"] == run1["total"], "flag dua kali tidak menghitung ulang")

print("model penguasaan")
cid = db.row("SELECT id FROM concepts WHERE term='Stomata'")["id"]
db.run("DELETE FROM evidence WHERE concept_id=?", (cid,)); db.run("DELETE FROM mastery WHERE concept_id=?", (cid,))
D.add_evidence([cid], "explain", 1.0, 0, 0, 0)
check(abs(db.row("SELECT score FROM mastery WHERE concept_id=?", (cid,))["score"] - 35.0) < 0.01, "skor = 0 + 0.35*(100-0) = 35")
D.add_evidence([cid], "explain", 1.0, 0, 0, 0)
check(abs(db.row("SELECT score FROM mastery WHERE concept_id=?", (cid,))["score"] - 57.75) < 0.01, "skor kedua = 35 + 0.35*65 = 57.75")
for kind in ("apply", "recall", "boss"):
    D.add_evidence([cid], kind, 1.0, 0, 0, 0)
m = db.row("SELECT * FROM mastery WHERE concept_id=?", (cid,))
check(D.mastery_level(m["score"], m["evidence_n"], json.loads(m["kinds"])) == "kuasai", "skor >=75, >=4 bukti, >=2 jenis => Kuasai")
check(D.mastery_level(80, 5, ["explain"]) == "paham" and D.mastery_level(80, 3, ["explain", "apply"]) == "paham", "satu jenis bukti atau <4 bukti belum cukup Kuasai")
check(D.mastery_level(40, 2, ["recall"]) == "dikenal" and D.mastery_level(0, 0, []) == "baru", "tingkat dikenal dan baru")
D.add_evidence([cid], "recall", 0.0, 0, 0, 0)
check(db.row("SELECT score FROM mastery WHERE concept_id=?", (cid,))["score"] < m["score"], "bukti buruk menurunkan skor (model bisa turun)")
D.drop_evidence(0)
check(db.scalar("SELECT COUNT(*) FROM evidence WHERE concept_id=?", (cid,)) == 0, "drop_evidence turn 0 menghapus semua bukti uji ini")

print("peta, riwayat, profil")
mp = H.HANDLERS["play_map"]({"document_id": DOC})
check(sum(len(g["concepts"]) for g in mp["groups"]) == 6 and sum(mp["counts"].values()) == 6, "peta penguasaan memuat semua konsep")
check(len(H.HANDLERS["play_runs"]({})["runs"]) >= 4, "riwayat run selesai")
pr = H.HANDLERS["play_profile"]({})
check(len(pr["quests"]) == 3 and len(pr["achievements"]) == len(PF.ACHIEVEMENTS), "profil: 3 misi harian dan daftar lencana")
check(pr["profile"]["xp"] == PF.player()["xp"], "profil: XP sinkron")

print("sambung ulang (attach) dan pemulihan agent")
GM["delay"] = 0.05
op = E.op_start({"game": "ajari", "scope_kind": "document", "scope_id": DOC, "client_key": key(), "options": {"jumlah_giliran": 3}})
time.sleep(0.2)                                              # klien "terputus" di tengah generasi
ev = []
got = E.wait(op["turn_id"], ev.append)
streamed = "".join(e["chunk"] for e in ev if "chunk" in e)
check(got["status"] == "awaiting" and streamed.startswith("Narasi ajari"), "attach: teks diputar ulang dari awal lalu hasil akhir")
GM["delay"] = 0.0
H.HANDLERS["play_abandon"]({"run_id": got["run"]["id"]})
rid2 = db.run("INSERT INTO game_runs(game,scope_kind,scope_id,options,status,state,max_turns,started_at,updated_at) VALUES('ajari','document',?, '{}','active','{}',3,?,?)", (DOC, db.now(), db.now()))
tid2 = db.run("INSERT INTO game_turns(run_id,idx,status,kind,created_at,updated_at) VALUES(?,1,'generating','explain',?,?)", (rid2, db.now(), db.now()))
E.recover()
check(E.get_turn(tid2)["status"] == "error" and E.get_turn(tid2)["error"], "recover(): giliran yang menggantung menjadi error yang bisa dicoba lagi")
db.run("UPDATE game_runs SET updated_at=? WHERE id=?", (db.now() - 7 * 3600, rid2))
E.sweep_stale()
check(E.get_run(rid2)["status"] == "abandoned", "run basi (>6 jam) otomatis ditutup")

print("bahan sumber (FTS5 / LIKE)")
cdict = {"id": 1, "document_id": DOC, "term": "Stomata", "definition": "Definisi Stomata yang cukup panjang"}
src = D.source_for(cdict)
check(src and "Stomata" in src[0]["text"], f"source_for menemukan potongan relevan (fts5={db.get_setting('fts5')})")
db.set_setting("fts5", "0")
src2 = D.source_for(cdict)
check(src2 and "Stomata" in src2[0]["text"], "fallback LIKE bekerja tanpa FTS5")
check(len(D.package_for("document", DOC, [DOC])) <= D.PACKAGE_CHARS, "paket materi dibatasi 6000 karakter")
db.set_setting("fts5", "1" if mock_paf and db.fts5_available() else "0")

print("direktur: pemilihan fokus")
import random as _r  # noqa: E402
rng = _r.Random(7)
db.run("DELETE FROM mastery"); db.run("DELETE FROM evidence"); db.run("DELETE FROM cards")   # kartu jatuh tempo ikut memengaruhi bobot
weak_id = db.row("SELECT id FROM concepts WHERE term='Enzim'")["id"]
D.add_evidence([weak_id], "recall", 0.1, 0, 0, 0)
picks = [D.pick_focus([DOC], 1, [], rng)[0]["term"] for _ in range(300)]
check(picks.count("Enzim") > picks.count("Klorofil"), "konsep lemah (dikenal) lebih sering dipilih daripada yang baru")
cid2 = db.row("SELECT id FROM concepts WHERE term='Klorofil'")["id"]
for kind in ("explain", "apply", "recall", "boss", "explain"):
    D.add_evidence([cid2], kind, 1.0, 0, 0, 0)
picks = [D.pick_focus([DOC], 1, [], rng)[0]["term"] for _ in range(300)]
check(picks.count("Klorofil") < picks.count("Fotosintesis") / 2, "konsep yang sudah dikuasai jarang muncul")
rec = [D.pick_focus([DOC], 1, [[weak_id]], rng)[0]["term"] for _ in range(300)]
check(rec.count("Enzim") < picks.count("Enzim"), "konsep yang baru dipakai diberi penalti")
check(len({c["id"] for c in D.pick_focus([DOC], 4, [], rng)}) == 4, "sampel tanpa pengembalian: 4 konsep berbeda")

print("batas XP dan lencana")
db.run("DELETE FROM game_runs WHERE status='active'")
rid3 = db.run("INSERT INTO game_runs(game,scope_kind,scope_id,options,status,state,max_turns,correct,total,xp,started_at,updated_at) "
              "VALUES('kilat','document',?,'{}','active','{}',10,10,10,900,?,?)", (DOC, db.now(), db.now()))
xp_before = PF.player()["xp"]
res = E.finish(rid3)
check(res["rewards"]["xp"] == E.XP_RUN_CAP and PF.player()["xp"] - xp_before >= E.XP_RUN_CAP, "XP satu permainan dibatasi 300")

print("attach lewat client_key")
kk = key()
t = play("start", game="ajari", scope_kind="document", scope_id=DOC, client_key=kk, options={"jumlah_giliran": 3})
re_t = play("attach", client_key=kk)
check(re_t["turn_id"] == t["turn_id"] and re_t["status"] == "awaiting", "attach lewat client_key mengembalikan giliran yang sama")
ak = key()
a1 = play("answer", turn_id=t["turn_id"], client_key=ak, answer={"text": LONG})
a2 = play("attach", client_key=ak)
check(a2["turn_id"] == a1["turn_id"] and a2["judged"]["turn_id"] == t["turn_id"], "attach untuk jawaban: giliran baru + hasil penilaian yang sama")
check(raises(lambda: play("attach", client_key=key()), "belum sampai"), "attach dengan kunci tak dikenal ditolak")
H.HANDLERS["play_abandon"]({"run_id": t["run"]["id"]})

print("tidak ada kunci di respons RPC")
t = start("ajari", jumlah_giliran=3)
dump = json.dumps(H.HANDLERS["play_get"]({}))
check("poin_kunci" not in dump and '"secret"' not in dump, "play_get tidak membocorkan secret")
check("poin_kunci" not in json.dumps(H.HANDLERS["play_turn_get"]({"turn_id": t["turn_id"]})), "play_turn_get tidak membocorkan secret")
H.HANDLERS["play_abandon"]({"run_id": t["run"]["id"]})
print(f"\nSemua {ok_count} pemeriksaan lolos.")
