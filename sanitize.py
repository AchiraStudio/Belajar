"""Pembersih keluaran model: buang artefak <think>, fence, escape literal, dan JSON mentah.

Model lewat gateway PAF kadang menjawab teks Markdown dengan artefak:
- blok penalaran ``<think>...</think>`` yang ikut tercetak (tertutup maupun tidak);
- seluruh jawaban dibungkus fence `` ```...``` ``;
- baris baru ditulis literal "\\n" / "\\t" (model ikut-ikutan gaya JSON);
- jawaban berupa JSON mentah ``{"content": "..."}`` padahal diminta teks.

Semua pembersihan keluaran AI dikumpulkan di sini agar catatan, kuis, dan chat
tampil bersih. Konversi "\\n" literal dilakukan di LUAR code fence, dan perintah
LaTeX yang berawalan huruf sama (\\neq, \\nu, \\times, \\rho, dst.) dilindungi
agar rumus tidak rusak.
"""
from __future__ import annotations

import json
import re

# ---- blok penalaran model ----
_THINK_BLOCK = re.compile(r"<think>.*?</think>\s*", re.S | re.I)

# ---- fence yang membungkus SELURUH jawaban ----
_FENCE_WRAP = re.compile(r"^```[^\n]*\s*\n(.*?)\n?```\s*$", re.S)

# ---- pemisah fence untuk kerja di luar code block ----
# Pagar kode yang sah selalu di awal baris; ```tiga backtick``` di tengah kalimat dianggap teks biasa.
_FENCE_SPLIT = re.compile(r"(^[ \t]*```[^\n]*\n.*?^[ \t]*```[ \t]*$)", re.S | re.M)

_BLANK = re.compile(r"\n{3,}")

# Escape literal "\n" / "\t" / "\r" menjadi karakter asli, KECUALI bila huruf
# setelahnya melanjutkan menjadi perintah LaTeX yang dikenal (dicocokkan utuh
# sampai batas huruf, jadi "\ne" dan "\neq" lolos tapi "\never"/"\next" tetap dikonversi).
_LATEX_AFTER = (
    # lanjutan setelah "\n": nabla, neg, ne, nearrow, neq, newline, nleftarrow, ...
    "abla|earrow|eg|eLeftrightarrow|eleftarrow|emid|eoalign|eobreak|eoindent|"
    "eolimits|eonscript|eq|ewline|ot|otin|u"
    # setelah "\t": tag, tau, text, tfrac, tilde, times, to, top, triangle, ...
    "|ag|au|ext|extbf|extit|extsf|exttt|frac|ilde|imes|o|op|"
    "riangle|riangleq|riangleleft|riangleright"
    # setelah "\r": rangle, rbrace, rbrack, rfloor, rgroup, rho, right, rm, ...
    "|angle|brace|brack|floor|group|ho|ight|ightarrow|Rightarrow|"
    "ightleftharpoons|ightharpoondown|ightharpoonup|ing|m|vert"
)
_ESCAPE = re.compile(r"(?<!\\)\\([ntr])(?!(?:" + _LATEX_AFTER + r")(?![a-zA-Z]))")

# Kunci yang wajar bila model mengembalikan JSON satu field untuk jawaban teks.
_JSON_KEYS = ("content", "response", "answer", "reply", "message", "text",
              "jawaban", "balasan", "catatan", "isi")


def _fallback(orig: str, cleaned: str) -> str:
    """Bila pembersihan menghabiskan seluruh teks, kembali ke teks asli."""
    return cleaned if cleaned.strip() else orig.strip()


def strip_think(text: str) -> str:
    text = _THINK_BLOCK.sub("", text)
    low = text.lower()
    if "<think>" in low:  # tag pembuka tanpa penutup: sisanya dianggap penalaran
        head = text[:low.index("<think>")]
        tail = text[low.index("<think>") + len("<think>"):]
        text = head if head.strip() else tail
    return text


def unwrap_fence(text: str) -> str:
    """Buka pagar kode yang membungkus SELURUH jawaban (```markdown ... ```).

    Pagar berisi kode sungguhan (```python ...```) tidak dibuka, dan bila di dalamnya masih ada pagar lain
    berarti ini bukan pembungkus tunggal (mis. catatan diawali dan diakhiri dua blok kode berbeda)."""
    t = text.strip()
    m = _FENCE_WRAP.match(t)
    if not m:
        return text
    info = t.split("\n", 1)[0][3:].strip().lower()
    if info not in ("", "markdown", "md") or "```" in m.group(1):
        return text
    return m.group(1).strip()


def unwrap_json_shell(text: str) -> str:
    """Bungkusan JSON utuh {"content": "..."} -> isi field-nya (bila sesederhana itu)."""
    t = text.strip()
    if not (t.startswith("{") and t.endswith("}")):
        return text
    try:
        obj = json.loads(t)
    except ValueError:
        return text
    if isinstance(obj, dict) and len(obj) == 1:
        key, value = next(iter(obj.items()))
        if isinstance(value, str) and str(key).lower() in _JSON_KEYS and value.strip():
            return value
    return text


# Span rumus ($$...$$ atau $...$ dengan aturan ala Pandoc). Di dalam rumus, "\\n"/"\\t"/"\\r" hanyalah
# escape bila TIDAK diikuti huruf: "\\theta", "\\tan", "\\nabla" adalah perintah LaTeX, bukan tab/baris baru.
_MATH_SPAN = re.compile(r"\$\$.+?\$\$|(?<![\\$])\$(?=\S)[^$\n]*?(?<=\S)\$(?!\d)", re.S)
_ESCAPE_IN_MATH = re.compile(r"(?<!\\)\\([ntr])(?![a-zA-Z])")
_REPL = {"n": "\n", "t": "\t", "r": "\r"}


def unescape_literals(text: str) -> str:
    out: list[str] = []
    last = 0
    for m in _MATH_SPAN.finditer(text):
        out.append(_ESCAPE.sub(lambda g: _REPL[g.group(1)], text[last:m.start()]))
        out.append(_ESCAPE_IN_MATH.sub(lambda g: _REPL[g.group(1)], m.group(0)))
        last = m.end()
    out.append(_ESCAPE.sub(lambda g: _REPL[g.group(1)], text[last:]))
    return "".join(out)


def _outside_fences(text: str, fn) -> str:
    """Terapkan fn hanya pada bagian di luar code fence (isi fence jangan diubah)."""
    return "".join(part if i % 2 else fn(part) for i, part in enumerate(_FENCE_SPLIT.split(text)))


def _demote_headings(text: str) -> str:
    # judul level 1-2 dari model diturunkan agar tidak membentrok struktur halaman
    return re.sub(r"(?m)^#{1,2}\s+", "### ", text)


_FENCE_LINE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*)$")


def normalize_fence_markers(text: str) -> str:
    """Pagar `~~~` -> ``` dan pagar yang tidak ditutup ditutup di akhir (keluaran terpotong)."""
    out: list[str] = []
    open_mk = None
    for ln in text.split("\n"):
        if open_mk is None and ln.count("```") == 1 and ln.find("```") > 0 and not ln.lstrip().startswith("```"):
            head, ln = ln[:ln.find("```")].rstrip(), ln[ln.find("```"):]     # "Berikut kodenya: ```py"
            if head:
                out.append(head)
        m = _FENCE_LINE.match(ln)
        if m and open_mk is None:
            ind, mk, rest = m.groups()
            if mk[0] == "`" and "`" in rest:             # ```kode``` satu baris: bukan pagar
                out.append(ln)
                continue
            open_mk = mk[0]
            out.append(f"{ind}```{rest}")
            continue
        if m and open_mk is not None:
            ind, mk, rest = m.groups()
            if mk[0] == open_mk and not rest.strip():
                open_mk = None
                out.append(f"{ind}```")
                continue
        out.append(ln)
    if open_mk is not None:
        out.append("```")
    return "\n".join(out)


def clean_md(text: str) -> str:
    """Untuk keluaran panjang (catatan, penjelasan, balasan chat)."""
    orig = str(text or "")
    out = strip_think(orig)
    out = normalize_fence_markers(out)
    out = unwrap_fence(out)
    out = unwrap_json_shell(out)
    out = unwrap_fence(out)  # isi shell bisa saja masih terbungkus fence
    out = _outside_fences(out, unescape_literals)
    # isi blok kode tidak boleh disentuh: "# komentar" bukan judul, dan baris kosong ganda (PEP8) harus utuh
    out = _outside_fences(out, lambda part: _demote_headings(_BLANK.sub("\n\n", part)))
    return _fallback(orig, out).strip()


def clean_inline(text: str, one_line: bool = False) -> str:
    """Untuk field pendek (soal, opsi, topik, umpan balik)."""
    orig = str(text or "")
    out = strip_think(orig)
    out = unescape_literals(out)
    out = _BLANK.sub("\n\n", out)
    if one_line:
        out = re.sub(r"\s*\n\s*", " ", out)
    return _fallback(orig, out).strip()


# ======================================================================= catatan: rumus & struktur
# clean_md() tetap generik (dipakai chat/penjelasan/kuis). Khusus CATATAN belajar, hasil model
# dirapikan lebih jauh oleh clean_note(): delimiter rumus diseragamkan ke $...$ / $$...$$ (dirender
# KaTeX di frontend), judul/tabel/blok rumus diberi baris kosong, dan tabel dipaksa konsisten.

_CODE_SPLIT = re.compile(r"(```.*?```|`[^`\n]+`)", re.S)
_DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", re.S)
_BULLET_GLYPH = re.compile(r"^(\s*)[•◦▪▫‣●○]\s+", re.M)
_HEADING_NOSPACE = re.compile(r"^(#{1,6})([^\s#])", re.M)
_TOKEN = re.compile(r"\x00(\d+)\x00")


def _outside_code(text: str, fn) -> str:
    """Terapkan fn di luar code fence DAN inline code (rumus/kode di dalamnya jangan disentuh)."""
    return "".join(part if (part.startswith("`")) else fn(part) for part in _CODE_SPLIT.split(text))


def normalize_math(text: str) -> str:
    r"""Seragamkan delimiter rumus: \( ... \) -> $...$ dan \[ ... \] -> blok $$ ... $$."""
    def fix(part: str) -> str:
        part = re.sub(r"(?<!\\)\\\[(.+?)(?<!\\)\\\]",
                      lambda m: "\n\n$$\n" + m.group(1).strip() + "\n$$\n\n", part, flags=re.S)
        part = re.sub(r"(?<!\\)\\\((.+?)(?<!\\)\\\)",
                      lambda m: "$" + m.group(1).strip() + "$", part, flags=re.S)
        return part
    return _outside_code(text, fix)


def _split_cells(line: str) -> list[str]:
    """Pecah baris tabel Markdown menjadi sel; `|` di dalam $...$ atau `\\|` bukan pemisah."""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    track_math = s.count("$") % 2 == 0       # `$` ganjil = kemungkinan mata uang, jangan dilacak
    cells: list[str] = []
    cur: list[str] = []
    in_math = False
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            cur.append(s[i:i + 2])
            i += 2
            continue
        if ch == "$" and track_math:
            in_math = not in_math
        if ch == "|" and not in_math:
            cells.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
        i += 1
    cells.append("".join(cur).strip())
    return cells


_SEP_CELL = re.compile(r"^:?-{1,}:?$")


def _is_sep(line: str) -> bool:
    if "-" not in line or "|" not in line:
        return False
    cells = _split_cells(line)
    return bool(cells) and all(_SEP_CELL.match(c.replace(" ", "")) for c in cells if c != "") \
        and any(c for c in cells)


def _fix_tables(lines: list[str]) -> list[str]:
    """Samakan jumlah kolom tiap baris tabel dan beri baris kosong di sekeliling tabel."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if "|" in line and i + 1 < len(lines) and _is_sep(lines[i + 1]) and not _is_sep(line):
            header = _split_cells(line)
            n = len(header)
            sep_old = _split_cells(lines[i + 1])
            aligns = []
            for k in range(n):
                c = sep_old[k].replace(" ", "") if k < len(sep_old) else "---"
                left, right = c.startswith(":"), c.endswith(":")
                aligns.append((":" if left else "") + "---" + (":" if right else ""))
            if out and out[-1].strip():
                out.append("")
            out.append("| " + " | ".join(header) + " |")
            out.append("|" + "|".join(aligns) + "|")
            i += 2
            while i < len(lines) and lines[i].strip() and "|" in lines[i]:
                cells = _split_cells(lines[i])
                if len(cells) > n:
                    cells = cells[:n - 1] + [" / ".join(c for c in cells[n - 1:] if c)]
                cells += [""] * (n - len(cells))
                out.append("| " + " | ".join(cells) + " |")
                i += 1
            if i < len(lines) and lines[i].strip():
                out.append("")
            continue
        out.append(line)
        i += 1
    return out


def _structure_part(part: str) -> str:
    store: list[str] = []

    def protect(m):
        store.append(m.group(1).strip())
        return f"\x00{len(store) - 1}\x00"

    part = _DISPLAY_MATH.sub(protect, part)
    part = _BULLET_GLYPH.sub(r"\1- ", part)
    part = _HEADING_NOSPACE.sub(r"\1 \2", part)
    lines = [ln.rstrip().replace("\t", "    ") if ln.startswith("\t") else ln.rstrip()
             for ln in part.split("\n")]
    lines = _fix_tables(lines)

    out: list[str] = []
    for ln in lines:
        if re.match(r"^#{1,6}\s", ln):                       # judul: kosong sebelum & sesudah
            if out and out[-1].strip():
                out.append("")
            out.append(ln)
            out.append("")
            continue
        tok = re.fullmatch(r"\s*\x00(\d+)\x00\s*", ln)
        if tok:                                              # rumus blok berdiri sendiri
            if out and out[-1].strip():
                out.append("")
            out += ["$$", store[int(tok.group(1))], "$$", ""]
            continue
        out.append(ln)
    text = "\n".join(out)
    text = _TOKEN.sub(lambda m: "$$" + store[int(m.group(1))] + "$$", text)   # rumus di tengah kalimat
    return _BLANK.sub("\n\n", text)


def normalize_structure(text: str) -> str:
    """Rapikan struktur Markdown catatan (di luar code fence)."""
    joined = _outside_fences(text, _structure_part)
    return _outside_fences(joined, lambda part: _BLANK.sub("\n\n", part)).strip()


# ----------------------------------------------------------------------- catatan: blok kode
# Alias nama bahasa pada baris pembuka pagar -> nama kanonik (dipakai juga oleh "canvas coding" di frontend).
LANG_ALIASES = {
    "py": "python", "python3": "python", "js": "javascript", "node": "javascript", "mjs": "javascript",
    "jsx": "javascript", "ts": "typescript", "tsx": "typescript", "c++": "cpp", "cc": "cpp", "cxx": "cpp",
    "hpp": "cpp", "c#": "csharp", "cs": "csharp", "golang": "go", "rs": "rust", "rb": "ruby", "kt": "kotlin",
    "sh": "bash", "shell": "bash", "zsh": "bash", "console": "bash", "terminal": "bash", "yml": "yaml",
    "htm": "html", "xhtml": "html", "svg": "xml", "txt": "text", "plain": "text", "plaintext": "text",
    "output": "text", "md": "markdown",
}


def _norm_info(info: str) -> str:
    """Baris info pagar: bahasa huruf kecil + judul/nama berkas opsional (title="x.py" atau kata setelah bahasa)."""
    parts = info.strip().split(None, 1)
    if not parts:
        return ""
    lang = re.sub(r"^[{.]+|[}]+$", "", parts[0]).lower()
    lang = LANG_ALIASES.get(lang, lang)
    rest = parts[1].strip() if len(parts) > 1 else ""
    m = re.search(r"""title\s*=\s*["']?([^"'}]+)""", rest)
    if m:
        rest = m.group(1).strip()
    rest = rest.strip("{}").strip()
    return (lang + (" " + rest if rest else "")).strip()


def normalize_fences(text: str) -> str:
    """Rapikan pagar kode pada catatan: baris kosong di sekeliling, pagar di awal baris (menjorok dilepas),
    teks yang menempel sebelum ``` dipisah, nama bahasa kanonik, dan pagar yang belum ditutup ditutup."""
    out: list[str] = []
    in_f = False
    indent = 0
    need_blank = False
    for ln in text.split("\n"):
        if not in_f:
            m = re.match(r"^(\s*)```(.*)$", ln)
            if not m and ln.count("```") == 1 and ln.find("```") > 0:        # "Berikut kodenya: ```python"
                idx = ln.find("```")
                head = ln[:idx].rstrip()
                if head:
                    if need_blank:
                        out.append("")
                        need_blank = False
                    out.append(head)
                m = re.match(r"^()```(.*)$", ln[idx:])
            if not m or "`" in m.group(2):                                     # bukan pagar (atau ```inline```)
                if need_blank and ln.strip():
                    out.append("")
                need_blank = False
                out.append(ln)
                continue
            if out and out[-1].strip():
                out.append("")
            out.append("```" + _norm_info(m.group(2)))
            in_f = True
            need_blank = False
            indent = len(m.group(1).replace("\t", "    "))
            continue
        if re.match(r"^\s*```\s*$", ln):
            out.append("```")
            in_f = False
            need_blank = True
            continue
        if indent and ln[:indent].strip() == "":
            ln = ln[indent:]
        out.append(ln)
    if in_f:
        out.append("```")
    return "\n".join(out)


# ----------------------------------------------------------------------- catatan: perbaikan rumus
_MATH_SEG = re.compile(r"(\$\$.+?\$\$|(?<![\\$])\$(?=\S)[^$\n]*?(?<=\S)\$(?!\d))", re.S)
_UNI_MATH = {
    "×": r"\times ", "÷": r"\div ", "≤": r"\leq ", "≥": r"\geq ", "≠": r"\neq ", "≈": r"\approx ",
    "±": r"\pm ", "∞": r"\infty ", "π": r"\pi ", "θ": r"\theta ", "Δ": r"\Delta ", "∑": r"\sum ",
    "∫": r"\int ", "→": r"\to ", "⇒": r"\Rightarrow ", "·": r"\cdot ", "°": r"^{\circ}", "α": r"\alpha ",
    "β": r"\beta ", "γ": r"\gamma ", "λ": r"\lambda ", "μ": r"\mu ", "σ": r"\sigma ", "ω": r"\omega ",
    "Ω": r"\Omega ", "φ": r"\varphi ", "∂": r"\partial ", "∇": r"\nabla ", "∈": r"\in ", "∉": r"\notin ",
    "⊂": r"\subset ", "∪": r"\cup ", "∩": r"\cap ", "∀": r"\forall ", "∃": r"\exists ",
}
_SUP = {"²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁰": "0", "¹": "1", "ⁿ": "n"}
_SUP_RE = "".join(_SUP)


def _balance_braces(body: str) -> str:
    opens = len(re.findall(r"(?<!\\)\{", body))
    closes = len(re.findall(r"(?<!\\)\}", body))
    if opens > closes:
        body += "}" * (opens - closes)
    elif closes > opens:
        extra = closes - opens
        while extra and body.rstrip().endswith("}"):
            body = body.rstrip()[:-1]
            extra -= 1
    return body


def _repair_span(span: str) -> str:
    """Perbaiki isi satu rumus ($...$ / $$...$$): Unicode jadi LaTeX, akar, pangkat, kurung kurawal seimbang."""
    display = span.startswith("$$")
    body = span[2:-2] if display else span[1:-1]
    body = re.sub(r"√\(([^()]*)\)", r"\\sqrt{\1}", body)
    body = re.sub(r"√([A-Za-z0-9]+)", r"\\sqrt{\1}", body)
    body = body.replace("√", r"\sqrt ")
    body = re.sub(rf"([A-Za-z0-9)\]}}])([{_SUP_RE}]+)", lambda m: m.group(1) + "^{" + "".join(_SUP[c] for c in m.group(2)) + "}", body)
    for k, v in _UNI_MATH.items():
        body = body.replace(k, v)
    body = re.sub(r"(?:\\\\\s*)+$", "", body.rstrip()).strip() if body.rstrip().endswith("\\\\") else body
    body = re.sub(r"(?<=\S)  +", " ", body)
    body = _balance_braces(body)
    return ("$$" + body + "$$") if display else ("$" + body.strip() + "$")


_BARE_CMD = re.compile(
    r"\\(?:frac|dfrac|sqrt|sum|prod|int|lim|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Sigma|"
    r"Omega|cdot|times|div|pm|leq|geq|neq|approx|infty|partial|nabla|text|mathbf|mathrm|vec|hat|bar|overline|"
    r"binom|begin|left|right|sin|cos|tan|log|ln|rightarrow|to|Rightarrow)(?![A-Za-z])")
_INLINE_CMD = re.compile(
    r"\\(?:d?frac|binom)\{[^{}]*\}\{[^{}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^{}]*\}|"
    r"\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Sigma|Omega|cdot|times|div|pm|leq|geq|"
    r"neq|approx|infty|partial|nabla|rightarrow|Rightarrow)(?![A-Za-z])")
_LIST_MARK = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)")


def _prose_words(body: str) -> int:
    t = re.sub(r"\\(?:text|mathrm|mathbf)\{[^}]*\}", "", body)
    t = re.sub(r"\\[A-Za-z]+", "", t)
    return len(re.findall(r"[A-Za-z]{4,}", t))


def _wrap_bare_line(line: str) -> str:
    """Baris berisi perintah LaTeX tanpa $: bungkus bila isinya (hampir) murni rumus; selain itu biarkan."""
    if "$" in line or line.lstrip().startswith("|") or not _BARE_CMD.search(line):
        return line
    mark = ""
    m = _LIST_MARK.match(line)
    body = line
    if m:
        mark, body = m.group(1), line[m.end():]
    trail = ""
    tm = re.search(r"[.,;]+\s*$", body)
    if tm:
        trail, body = tm.group(0), body[:tm.start()]
    label = ""
    lm = re.match(r"^([^\\$:]{1,40}:)\s+(.+)$", body)
    if lm and not _BARE_CMD.search(lm.group(1)):
        label, body = lm.group(1) + " ", lm.group(2)
    if not _BARE_CMD.search(body) or _prose_words(body) > 1:
        # kalimat campuran: bungkus hanya potongan sederhana (pecahan, akar, huruf Yunani, operator)
        return _INLINE_CMD.sub(lambda m: "$" + m.group(0) + "$", line)
    if not mark and not label:
        return "\n$$\n" + body.strip() + "\n$$\n" + trail
    return mark + label + "$" + body.strip() + "$" + trail


def _fix_plain_line(line: str) -> str:
    if _BARE_CMD.search(line):
        # berisi LaTeX tanpa pembatas: bungkus bila murni rumus, selain itu biarkan UTUH (jangan sisipkan $ di dalam { })
        return _wrap_bare_line(line)
    line = re.sub(rf"(?<![\w$\\])([A-Za-z])([{_SUP_RE}]+)(?!\w)",
                  lambda m: "$" + m.group(1) + "^{" + "".join(_SUP[c] for c in m.group(2)) + "}$", line)
    return re.sub(r"(?<![\w$\\^])([A-Za-z])\^(\d+|\{[^{}]+\})(?![\w^{])",
                  lambda m: "$" + m.group(1) + "^{" + m.group(2).strip("{}") + "}$", line)


def _fix_plain(seg: str) -> str:
    return "\n".join(_fix_plain_line(ln) for ln in seg.split("\n"))


def fix_math_text(text: str) -> str:
    """Perbaiki rumus pada catatan (di luar kode): isi rumus diperbaiki, pangkat/Unicode lepas dibungkus $...$,
    dan baris berisi LaTeX tanpa pembatas dibungkus. Idempoten."""
    def per_part(part: str) -> str:
        def per_nocode(chunk: str) -> str:
            pieces = _MATH_SEG.split(chunk)
            return "".join(_repair_span(p) if i % 2 else _fix_plain(p) for i, p in enumerate(pieces))
        return _outside_code(part, per_nocode)
    return _outside_fences(text, per_part)


def lint_math(text: str) -> list[str]:
    """Daftar masalah rumus yang tersisa (kurung kurawal tak seimbang, \\begin tanpa \\end, $ ganjil)."""
    issues: list[str] = []

    def check(part: str) -> str:
        for sp in _MATH_SEG.findall(part):
            body = sp[2:-2] if sp.startswith("$$") else sp[1:-1]
            if len(re.findall(r"(?<!\\)\{", body)) != len(re.findall(r"(?<!\\)\}", body)):
                issues.append("kurung kurawal tidak seimbang: " + sp[:50])
            if len(re.findall(r"\\begin\{", body)) != len(re.findall(r"\\end\{", body)):
                issues.append("\\begin/\\end tidak berpasangan: " + sp[:50])
        rest = _MATH_SEG.sub("", part)
        for ln in rest.split("\n"):
            if _BARE_CMD.search(ln):
                issues.append("perintah LaTeX di luar $: " + ln.strip()[:50])
        for para in re.split(r"\n\s*\n", rest):
            if len(re.findall(r"(?<!\\)\$", para)) % 2 and not re.search(r"\$\s*\d", para):
                issues.append("tanda $ ganjil: " + para.strip()[:50])
        return part
    _outside_fences(text, lambda p: _outside_code(p, check))
    return issues


def clean_note(text: str) -> str:
    """Pembersih lengkap untuk catatan belajar: clean_md + pagar kode rapi + rumus seragam & diperbaiki + struktur."""
    t = clean_md(text)
    t = normalize_fences(t)
    t = normalize_math(t)
    t = fix_math_text(t)
    return normalize_structure(t)
