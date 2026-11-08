"""Deteksi isi khusus pada bagian materi: kode program (beserta bahasanya) dan matematika.

Hasilnya dipakai pipeline untuk menyisipkan aturan khusus ke prompt catatan HANYA saat dibutuhkan
(aturan blok kode / aturan rumus), supaya model memperlakukan isi itu dengan format yang tepat.
Murni heuristik, tanpa AI, dan sengaja konservatif agar prosa biasa tidak dianggap kode.
"""
from __future__ import annotations

import re

# ------------------------------------------------------------------ kode
_FENCE = re.compile(r"^[ \t]*(?:```|~~~)[ \t]*([A-Za-z0-9_+#.-]*)", re.M)

_CODE_START = re.compile(
    r"^\s*(?:(?:\d+[.)]|\*|-)\s+)?(?:"
    r"def |class |import |from \S+ import |function\b|const |let |var |public |private |protected |"
    r"static |return\b|#include|using |namespace |package |fn |func |SELECT\b|INSERT\b|UPDATE\b|DELETE\b|"
    r"CREATE\b|ALTER\b|DROP\b|<\?php|<!DOCTYPE|</?[A-Za-z][\w:-]*(?:\s[^>]*)?>|if\s*\(|for\s*\(|while\s*\(|"
    r"else\b|elif\b|try:|except\b|catch\b|print\(|console\.|System\.out|echo |\$ |>>> |#!/|@\w+\s*$|"
    r"[A-Za-z_][\w.]*\([^()]*\)\s*(?:\{|:)\s*$|"
    r"(?i:Program\s+[A-Za-z_]\w*|Kamus\b|Algoritma\b|Deklarasi\b|Deskripsi\b|procedure\b|"
    r"input\s*\(|output\s*\(|read(?:ln)?\s*\(|write(?:ln)?\s*\(|array\b|"
    r"[A-Za-z_][\w,\s]*:\s*(?:integer|real|string|boolean|char|array)\b|"
    r"[A-Za-z_]\w*\s*(?:<-|:=)))")
_CODE_END = re.compile(r"(?:[;{}]|(?i:\bend[.;]?))\s*$")
_INDENTED = re.compile(r"^(?: {4,}|\t)\S")

_PSEUDO_MARKERS = re.compile(
    r"(?i:\bProgram\s+[A-Za-z_]\w*|\bKamus\s*:?|\bAlgoritma\s*:?|\bDeklarasi\s*:?|\bDeskripsi\s*:?|"
    r"\bprocedure\s+[A-Za-z_]\w*|\bfunction\s+[A-Za-z_]\w*|\b(?:input|output|read(?:ln)?|write(?:ln)?)\s*\(|"
    r"[A-Za-z_][\w,\s]*:\s*(?:integer|real|string|boolean|char|array)\b|\b[A-Za-z_]\w*\s*(?:<-|:=)|\barray\s*\[)"
)

_LANG_HINTS: dict[str, list[str]] = {
    "python": [r"^\s*def \w+\(.*\):", r"^\s*(?:import \w+|from \S+ import)", r"\bprint\(", r"\belif\b", r"\bself\b", r"\b(?:None|True|False)\b", r":\s*$"],
    "javascript": [r"\bfunction\b", r"\b(?:const|let|var) \w+", r"=>", r"console\.log", r"require\(", r"===", r"document\."],
    "typescript": [r":\s*(?:string|number|boolean)\b", r"\binterface \w+", r"\btype \w+ =", r"<\w+>\("],
    "java": [r"public (?:static )?(?:class|void)", r"System\.out", r"String\[\] args", r"\bnew \w+\(", r"@Override"],
    "c": [r"#include\s*<\w+\.h>", r"\bprintf\(", r"\bint main\(", r"\bscanf\(", r"\bmalloc\("],
    "cpp": [r"std::", r"\bcout\b", r"#include\s*<(?:iostream|vector|string)>", r"using namespace std", r"\bcin\b"],
    "csharp": [r"Console\.Write", r"using System", r"\bnamespace \w+", r"\bstring\[\] args", r"\bvar \w+ = new"],
    "go": [r"^package \w+", r"\bfunc \w*\(", r"\bfmt\.", r":=", r"\bgo func"],
    "rust": [r"\bfn \w+\(", r"\blet mut\b", r"println!", r"\bimpl\b", r"->\s*\w+\s*\{"],
    "php": [r"<\?php", r"\$\w+\s*=", r"\becho\b", r"->\w+\("],
    "ruby": [r"^\s*def \w+\s*$", r"\bputs\b", r"\bend\s*$", r"\battr_\w+", r"\|\w+\|"],
    "kotlin": [r"\bfun \w+\(", r"\bval \w+", r"\bprintln\(", r"\bwhen\s*\("],
    "swift": [r"\bfunc \w+\(", r"\blet \w+\s*[:=]", r"\bvar \w+\s*:", r"\bguard\b", r"print\("],
    "sql": [r"\bSELECT\b.+\bFROM\b", r"\bINSERT INTO\b", r"\bCREATE TABLE\b", r"\bUPDATE\b.+\bSET\b", r"\bWHERE\b", r"\bJOIN\b"],
    "html": [r"<!DOCTYPE", r"<html", r"<div[\s>]", r"</\w+>", r"<(?:p|a|ul|li|span|body|head)[\s>]"],
    "css": [r"[.#]?[\w-]+\s*\{[^}]*:[^}]*;", r"@media", r"\b(?:margin|padding|color|display)\s*:"],
    "json": [r"^\s*[\[{]", r'"[\w-]+"\s*:\s*'],
    "bash": [r"^\s*\$ ", r"#!/bin/(?:ba)?sh", r"\b(?:sudo|apt|chmod|grep|curl|git|npm|pip)\b", r"\|\s*\w+", r"\becho\b"],
}
_LANG_RE = {k: [re.compile(p, re.M) for p in v] for k, v in _LANG_HINTS.items()}


def guess_lang(code: str) -> str:
    """Tebak bahasa dari sintaks. Kembalikan '' bila tidak meyakinkan."""
    best, best_score = "", 0
    for lang, pats in _LANG_RE.items():
        score = sum(1 for p in pats if p.search(code))
        if lang == "json" and not re.match(r"^\s*[\[{]", code):
            score = 0
        if score > best_score:
            best, best_score = lang, score
    if best == "c" and "cpp" in _LANG_RE and any(p.search(code) for p in _LANG_RE["cpp"]):
        best = "cpp"
    if best == "javascript" and any(p.search(code) for p in _LANG_RE["typescript"]):
        best = "typescript"
    return best if best_score >= 2 else ""


def _is_codeish(line: str) -> bool:
    return bool(_CODE_START.match(line) or _CODE_END.search(line) or _INDENTED.match(line))


def _code_runs(text: str) -> list[str]:
    """Potongan berurutan (>=3 baris, boleh diselingi baris kosong) yang tampak seperti kode."""
    runs: list[list[str]] = []
    cur: list[str] = []
    blanks = 0
    for ln in text.split("\n"):
        if not ln.strip():
            blanks += 1
            if blanks > 1 and cur:
                runs.append(cur)
                cur = []
            continue
        if _is_codeish(ln):
            cur.append(ln)
            blanks = 0
        else:
            if cur:
                runs.append(cur)
            cur = []
            blanks = 0
    if cur:
        runs.append(cur)
    return ["\n".join(r) for r in runs if len(r) >= 3]


# ------------------------------------------------------------------ matematika
_MATH_WORDS = re.compile(
    r"\b(?:persamaan|rumus|integral|turunan|derivatif|limit|matriks|vektor|logaritma|trigonometri|sinus|kosinus|"
    r"tangen|probabilitas|teorema|polinomial|diskriminan|determinan|eksponen|deret|barisan|sigma|kalkulus|aljabar|"
    r"akar kuadrat|kuadrat|pecahan|gradien|fungsi|variabel|konstanta|equation|formula|derivative|matrix|vector)\b", re.I)
_MATH_SYM = re.compile(r"[∑∫√∞≤≥≠≈±×÷∂∇πθλμσΔΩαβγ²³⁴ⁿ½¼¾⇒∈∉⊂⊆∪∩∀∃]")
_LATEX_CMD = re.compile(r"\\(?:frac|dfrac|sqrt|sum|int|prod|lim|alpha|beta|gamma|theta|pi|cdot|times|leq|geq|neq|approx|infty|partial|text|mathbf|vec|hat|binom|begin|left|right)(?![A-Za-z])")
_POWER = re.compile(r"\b[A-Za-z0-9)\]]\^[0-9{(A-Za-z]|\b[A-Za-z]_[0-9{(]")
_EQUATION = re.compile(r"(?<![=<>!:])[A-Za-z0-9)\]]\s*=\s*[-+(]?[A-Za-z0-9(]")
_FRACTION = re.compile(r"\b\d+\s*/\s*\d+\b|\)\s*/\s*\(")
_DOLLAR_MATH = re.compile(r"\$[^$\n]+\$|\$\$[\s\S]+?\$\$")


def _math_score(text: str, has_code: bool) -> int:
    score = 3 * len(_DOLLAR_MATH.findall(text)) + 3 * len(_LATEX_CMD.findall(text))
    score += len(_MATH_SYM.findall(text)) + len(_POWER.findall(text)) + len(_FRACTION.findall(text))
    score += min(len(_MATH_WORDS.findall(text)), 3)
    if not has_code:                                    # "x = 5" di kode bukan persamaan matematika
        score += min(len(_EQUATION.findall(text)), 4)
    return score


def analyze(text: str) -> dict:
    """{'code': bool, 'code_langs': [..], 'math': bool}. code_langs terurut menurut kemunculan."""
    text = str(text or "")
    langs: list[str] = []
    fences = _FENCE.findall(text)
    has_code = bool(fences) and len(re.findall(r"^\s*(?:```|~~~)", text, re.M)) >= 2
    for tag in fences:
        t = tag.strip().lower()
        if t and t not in langs and t not in ("markdown", "md", "text", "txt"):
            langs.append(t)
    if not has_code:
        runs = _code_runs(text)
        if runs:
            has_code = True
            for run in runs:
                g = guess_lang(run)
                if g and g not in langs:
                    langs.append(g)
        elif len(_PSEUDO_MARKERS.findall(text)) >= 2:
            has_code = True
    elif not langs:
        g = guess_lang(text)
        if g:
            langs.append(g)
    return {"code": has_code, "code_langs": langs[:4], "math": _math_score(text, has_code) >= 4}
