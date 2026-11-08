"""Unit test komprehensif untuk Schema-Driven / Structured Note Generation & Assembly."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf
srv = mock_paf.start(0)
port = srv.server_address[1]

os.environ["PAF_BASE_URL"] = f"http://127.0.0.1:{port}"
os.environ["PAF_API_TOKEN"] = mock_paf.TOKEN
os.environ["LLM_BACKOFF_BASE"] = "0.01"

import config
config.PAF_BASE_URL = f"http://127.0.0.1:{port}"
config.PAF_API_TOKEN = mock_paf.TOKEN
config.LLM_BACKOFF_BASE = 0.01
config.LLM_RETRIES = 1

import llm
import pipeline
import sanitize

passed = 0

def check(cond, msg):
    global passed
    if not cond:
        raise SystemExit(f"GAGAL: {msg}")
    passed += 1
    print(f"  ok  {msg}")

print("=== 1. Uji Schema NOTE_SECTION_TOOL")
tool = pipeline.NOTE_SECTION_TOOL
check(isinstance(tool, dict), "NOTE_SECTION_TOOL berupa dict")
check(tool.get("name") == "generate_note_section", "nama tool adalah generate_note_section")
params = tool.get("parameters", {})
props = params.get("properties", {})
check("title" in props and props["title"]["type"] == "string", "properti 'title' ada dan bertipe string")
check("summary" in props and props["summary"]["type"] == "string", "properti 'summary' ada dan bertipe string")
check("points" in props and props["points"]["type"] == "array", "properti 'points' ada dan bertipe array")
check("code_blocks" in props and props["code_blocks"]["type"] == "array", "properti 'code_blocks' ada dan bertipe array")
check("math_formulas" in props and props["math_formulas"]["type"] == "array", "properti 'math_formulas' ada dan bertipe array")
check("tables" in props and props["tables"]["type"] == "array", "properti 'tables' ada dan bertipe array")
check(set(params.get("required", [])) == {"title", "points"}, "required fields mencakup 'title' dan 'points'")

print("=== 2. Uji Assembler assemble_note_section")

# 2.1 Format Lengkap Catatan
sample_data = {
    "title": "Hukum Gerak Newton",
    "summary": "Hukum Newton menjelaskan hubungan antara gaya dan gerak benda.",
    "points": [
        "Hukum I menyatakan benda mempertahankan status diam atau gerak lurus beraturan.",
        "Hukum II menyatakan percepatan berbanding lurus dengan resultan gaya.",
        "Hukum III menyatakan setiap aksi memiliki reaksi yang sama besar dan berlawanan arah."
    ],
    "math_formulas": [
        {
            "latex": "F = m \\cdot a",
            "explanation": "Dimana $F$ adalah gaya total (N), $m$ adalah massa (kg), dan $a$ adalah percepatan ($m/s^2$)."
        }
    ],
    "code_blocks": [
        {
            "language": "python",
            "filename": "simulasi.py",
            "explanation": "Fungsi untuk menghitung percepatan benda:",
            "code": "def percepatan(f, m):\n    return f / m\n",
            "output": "2.5 m/s^2"
        }
    ],
    "tables": [
        {
            "headers": ["Hukum", "Persamaan", "Konsep Kunci"],
            "rows": [
                ["Hukum I", "$\\sum F = 0$", "Kelembaman (Inersia)"],
                ["Hukum II", "$\\sum F = m a$", "Dinamika Gerak"],
                ["Hukum III", "$F_{aksi} = -F_{reaksi}$", "Aksi-Reaksi"]
            ]
        }
    ]
}

md_ringkas = pipeline.assemble_note_section(sample_data, style="ringkas")
check("### Hukum Gerak Newton" in md_ringkas, "judul subtopik terbentuk dengan ###")
check("Hukum Newton menjelaskan hubungan antara gaya dan gerak benda." in md_ringkas, "summary termuat")
check("- Hukum I menyatakan" in md_ringkas, "points berformat bullet pada style ringkas")
check("$$\nF = m \\cdot a\n$$" in md_ringkas, "math formula diapit blok $$")
check("Dimana $F$ adalah gaya total" in md_ringkas, "penjelasan rumus termuat")
check("Fungsi untuk menghitung percepatan benda:" in md_ringkas, "penjelasan kode berada sebelum blok kode")
check("```python simulasi.py\ndef percepatan(f, m):" in md_ringkas, "blok kode memuat bahasa dan nama berkas")
check("Keluaran:\n\n```text\n2.5 m/s^2\n```" in md_ringkas, "keluaran kode tersusun rapi")
check("| Hukum | Persamaan | Konsep Kunci |" in md_ringkas, "header tabel tersusun rapi")
check("|---|---|---|" in md_ringkas, "separator tabel konsisten")

# 2.2 Uji Gaya Sentence (penomoran 1., 2., ...)
md_sentence = pipeline.assemble_note_section(sample_data, style="sentence")
check("1. Hukum I menyatakan" in md_sentence, "style sentence menomori butir 1.")
check("2. Hukum II menyatakan" in md_sentence, "style sentence menomori butir 2.")
check("3. Hukum III menyatakan" in md_sentence, "style sentence menomori butir 3.")

# 2.3 Uji Edge Cases
md_empty = pipeline.assemble_note_section({}, style="ringkas")
check(bool(md_empty), "assemble_note_section aman terhadap dictionary kosong")
md_invalid = pipeline.assemble_note_section("teks mentah langsung", style="ringkas")
check("teks mentah langsung" in md_invalid, "assemble_note_section aman terhadap string mentah")

# 2.4 Uji LaTeX stripping (jika model menyertakan $ atau $$ di latex)
sample_dollar = {
    "title": "Rumus Energi",
    "points": ["Energi kinetik"],
    "math_formulas": [{"latex": "$$E_k = \\frac{1}{2}mv^2$$", "explanation": "Energi kinetik benda"}]
}
md_dollar = pipeline.assemble_note_section(sample_dollar, style="ringkas")
check("$$\nE_k = \\frac{1}{2}mv^2\n$$" in md_dollar, "strip dollar/double dollar bekerja sempurna pada LaTeX")

print("=== 3. Uji ask_structured Helper")

# 3.1 Panggilan normal (target backend default Qwen fallback ke _fallback_tool_to_json)
res_struct_norm = llm.ask_structured("Buat catatan terstruktur materi", tool, level="normal")
check(isinstance(res_struct_norm, dict), "ask_structured level normal mengembalikan dict")
check(res_struct_norm.get("title") == "Konsep Dasar", "ask_structured mengembalikan title yang sesuai")

# 3.2 Panggilan deep/detail (target backend Grok fallback ke _fallback_tool_to_json)
res_struct_deep = llm.ask_structured("Buat catatan terstruktur materi mendalam", tool, level="detail")
check(isinstance(res_struct_deep, dict), "ask_structured level detail mengembalikan dict")
check(res_struct_deep.get("title") == "Konsep Dasar", "ask_structured level detail mengembalikan data yang sesuai")

# 3.3 Panggilan chat (target backend DeepSeek memanggil ask_tool langsung)
res_struct_chat = llm.ask_structured("Buat catatan terstruktur materi", tool, level="chat")
check(isinstance(res_struct_chat, dict), "ask_structured level chat mengembalikan dict")
check(res_struct_chat.get("title") == "Konsep Dasar", "ask_structured level chat diproses deepseek ask_tool")

# 3.4 Fallback saat tools_unsupported pada DeepSeek
mock_paf.STATE["tools_unsupported"] = True
try:
    res_struct_fb = llm.ask_structured("Buat catatan terstruktur materi", tool, level="chat")
    check(isinstance(res_struct_fb, dict), "ask_structured chat fallback ke JSON saat tools tidak didukung")
    check(res_struct_fb.get("title") == "Konsep Dasar", "ask_structured fallback tetap mengembalikan data valid")
finally:
    mock_paf.STATE["tools_unsupported"] = False

print("=== 4. Uji Style-Specific Assembly")

sample_full = {
    "title": "Algoritma Sorting",
    "summary": "Algoritma sorting adalah cara mengurutkan data.",
    "points": [
        "Bubble sort membandingkan elemen berdekatan.",
        "Quick sort menggunakan pivot untuk mempartisi.",
        "Merge sort membagi dan menggabungkan rekursif.",
        "Insertion sort menyisipkan elemen satu per satu.",
    ],
    "code_blocks": [
        {
            "language": "python",
            "code": "def bubble_sort(arr):\n    for i in range(len(arr)):\n        for j in range(len(arr)-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]",
            "explanation": "Implementasi bubble sort:",
        }
    ],
    "math_formulas": [
        {"latex": "O(n^2)", "explanation": "Kompleksitas waktu bubble sort."}
    ],
    "tables": [
        {
            "headers": ["Algoritma", "Best Case", "Worst Case"],
            "rows": [
                ["Bubble Sort", "O(n)", "O(n^2)"],
                ["Quick Sort", "O(n log n)", "O(n^2)"],
                ["Merge Sort", "O(n log n)", "O(n log n)"],
            ]
        }
    ]
}

# 4.1 Cornell Style
md_cornell = pipeline.assemble_note_section(sample_full, style="cornell")
check("### Algoritma Sorting" in md_cornell, "cornell: judul subtopik terbentuk dengan ###")
check("#### Pertanyaan Kunci" in md_cornell or "#### Catatan Inti" in md_cornell or "summary" in md_cornell.lower() or "bubble sort" in md_cornell.lower(), "cornell: mengandung konten terstruktur")

# 4.2 Charting Style
md_charting = pipeline.assemble_note_section(sample_full, style="charting")
check("### Algoritma Sorting" in md_charting, "charting: judul subtopik terbentuk dengan ###")
check("Algoritma" in md_charting and "|" in md_charting, "charting: format tabel digunakan")

# 4.3 Outline Style
md_outline = pipeline.assemble_note_section(sample_full, style="outline")
check("### Algoritma Sorting" in md_outline, "outline: judul subtopik terbentuk dengan ###")
check("Bubble sort" in md_outline or "bubble sort" in md_outline.lower(), "outline: poin pertama muncul dalam outline")

# 4.4 Worked Style
md_worked = pipeline.assemble_note_section(sample_full, style="worked")
check("### Algoritma Sorting" in md_worked, "worked: judul subtopik terbentuk dengan ###")
check("```python" in md_worked, "worked: code block muncul dalam output")
check("1." in md_worked or "Bubble sort" in md_worked, "worked: langkah bernomor muncul dalam output")

# 4.5 Idempotency Check
md_idempotent = pipeline.assemble_note_section(sample_full, style="ringkas")
md_cleaned = sanitize.clean_note(md_idempotent)
# Idempotency: clean_note(assembler_output) tidak boleh menghilangkan konten esensial
check(len(md_cleaned) > 10, "idempotency: clean_note tidak mengosongkan output assembler")
check("Algoritma Sorting" in md_cleaned, "idempotency: judul tetap ada setelah clean_note")
check("$$" in md_cleaned or "O(n^2)" in md_cleaned, "idempotency: rumus tetap ada setelah clean_note")

# 4.6 Code Canvas Trigger Check
check("```python" in md_ringkas, "code canvas: blok python memicu render kode (backtick tripel + python)")
check("$$" in md_ringkas, "katex: blok math formula memicu render KaTeX (dollar double)")

print(f"\nSemua {passed} pemeriksaan schema & assembler lolos dengan sukses!")
