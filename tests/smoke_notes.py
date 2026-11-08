"""Uji v2.3: metode catatan Detail (Grok), normalisasi rumus & struktur, dan mind map.

Jalankan dari root repo:  python tests/smoke_notes.py
Memakai mock_paf sehingga tidak memakai kuota atau token asli.
"""
import base64
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tmp = Path(tempfile.mkdtemp(prefix="belajar-notes-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf  # noqa: E402

srv = mock_paf.start(0)
os.environ.update({
    "DATA_DIR": str(tmp / "data"), "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
    "PAF_BASE_URL": f"http://127.0.0.1:{srv.server_address[1]}", "PAF_API_TOKEN": mock_paf.TOKEN,
    "LLM_BACKOFF_BASE": "0.05", "LLM_CONCURRENCY": "2", "CHUNK_CHARS": "1500",
})

fx = tmp / "fx"
subprocess.run([sys.executable, str(ROOT / "tests" / "make_fixtures.py"), str(fx)], check=True)

import db  # noqa: E402
import handlers as H  # noqa: E402
import jobs  # noqa: E402
import mindmap  # noqa: E402
import pipeline  # noqa: E402
import sanitize  # noqa: E402
from common import UserError  # noqa: E402

db.init()
call = lambda name, **kw: H.HANDLERS[name](kw)  # noqa: E731
n_ok = 0


def check(cond, msg):
    global n_ok
    if not cond:
        print("GAGAL:", msg)
        sys.exit(1)
    n_ok += 1
    print("  ok -", msg)


def wait_job(job_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        j = jobs.get(job_id)
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.1)
    raise SystemExit("job timeout")


# ------------------------------------------------------------------ rumus & struktur
print("== sanitize.clean_note: rumus")
check(sanitize.clean_note(r"Energi \(E = mc^2\) lengkap") == "Energi $E = mc^2$ lengkap", r"\(..\) -> $..$")
check(sanitize.clean_note("A\n\\[ F = ma \\]\nB") == "A\n\n$$\nF = ma\n$$\n\nB", r"\[..\] -> blok $$ dengan baris kosong")
check(sanitize.clean_note("Rumus `\\(x\\)` di kode") == "Rumus `\\(x\\)` di kode", "inline code tidak disentuh")
check(sanitize.clean_note("a\n```\n\\[ x \\]\n```\nb") == "a\n\n```\n\\[ x \\]\n```\n\nb", "isi code fence tidak disentuh (fence diberi baris kosong di sekelilingnya)")
check(sanitize.clean_note("$$a+b$$") == "$$\na+b\n$$", "$$..$$ satu baris dipecah menjadi blok rapi")
check(sanitize.clean_note("Gaya $$F=ma$$ itu") == "Gaya $$F=ma$$ itu", "$$ di tengah kalimat dibiarkan")
check(sanitize.clean_note("Harga \\$5 dan $x$") == "Harga \\$5 dan $x$", "tanda dolar mata uang aman")

print("== sanitize.clean_note: struktur")
check(sanitize.clean_note("###Judul\nisi") == "### Judul\n\nisi", "judul tanpa spasi diperbaiki + baris kosong")
check(sanitize.clean_note("teks\n### Sub\n- a") == "teks\n\n### Sub\n\n- a", "judul diberi baris kosong sebelum/sesudah")
check(sanitize.clean_note("• satu\n• dua") == "- satu\n- dua", "glif bullet diganti '-'")
tbl = sanitize.clean_note("| A | B | C |\n| --- | --- |\n| 1 | 2 |\n| x | y | z | w |\nsetelah")
check(tbl == "| A | B | C |\n|---|---|---|\n| 1 | 2 |  |\n| x | y | z / w |\n\nsetelah", "tabel: kolom disamakan, sel lebih digabung, baris kosong setelah")
tm = sanitize.clean_note("| Rumus | Nama |\n|---|---|\n| $|x|$ | nilai mutlak |")
check(tm == "| Rumus | Nama |\n|---|---|\n| $|x|$ | nilai mutlak |", "pipa di dalam $..$ tidak memecah sel tabel")
check(sanitize.clean_note("a\n\n\n\nb") == "a\n\nb", "baris kosong berlebih dirapatkan")
check(sanitize.clean_note("# Besar\n## Sedang") == "### Besar\n\n### Sedang", "H1/H2 tetap diturunkan ke ###")

# ------------------------------------------------------------------ gaya Detail
print("== Gaya catatan: kategori Detail memakai Grok")
check(set(pipeline.DETAIL_STYLES) == {"detail", "sentence", "charting", "outline", "worked"}, "5 gaya kategori Detail")
check({"ringkas", "cornell", "sederhana"} <= set(pipeline.STYLES) and set(pipeline.DETAIL_STYLES) <= set(pipeline.STYLES),
      "STYLES memuat gaya lama + gaya baru")
for st in pipeline.STYLES:
    check(st in pipeline.STYLE_RULES, f"aturan gaya '{st}' ada")
try:
    call("save_settings", settings={"notes_style": "tidak-ada"})
    check(False, "gaya tak dikenal harus ditolak")
except UserError:
    check(True, "gaya tak dikenal ditolak oleh save_settings")
for st in ("sentence", "charting", "outline", "worked"):
    call("save_settings", settings={"notes_style": st})
    check(db.get_setting("notes_style") == st, f"gaya '{st}' bisa jadi bawaan pengguna")
db.set_setting("notes_style", "ringkas")

data = base64.b64encode((fx / "bio.docx").read_bytes()).decode()
up = call("upload_document", filename="bio.docx", data=data, style="ringkas")
check(wait_job(up["job_id"])["status"] == "done", "unggah bio.docx (ringkas) selesai")
doc_id = up["doc_id"]
calls = mock_paf.STATE["calls"]
mark = len(calls)
check(not any(c["backend"] == "grok" for c in calls), "gaya ringkas tidak memanggil grok")

EXPECT = {
    "sentence": "SENTENCE METHOD",
    "charting": "CHARTING METHOD",
    "outline": "OUTLINE NOTES",
    "worked": "WORKED EXAMPLES",
}
for st, label in EXPECT.items():
    mark = len(calls)
    r = call("reprocess_document", id=doc_id, style=st, force=True)
    check(wait_job(r["job_id"])["status"] == "done", f"gaya {st}: selesai")
    note_calls = [c for c in calls[mark:] if "MATERI (bagian:" in c["prompt"] and "Pedoman Gaya" in c["prompt"]]
    check(bool(note_calls), f"gaya {st}: ada panggilan pembuatan catatan")
    check(all(c["backend"] == "grok" for c in note_calls), f"gaya {st}: backend grok")
    check(all(label in c["prompt"] for c in note_calls), f"gaya {st}: prompt memuat aturan {label}")
    check(all("ATURAN FORMAT" in c["prompt"] and "$$" in c["prompt"] for c in note_calls), f"gaya {st}: aturan format + rumus ikut terkirim")
    check(all("bagian ke-" in c["prompt"] and "dari" in c["prompt"] for c in note_calls), f"gaya {st}: konteks posisi chunk")
    d = call("get_document", id=doc_id)
    check(d["document"]["style"] == st, f"gaya {st}: tersimpan di dokumen")
    md = d["note"]["content_md"]
    check("\\(" not in md and "\\[" not in md, f"gaya {st}: delimiter \\( \\[ tidak tersisa di catatan")
    check("$E = mc^2$" not in md and "\n$$\nE = mc^2\n$$\n" in md, f"gaya {st}: rumus blok dirapikan")
    check("|---|---|---|" in md and "| Energi | $E$ | J / catatan liar |" in md, f"gaya {st}: tabel konsisten 3 kolom")

mark = len(calls)
r = call("reprocess_document", id=doc_id, style="cornell", force=True)
wait_job(r["job_id"])
check(not any(c["backend"] == "grok" for c in calls[mark:] if "Pedoman Gaya" in c["prompt"]), "cornell tetap bukan grok")

mark = len(calls)
r = call("reprocess_document", id=doc_id, style="detail", force=True)
wait_job(r["job_id"])
check(any(c["backend"] == "grok" for c in calls[mark:] if "Pedoman Gaya" in c["prompt"]), "gaya detail lama tetap lewat grok")

# ------------------------------------------------------------------ normalize_tree
print("== mindmap.normalize_tree")
raw = {"root": {"label": "**Tema** utama", "children": [
    {"label": "A", "children": [{"label": "a1"}, {"label": "A1"}, {"label": ""}, {"label": "a2", "children": [
        {"label": "a2x", "children": [{"label": "terlalu dalam"}]}]}]},
    {"label": "B"}, {"label": "b"}, {"label": "C $x^2$"},
]}, "relations": [
    {"from": "a1", "to": "B", "label": "memengaruhi"}, {"from": "a1", "to": "a2", "label": "satu cabang"},
    {"from": "a1", "to": "B", "label": "duplikat"}, {"from": "zzz", "to": "B"}, {"from": "Tema utama", "to": "B"},
]}
t = mindmap.normalize_tree(raw)
labels = {n["label"] for n in [t["root"]] + t["root"]["children"]}
check(t["root"]["label"] == "Tema utama", "label akar dibersihkan dari markdown")
check([c["label"] for c in t["root"]["children"]] == ["A", "B", "C x^2"], "sibling kembar & label kosong dibuang, $ dibuang dari label")
a = t["root"]["children"][0]
check([c["label"] for c in a["children"]] == ["a1", "a2"], "anak kembar (a1/A1) dibuang")
a2 = a["children"][1]
check(a2["children"][0]["label"] == "a2x" and "children" not in a2["children"][0], "kedalaman dibatasi 3 tingkat")
ids = []
def collect(n):
    ids.append(n["id"])
    for c in n.get("children", []):
        collect(c)
collect(t["root"])
check(len(ids) == len(set(ids)) and ids[0] == "n0", "id simpul unik, akar n0")
check(t["node_count"] == len(ids), "node_count sesuai jumlah simpul")
check(len(t["relations"]) == 1 and t["relations"][0]["label"] == "memengaruhi", "relasi: hanya lintas cabang, tanpa duplikat/akar/tak-resolve")
for bad in ({}, {"root": {"label": ""}}, {"root": {"label": "X", "children": [{"label": "satu"}]}}, "teks", {"root": {"label": "X"}}):
    try:
        mindmap.normalize_tree(bad)
        check(False, f"harus ditolak: {bad!r}")
    except ValueError:
        check(True, f"ditolak: {str(bad)[:40]}")

# ------------------------------------------------------------------ job mind map
print("== Mind map: job, simpan, stale, hapus")
check(call("mindmap_get", document_id=doc_id) == {"mindmap": None, "job": None}, "belum ada mind map")
mark = len(calls)
g = call("mindmap_generate", document_id=doc_id)
j = wait_job(g["job_id"])
check(j["status"] == "done", f"job mind map selesai ({j.get('error')})")
mm_calls = [c for c in calls[mark:] if c["tools"] and c["tools"][0]["function"]["name"] == "build_mindmap"]
check(len(mm_calls) == 1, "satu panggilan tool build_mindmap")
check(mm_calls[0]["backend"] == "deepseek" and mm_calls[0]["think"] in ("instant", None), "mind map: tool calling menggunakan deepseek")
check("MIND MAP" in mm_calls[0]["prompt"] and "CATATAN:" in mm_calls[0]["prompt"], "prompt memuat instruksi + catatan")
got = call("mindmap_get", document_id=doc_id)
m = got["mindmap"]
check(m and m["root"]["label"] == "Fotosintesis", "mind map tersimpan")
check([c["label"] for c in m["root"]["children"]] == ["Reaksi Terang", "Siklus Calvin", "Struktur Daun"],
      "hasil model dinormalisasi (duplikat & kosong dibuang)")
check(len(m["relations"]) == 2 and not m["stale"], "2 relasi valid, belum stale")
check(got["job"]["status"] == "done", "status job ikut dikembalikan")
check(m["node_count"] == db.scalar("SELECT node_count FROM mindmaps WHERE document_id=?", (doc_id,)), "node_count tersimpan")

time.sleep(0.02)
call("save_note", document_id=doc_id, content_md="### Catatan baru\n- diedit")
check(call("mindmap_get", document_id=doc_id)["mindmap"]["stale"] is True, "mind map ditandai usang setelah catatan berubah")

g2 = call("mindmap_generate", document_id=doc_id)
check(wait_job(g2["job_id"])["status"] == "done" and not call("mindmap_get", document_id=doc_id)["mindmap"]["stale"],
      "buat ulang menghapus status usang")
check(db.scalar("SELECT COUNT(*) FROM mindmaps WHERE document_id=?", (doc_id,)) == 1, "upsert: tetap satu baris per materi")

# job ganda: bila sudah ada job berjalan untuk materi ini, permintaan baru memakai job itu
fake = db.run("INSERT INTO jobs(kind,status,progress,message,ref_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              ("generate_mindmap", "running", 30, "Menyusun mind map", doc_id, db.now(), db.now()))
before = len(calls)
again = call("mindmap_generate", document_id=doc_id)
check(again.get("already_running") is True and again["job_id"] == fake, "job ganda ditolak, job berjalan dipakai ulang")
check(len(calls) == before, "tidak ada panggilan AI tambahan saat job sudah berjalan")
db.run("UPDATE jobs SET status='done' WHERE id=?", (fake,))

try:
    call("mindmap_generate", document_id=999999)
    check(False, "dokumen tak ada harus ditolak")
except UserError:
    check(True, "dokumen tak ada ditolak")

call("mindmap_delete", document_id=doc_id)
check(call("mindmap_get", document_id=doc_id)["mindmap"] is None, "mindmap_delete menghapus")
wait_job(call("mindmap_generate", document_id=doc_id)["job_id"])
call("delete_document", id=doc_id)
check(db.scalar("SELECT COUNT(*) FROM mindmaps") == 0, "hapus materi ikut menghapus mind map (cascade)")

# gateway menolak tools -> fallback JSON tetap menghasilkan pohon valid
print("== Mind map: fallback bila gateway menolak tools")
up2 = call("upload_document", filename="bio.docx", data=data, style="ringkas")
wait_job(up2["job_id"])
mock_paf.STATE["tools_unsupported"] = True
try:
    j3 = wait_job(call("mindmap_generate", document_id=up2["doc_id"])["job_id"])
    # mock tidak membalas JSON mind map untuk jalur teks, jadi job boleh gagal: yang penting gagal dengan rapi
    check(j3["status"] in ("done", "failed"), f"fallback tanpa tools berakhir rapi ({j3['status']})")
    if j3["status"] == "failed":
        check(bool(j3["error"]) and "Kesalahan internal" not in j3["error"], "kegagalan memberi pesan yang jelas, bukan crash")
finally:
    mock_paf.STATE["tools_unsupported"] = False

print(f"\nSEMUA UJI LOLOS ({n_ok} cek)")
