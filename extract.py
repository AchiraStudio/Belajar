"""Ekstraksi teks dari PDF, DOCX, PPTX, gambar, dan teks biasa.

Hasilnya berupa daftar `Unit` (satu halaman / slide / bagian). Unit yang hampir
tanpa teks tetapi berisi gambar ditandai `needs_vision` agar dibaca oleh model
visi (DeepSeek) di tahap pipeline.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
SUPPORTED = {".pdf", ".docx", ".pptx", ".txt", ".md"} | IMAGE_EXT
MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


class ExtractError(Exception):
    pass


@dataclass
class Unit:
    label: str
    text: str = ""
    needs_vision: bool = False
    images: List[bytes] = field(default_factory=list)
    image_loader: Optional[Callable[[], List[bytes]]] = None

    def get_images(self) -> List[bytes]:
        if self.images:
            return self.images
        return self.image_loader() if self.image_loader else []


def _clean(text: str) -> str:
    text = text.replace("\x00", "").replace("\r", "")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_image(blob: bytes, max_side: int = 1600) -> bytes:
    """Ubah gambar apa pun menjadi JPEG berukuran wajar untuk dikirim ke model visi."""
    from PIL import Image

    img = Image.open(io.BytesIO(blob))
    if getattr(img, "is_animated", False):
        img.seek(0)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()


# ---------------------------------------------------------------- PDF
def _pdf_page_loader(path: Path, index: int):
    def load() -> List[bytes]:
        import pymupdf

        doc = pymupdf.open(str(path))
        try:
            pix = doc[index].get_pixmap(dpi=110)
            return [normalize_image(pix.tobytes("png"))]
        finally:
            doc.close()
    return load


def _pdf(path: Path):
    import pymupdf

    try:
        doc = pymupdf.open(str(path))
    except Exception as exc:
        raise ExtractError(f"PDF tidak dapat dibuka: {exc}")
    try:
        if doc.needs_pass:
            raise ExtractError("PDF dilindungi password. Buka kuncinya dulu lalu unggah ulang.")
        units: List[Unit] = []
        for i in range(doc.page_count):
            page = doc[i]
            text = _clean(page.get_text("text"))
            unit = Unit(f"Halaman {i + 1}", text)
            if len(text) < 40:
                has_visual = bool(page.get_images()) or len(page.get_drawings()) > 3
                if has_visual:
                    unit.needs_vision = True
                    unit.image_loader = _pdf_page_loader(path, i)
            units.append(unit)
        return units, doc.page_count
    finally:
        doc.close()


# ---------------------------------------------------------------- DOCX
def _docx(path: Path):
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        document = docx.Document(str(path))
    except Exception as exc:
        raise ExtractError(f"DOCX tidak dapat dibuka: {exc}")

    units: List[Unit] = []
    label = "Pendahuluan"
    buf: List[str] = []

    def flush():
        text = _clean("\n".join(buf))
        if text:
            units.append(Unit(label, text))

    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            para = Paragraph(child, document)
            text = para.text.strip()
            if not text:
                continue
            style = (para.style.name if para.style is not None else "") or ""
            if re.match(r"(?i)^(heading|judul)\s*[12]\b", style) or style.lower() == "title":
                flush()
                label, buf = text[:80], [text]
            elif style.lower().startswith(("list", "daftar")):
                buf.append("- " + text)
            else:
                buf.append(text)
        elif tag == "tbl":
            table = Table(child, document)
            for r in table.rows:
                cells = []
                for cell in r.cells:
                    t = cell.text.strip().replace("\n", " ")
                    if t and (not cells or cells[-1] != t):
                        cells.append(t)
                if cells:
                    buf.append(" | ".join(cells))
    flush()
    return units, len(units)


# ---------------------------------------------------------------- PPTX
_PPT_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"}


def _pptx(path: Path):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    try:
        prs = Presentation(str(path))
    except Exception as exc:
        raise ExtractError(f"PPTX tidak dapat dibuka: {exc}")

    units: List[Unit] = []
    for number, slide in enumerate(prs.slides, 1):
        texts: List[str] = []
        images: List[bytes] = []

        def walk(shapes):
            for shape in shapes:
                try:
                    kind = shape.shape_type
                except NotImplementedError:
                    kind = None
                if kind == MSO_SHAPE_TYPE.GROUP:
                    walk(shape.shapes)
                    continue
                if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
                    t = shape.text_frame.text.strip()
                    if t:
                        texts.append(t)
                if getattr(shape, "has_table", False) and shape.has_table:
                    for r in shape.table.rows:
                        cells = [c.text.strip().replace("\n", " ") for c in r.cells if c.text.strip()]
                        if cells:
                            texts.append(" | ".join(cells))
                if kind == MSO_SHAPE_TYPE.PICTURE:
                    try:
                        if shape.image.ext.lower() in _PPT_IMAGE_EXT and len(shape.image.blob) > 1500:
                            images.append(shape.image.blob)
                    except Exception:
                        pass

        walk(slide.shapes)
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip() if slide.notes_slide.notes_text_frame else ""
            if notes:
                texts.append("Catatan pembicara: " + notes)
        text = _clean("\n".join(texts))
        unit = Unit(f"Slide {number}", text)
        if len(text) < 30 and images:
            try:
                unit.images = [normalize_image(b) for b in images[:2]]
                unit.needs_vision = True
            except Exception:
                pass
        units.append(unit)
    return units, len(units)


# ---------------------------------------------------------------- gambar & teks
def _image(path: Path):
    try:
        blob = normalize_image(path.read_bytes())
    except Exception as exc:
        raise ExtractError(f"Gambar tidak dapat dibaca: {exc}")
    return [Unit(path.stem[:60] or "Gambar", "", needs_vision=True, images=[blob])], 1


def _plain(path: Path, markdown: bool):
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    text = _clean(text)
    units: List[Unit] = []
    if markdown:
        label, buf = "Pendahuluan", []
        for line in text.split("\n"):
            m = re.match(r"^#{1,2}\s+(.*)", line)
            if m and buf:
                units.append(Unit(label, _clean("\n".join(buf))))
                label, buf = m.group(1)[:80], [line]
            else:
                if m:
                    label = m.group(1)[:80]
                buf.append(line)
        if buf:
            units.append(Unit(label, _clean("\n".join(buf))))
    else:
        units.append(Unit("Teks", text))
    return units, len(units)


def extract(path: Path, filename: str):
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        units, pages = _pdf(path)
    elif ext == ".docx":
        units, pages = _docx(path)
    elif ext == ".pptx":
        units, pages = _pptx(path)
    elif ext in IMAGE_EXT:
        units, pages = _image(path)
    elif ext in (".txt", ".md"):
        units, pages = _plain(path, ext == ".md")
    elif ext in (".doc", ".ppt"):
        raise ExtractError("Format lama (.doc/.ppt) belum didukung. Simpan ulang sebagai .docx/.pptx.")
    else:
        raise ExtractError(f"Format {ext or 'tanpa ekstensi'} belum didukung.")
    return [u for u in units if u.text.strip() or u.needs_vision], pages


# ---------------------------------------------------------------- pengelompokan
def _split_long(unit: Unit, limit: int) -> List[Unit]:
    if len(unit.text) <= limit * 1.3:
        return [unit]
    parts: List[str] = []
    cur = ""
    for para in unit.text.split("\n"):
        while len(para) > limit:  # baris tunggal yang sangat panjang
            if cur:
                parts.append(cur)
                cur = ""
            parts.append(para[:limit])
            para = para[limit:]
        if cur and len(cur) + len(para) + 1 > limit:
            parts.append(cur)
            cur = para
        else:
            cur = f"{cur}\n{para}" if cur else para
    if cur:
        parts.append(cur)
    n = len(parts)
    return [Unit(f"{unit.label} ({i}/{n})", p) for i, p in enumerate(parts, 1)]


def group_units(units: List[Unit], max_chars: int, max_units: int = 10):
    """Gabungkan unit berurutan menjadi kelompok [(label, teks)] seukuran satu request."""
    flat: List[Unit] = []
    for u in units:
        flat.extend(_split_long(u, max_chars))
    groups: List[List[Unit]] = []
    cur: List[Unit] = []
    size = 0
    for u in flat:
        length = len(u.text)
        if cur and (size + length > max_chars or len(cur) >= max_units):
            groups.append(cur)
            cur, size = [], 0
        cur.append(u)
        size += length
    if cur:
        groups.append(cur)

    result = []
    for g in groups:
        label = g[0].label if len(g) == 1 else f"{g[0].label} – {g[-1].label}"
        text = "\n\n".join(f"[{u.label}]\n{u.text}" for u in g)
        result.append((label, text))
    return result
