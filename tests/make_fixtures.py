"""Membuat berkas contoh: docx, pptx, pdf (teks), pdf (hasil scan), png."""
import io
import sys
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)

from PIL import Image, ImageDraw

# --- DOCX dengan heading, daftar, tabel
import docx
d = docx.Document()
d.add_heading("Fotosintesis", 1)
d.add_paragraph("Fotosintesis adalah proses tumbuhan mengubah cahaya menjadi energi kimia. " * 5)
d.add_paragraph("Klorofil menyerap cahaya merah dan biru.", style="List Bullet")
d.add_heading("Respirasi", 1)
d.add_paragraph("Respirasi seluler menghasilkan ATP dari glukosa. " * 5)
t = d.add_table(rows=2, cols=2)
t.cell(0, 0).text, t.cell(0, 1).text = "Tahap", "Lokasi"
t.cell(1, 0).text, t.cell(1, 1).text = "Glikolisis", "Sitoplasma"
d.save(out / "bio.docx")

# --- PPTX: 12 slide teks + 1 slide gambar saja
from pptx import Presentation
from pptx.util import Inches
prs = Presentation()
for i in range(1, 13):
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = f"Topik {i}"
    s.placeholders[1].text = f"Penjelasan topik {i}. " * 12
    s.notes_slide.notes_text_frame.text = f"Catatan pembicara {i}"
img = Image.new("RGB", (800, 600), "white")
ImageDraw.Draw(img).text((50, 50), "DIAGRAM", fill="black")
buf = io.BytesIO(); img.save(buf, "PNG"); buf.seek(0)
s = prs.slides.add_slide(prs.slide_layouts[6])
s.shapes.add_picture(buf, Inches(1), Inches(1), Inches(6))
prs.save(out / "slides.pptx")

# --- PDF teks (3 halaman) dan PDF scan (gambar saja)
import pymupdf
doc = pymupdf.open()
for i in range(1, 4):
    page = doc.new_page()
    page.insert_text((72, 100), f"Halaman {i}: " + "isi materi sejarah yang cukup panjang. " * 6, fontsize=11)
doc.save(out / "teks.pdf")

scan = pymupdf.open()
page = scan.new_page()
img = Image.new("RGB", (900, 1200), "white")
ImageDraw.Draw(img).text((80, 80), "HASIL SCAN", fill="black")
b = io.BytesIO(); img.save(b, "PNG")
page.insert_image(page.rect, stream=b.getvalue())
scan.save(out / "scan.pdf")

# --- gambar tunggal
img.save(out / "papan.png")
Path(out / "catatan.txt").write_text("Teks biasa.\nBaris kedua tentang ekonomi.", encoding="utf-8")
print("fixtures ok:", sorted(p.name for p in out.iterdir()))
