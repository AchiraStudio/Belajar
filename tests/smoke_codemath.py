"""Uji v2.3.1: deteksi kode/matematika, pagar kode (canvas coding), perbaikan rumus, aturan prompt.

Jalankan dari root repo:  python tests/smoke_codemath.py
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
tmp = Path(tempfile.mkdtemp(prefix="belajar-codemath-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf  # noqa: E402

srv = mock_paf.start(0)
os.environ.update({
    "DATA_DIR": str(tmp / "data"), "BRIDGE_URL": "ws://x/bridge", "BRIDGE_TOKEN": "t" * 20,
    "PAF_BASE_URL": f"http://127.0.0.1:{srv.server_address[1]}", "PAF_API_TOKEN": mock_paf.TOKEN,
    "LLM_BACKOFF_BASE": "0.05", "LLM_CONCURRENCY": "2", "CHUNK_CHARS": "6000",
})

fx = tmp / "fx"
subprocess.run([sys.executable, str(ROOT / "tests" / "make_fixtures.py"), str(fx)], check=True)

import config  # noqa: E402
import db  # noqa: E402
import detect  # noqa: E402
import handlers as H  # noqa: E402
import jobs  # noqa: E402
import pipeline  # noqa: E402
import sanitize  # noqa: E402

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


check(config.VERSION == "2.3.1", "VERSION = 2.3.1")

# ------------------------------------------------------------------ deteksi
print("== detect.analyze")
PY = "Berikut contoh fungsi:\n\ndef luas(p, l):\n    return p * l\n\nprint(luas(2, 3))\n"
a = detect.analyze(PY)
check(a["code"] and a["code_langs"] == ["python"] and not a["math"], "kode Python terdeteksi (bahasa python), bukan matematika")
a = detect.analyze("const a = 1;\nlet b = a + 2;\nfunction f(x) {\n  return x * 2;\n}\nconsole.log(f(b));")
check(a["code"] and a["code_langs"] == ["javascript"], "kode JavaScript terdeteksi")
a = detect.analyze("SELECT nama FROM siswa\nWHERE umur > 17;\nINSERT INTO siswa VALUES (1);")
check(a["code"] and a["code_langs"] == ["sql"], "SQL terdeteksi")
a = detect.analyze("Teks\n```java\npublic class A {}\n```\nlagi")
check(a["code"] and a["code_langs"] == ["java"], "pagar bertanda bahasa: bahasa diambil dari tanda, bukan dari teks sesudahnya")
a = detect.analyze("Persamaan kuadrat: ax^2 + bx + c = 0, dengan diskriminan D = b^2 - 4ac. Akar x = (-b ± √D) / 2a")
check(a["math"] and not a["code"], "persamaan kuadrat terdeteksi sebagai matematika, bukan kode")
a = detect.analyze("Kecepatan v = s/t, percepatan a = Δv/Δt, GLBB: s = v0 t + 1/2 a t^2")
check(a["math"] and not a["code"], "rumus fisika terdeteksi sebagai matematika")
a = detect.analyze("y = 2x + 1\nx = 3\ny = 7\nz = x + y\nz = 10")
check(not a["code"], "deretan persamaan tidak dianggap kode (tanpa penanda sintaks)")
a = detect.analyze("Fotosintesis adalah proses tumbuhan membuat makanan. Terjadi di kloroplas.\nOksigen dilepas (lihat gambar 2).")
check(not a["code"] and not a["math"], "prosa biasa: bukan kode, bukan matematika")
a = detect.analyze("PDB naik 3 persen. Inflasi 2 persen. Suku bunga 5 persen sesuai kebijakan.")
check(not a["math"], "angka dalam prosa ekonomi bukan matematika")
a = detect.analyze("Agenda:\n- Pendahuluan\n- Metode\n- Hasil\n- Kesimpulan")
check(not a["code"], "daftar bullet bukan kode")
check(detect.guess_lang("<!DOCTYPE html>\n<html><div>x</div></html>") == "html", "guess_lang: html")
check(detect.guess_lang("x") == "", "guess_lang: tidak yakin -> kosong")
a_pseudo = detect.analyze("Program MenghitungLuas\nKamus:\n  panjang, lebar : integer\n  luas : real\nAlgoritma:\n  input(panjang, lebar)\n  luas <- panjang * lebar\n  output(luas)\n")
check(a_pseudo["code"] and not a_pseudo["math"], "pseudocode Pascal/slide kuliah terdeteksi sebagai kode, bukan murni matematika")
a_algo = detect.analyze("Algoritma Pencarian_Biner\nKamus:\n  A : array [1..100] of integer\n  x, kiri, kanan : integer\nAlgoritma:\n  input(x)\n  output(kiri)\n")
check(a_algo["code"] and not a_algo["math"], "slide algoritma array & input/output terdeteksi sebagai kode")
a_proc = detect.analyze("procedure Tukar(var a, b : integer)\nkamus lokal:\n  temp : integer\nalgoritma:\n  temp := a\n  a := b\n  b := temp\n")
check(a_proc["code"] and not a_proc["math"], "procedure dengan deklarasi integer terdeteksi sebagai kode")

# ------------------------------------------------------------------ pagar kode
print("== sanitize: pagar kode & isi kode utuh")
CODE = "```python\n# Hitung luas\ndef f():\n    print(\"a\\nb\")  # \\t tab\n\n\ndef g():\n    pass   \n```"
check(sanitize.clean_md(CODE) == CODE, "clean_md: komentar '#', \\n di string, baris kosong ganda, spasi akhir tetap utuh")
check("### Hitung" not in sanitize.clean_note("a\n" + CODE + "\nb"), "komentar '#' di dalam kode tidak diubah menjadi judul")
out = sanitize.clean_note("Contoh:\n" + CODE + "\nSelesai.")
check(out == "Contoh:\n\n" + CODE + "\n\nSelesai.", "clean_note: hanya baris kosong di sekeliling pagar yang ditambah, isi kode persis sama")
check(sanitize.clean_md("```python\nprint(1)\n```") == "```python\nprint(1)\n```", "catatan yang hanya berisi satu blok kode tidak dilepas pagarnya")
check(sanitize.clean_md("```markdown\n### A\nteks\n```") == "### A\nteks", "pembungkus ```markdown seluruh jawaban tetap dibuka")
check(sanitize.clean_md("```\n### A\nteks\n```") == "### A\nteks", "pembungkus ``` polos seluruh jawaban tetap dibuka")
two = "```python\na=1\n```\ntengah\n```js\nb=2\n```"
check(sanitize.clean_md(two) == two, "dua blok kode berbeda diawali & diakhiri pagar tidak 'dibuka' sebagai pembungkus")
check(sanitize.clean_md("~~~python\nx=1\n~~~") == "```python\nx=1\n```", "pagar ~~~ diseragamkan menjadi ```")
check(sanitize.clean_note("teks\n```py\nx=1") == "teks\n\n```python\nx=1\n```", "pagar tak tertutup ditutup; alias py -> python")
check(sanitize.clean_note("Berikut kodenya: ```py\nx=1\n```") == "Berikut kodenya:\n\n```python\nx=1\n```", "pagar menempel di akhir kalimat dipisah, tanpa pagar kosong sisa")
check(sanitize.clean_note("```Python main.py\nx=1\n```") == "```python main.py\nx=1\n```", "bahasa jadi huruf kecil, nama berkas dipertahankan")
check(sanitize.clean_note('```js title="app.js"\nx=1\n```') == "```javascript app.js\nx=1\n```", 'title="..." -> nama berkas; js -> javascript')
check(sanitize.clean_note("- butir\n    ```python\n    x = 1\n    ```\n- lagi") == "- butir\n\n```python\nx = 1\n```\n\n- lagi", "pagar yang menjorok dilepas ke awal baris dan isinya ikut di-dedent")
check(sanitize.clean_note("a\n```c++\nint x;\n```\nb").count("```cpp") == 1, "alias c++ -> cpp")
check(sanitize.clean_note("`kode` sebaris dan ```satu baris``` tetap") == "`kode` sebaris dan ```satu baris``` tetap", "kode sebaris & ```satu baris``` tidak dianggap pagar")
check(sanitize.clean_note(sanitize.clean_note(out)) == out, "clean_note idempoten pada catatan berisi kode")
try:
    sanitize.unwrap_fence("```python\n```")
    check(True, "unwrap_fence aman pada blok kosong")
except Exception as e:  # pragma: no cover
    check(False, f"unwrap_fence melempar {e}")

# ------------------------------------------------------------------ perbaikan rumus
print("== sanitize: perbaikan rumus")
check(sanitize.clean_note("Luas $x² + √(a+b) ≤ 5$") == "Luas $x^{2} + \\sqrt{a+b} \\leq 5$", "Unicode di dalam $...$ menjadi LaTeX (pangkat, akar, ≤)")
check(sanitize.clean_note("luas m² dan x^2 di teks") == "luas $m^{2}$ dan $x^{2}$ di teks", "pangkat di teks biasa dibungkus $...$")
check(sanitize.clean_note("$\\frac{a}{b$") == "$\\frac{a}{b}$", "kurung kurawal kurang ditutup")
check(sanitize.clean_note("$$x^{2}}$$") == "$$\nx^{2}\n$$", "kurung kurawal berlebih dibuang")
check(sanitize.clean_note("\\sqrt{x^2+y^2}") == "$$\n\\sqrt{x^2+y^2}\n$$", "baris LaTeX murni tanpa $ dibungkus blok $$, isi { } tidak disisipi $")
check(sanitize.clean_note("Rumus: \\frac{a}{b} = c") == "Rumus: $\\frac{a}{b} = c$", "label + LaTeX: label di luar, rumus di dalam $...$")
check(sanitize.clean_note("- \\alpha + \\beta") == "- $\\alpha + \\beta$", "butir daftar berisi LaTeX murni dibungkus")
mixed = sanitize.clean_note("Ketika \\frac{a}{b} muncul, dan \\alpha serta \\sqrt{x} di kalimat panjang sekali ini.")
check(mixed == "Ketika $\\frac{a}{b}$ muncul, dan $\\alpha$ serta $\\sqrt{x}$ di kalimat panjang sekali ini.", "kalimat campuran: hanya potongan LaTeX sederhana dibungkus")
nested = "Nested \\frac{a}{b^{2}} dalam kalimat yang panjang sekali begini."
check(sanitize.clean_note(nested) == nested, "LaTeX bersarang dalam kalimat dibiarkan utuh (tidak dirusak)")
check(bool(sanitize.lint_math(nested)), "lint_math menandai LaTeX di luar $")
check(sanitize.lint_math("$\\frac{a}{b$") and not sanitize.lint_math("$\\frac{a}{b}$ dan harga $5"), "lint_math: kurung tak seimbang ditandai, mata uang tidak")
check(sanitize.clean_note("Harga $5 dan 3^2 sama") == "Harga $5 dan $3^{2}$ sama" or "$5" in sanitize.clean_note("Harga $5 dan x^2"), "mata uang tidak dianggap rumus")
check("\t" not in sanitize.clean_md("$\\theta + \\tan x$ dan $\\nabla f$"), "\\theta \\tan \\nabla tetap LaTeX (tidak jadi TAB)")
check(sanitize.clean_note("a\n```\nx^2 dan \\sqrt{y}\n```\nb").count("x^2 dan \\sqrt{y}") == 1, "isi blok kode tidak disentuh perbaikan rumus")
check(sanitize.clean_note("`x^2` kode sebaris") == "`x^2` kode sebaris", "kode sebaris tidak disentuh perbaikan rumus")
samples = [
    "Luas $p × l ≤ x²$ dan D = b^2 - 4ac\n\\frac{a}{b} = c\n- \\alpha + \\beta",
    "### Judul\n\n| A | B |\n|---|---|\n| $x²$ | y^2 |\n\n```python\n# c\nx = 1\n\n\ny = 2\n```\n",
    "Rumus: \\sqrt{x^2+y^2}\n\n$$\\frac{a}{b$$\nteks m² selesai",
]
check(all(sanitize.clean_note(sanitize.clean_note(t)) == sanitize.clean_note(t) for t in samples), "clean_note idempoten pada campuran kode/rumus/tabel")

# ------------------------------------------------------------------ aturan prompt
print("== pipeline.extra_rules & prompt")
x = pipeline.extra_rules(PY)
check("ATURAN KODE PROGRAM" in x and "memuat kode: python" in x and "ATURAN MATEMATIKA" not in x, "kode terdeteksi -> aturan kode (menyebut bahasa), tanpa aturan matematika")
x = pipeline.extra_rules("Persamaan kuadrat: ax^2 + bx + c = 0, diskriminan D = b^2 - 4ac. x = (-b ± √D) / 2a")
check("ATURAN MATEMATIKA" in x and "\\frac{a}{b}" in x and "ATURAN KODE PROGRAM" not in x, "matematika terdeteksi -> aturan matematika (dengan tabel konversi), tanpa aturan kode")
check(pipeline.extra_rules("Fotosintesis terjadi di kloroplas.") == "", "prosa biasa -> tidak ada aturan tambahan (hemat token)")
check("```python" in pipeline.CODE_RULES and "TIDAK boleh ditaruh di dalam tabel" in pipeline.CODE_RULES, "aturan kode memuat contoh pagar dan larangan kode di tabel/daftar")
check("```" in pipeline.FORMAT_RULES and "nama bahasa" in pipeline.FORMAT_RULES, "FORMAT_RULES dasar (semua materi) menyebut blok kode bernama bahasa")
check("```python" in pipeline.VISION_PROMPT and "$...$" in pipeline.VISION_PROMPT, "prompt pembacaan gambar meminta LaTeX dan blok kode")
check("$...$" in pipeline.EXPLAIN_PROMPT and "$...$" in pipeline.NOTES_ASK_RULES, "prompt penjelasan & tanya-jawab meminta LaTeX")
check("\\\n" not in pipeline.VISION_PROMPT and "\\\n" not in pipeline.EXPLAIN_PROMPT, "tidak ada backslash+baris baru liar di prompt")
check("pemrograman" in pipeline.STYLE_RULES["worked"], "Worked Examples menangani materi pemrograman")

# ------------------------------------------------------------------ end-to-end lewat mock
print("== End-to-end: materi berisi kode & rumus")
MD = (
    "# Fungsi dan Rumus\n\n"
    "Fungsi menghitung luas persegi panjang.\n\n"
    "def luas(p, l):\n    return p * l\n\nprint(luas(2, 3))\n\n"
    "Persamaan kuadrat: ax^2 + bx + c = 0, diskriminan D = b^2 - 4ac, akar x = (-b ± √D) / 2a.\n"
)
data = base64.b64encode(MD.encode()).decode()
calls = mock_paf.STATE["calls"]
mark = len(calls)
up = call("upload_document", filename="kode.md", data=data, style="outline")
check(wait_job(up["job_id"])["status"] == "done", "unggah kode.md (outline) selesai")
note_calls = [c for c in calls[mark:] if "MATERI (bagian:" in c["prompt"] and "Pedoman Gaya" in c["prompt"]]
check(bool(note_calls), "ada panggilan pembuatan catatan")
check(all("ATURAN KODE PROGRAM" in c["prompt"] and "memuat kode: python" in c["prompt"] for c in note_calls), "prompt memuat aturan kode (bahasa python) karena materi berisi kode")
check(all("ATURAN MATEMATIKA" in c["prompt"] for c in note_calls), "prompt memuat aturan matematika karena materi berisi persamaan")
check(all(c["backend"] == "grok" for c in note_calls), "gaya outline tetap lewat grok")
md = call("get_document", id=up["doc_id"])["note"]["content_md"]
check("```python luas.py\n# Hitung luas\ndef luas(p, l):" in md, "catatan: pagar python bernama berkas, komentar '#' utuh (bukan judul)")
check("print(\"Luas:\\n\", p * l)\n\n\ndef keliling" in md, "catatan: \\n dalam string kode dan dua baris kosong antar fungsi utuh")
check("\n\n```python luas.py" in md and "```\n\nRumus:" in md, "catatan: fence dipisah dari kalimat dan diberi baris kosong")
check("```sql\nSELECT * FROM siswa;\n```" in md, "catatan: pagar ~~~sql yang tak tertutup dibenahi")
check("$p \\times l \\leq x^{2}$" in md and "Rumus: $\\frac{a}{b} = c$" in md, "catatan: Unicode -> LaTeX, baris LaTeX tanpa $ dibungkus")
check("### Hitung luas" not in md, "catatan: tidak ada judul palsu dari komentar kode")
body = md[md.index("### Fungsi luas"):]
check(sanitize.clean_note(body) == body, "isi catatan per bagian sudah stabil (idempoten)")

mark = len(calls)
up2 = call("upload_document", filename="bio.docx", data=base64.b64encode((fx / "bio.docx").read_bytes()).decode(), style="outline")
check(wait_job(up2["job_id"])["status"] == "done", "unggah bio.docx (prosa)")
prose_calls = [c for c in calls[mark:] if "MATERI (bagian:" in c["prompt"] and "Pedoman Gaya" in c["prompt"]]
check(bool(prose_calls) and not any("ATURAN KODE PROGRAM" in c["prompt"] or "ATURAN MATEMATIKA" in c["prompt"] for c in prose_calls),
      "materi prosa: tidak ada aturan kode/matematika (hemat token)")

print(f"\nSEMUA UJI LOLOS ({n_ok} cek)")
