"""Uji standalone untuk sanitize.py:  .venv/Scripts/python.exe tests/sanitize_check.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sanitize  # noqa: E402

passed = 0


def check(got, want, label):
    global passed
    if got != want:
        print(f"GAGAL: {label}\n  dapat : {got!r}\n  harap : {want!r}")
        sys.exit(1)
    passed += 1
    print("  ok -", label)


print("== clean_md")
check(sanitize.clean_md("Kalimat satu\\nKalimat dua"), "Kalimat satu\nKalimat dua",
      "escape \\n literal menjadi baris baru")
check(sanitize.clean_md("Baris\\n\\nParagraf baru"), "Baris\n\nParagraf baru",
      "\\n\\n menjadi pemisah paragraf")
check(sanitize.clean_md("<think>berpikir panjang</think>Jawaban: 42"), "Jawaban: 42",
      "blok <think> tertutup dibuang")
check(sanitize.clean_md("Pembuka\n<think>penalaran tanpa penutup"), "Pembuka",
      "<think> tanpa penutup: sisa dianggap penalaran dan dibuang")
check(sanitize.clean_md("Penjelasan\n```\nKode \\n tetap\n```\nPenutup\\nlagi"),
      "Penjelasan\n```\nKode \\n tetap\n```\nPenutup\nlagi",
      "escape di dalam code fence tertanam tidak diubah")
check(sanitize.clean_md("```markdown\n# Judul\nIsi\n```"), "### Judul\nIsi",
      "fence pembungkus seluruh jawaban dibuka, judul diturunkan")
check(sanitize.clean_md('{"jawaban": "Isi yang penting"}'), "Isi yang penting",
      "JSON shell satu field dibuka")
check(sanitize.clean_md("Jika x \\neq y dan \\nu > 0"), "Jika x \\neq y dan \\nu > 0",
      "perintah LaTeX \\neq dan \\nu tidak tersentuh")
check(sanitize.clean_md("Rumus \\frac{1}{2}\\nlanjut"), "Rumus \\frac{1}{2}\nlanjut",
      "\\frac selamat, \\n sebelum kata dikonversi")
check(sanitize.clean_md("a\\nnext langkah\\nnegara"), "a\nnext langkah\nnegara",
      "\\n + kata biasa (next, negara) tetap dikonversi")
check(sanitize.clean_md("x \\times 3\\t dan \\rho"), "x \\times 3\t dan \\rho",
      "\\times dan \\rho selamat, \\t dikonversi")
check(sanitize.clean_md("a\n\n\n\nb"), "a\n\nb", "baris kosong berlebih dirapatkan")
check(sanitize.clean_md("## Judul Besar\nisi"), "### Judul Besar\nisi",
      "judul level 1-2 diturunkan ke level 3")
check(sanitize.clean_md("  \n\n"), "", "teks kosong tetap kosong")

print("== clean_inline")
check(sanitize.clean_inline("Soal?\\nYa", one_line=True), "Soal? Ya",
      "one_line meratakan baris")
check(sanitize.clean_inline("<think>x</think>Definisi fotosintesis"), "Definisi fotosintesis",
      "think dibuang pada field pendek")
check(sanitize.clean_inline(" a \\neq b "), "a \\neq b", "LaTeX pada field pendek selamat")

print(f"\nSemua {passed} pemeriksaan lulus.")
