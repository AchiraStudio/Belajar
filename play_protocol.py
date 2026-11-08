"""Protokol keluaran AI untuk game: narasi Markdown + satu blok data terstruktur.

Tanpa tools dan tanpa mode JSON di gateway, jadi struktur dikirim di dalam teks:

    Narasi untuk pelajar (Markdown, di-stream)...

    <<<GAME_DATA
    {"judgement": {...} | null, "next": {...} | null, "state_delta": {...}, "end": false}
    GAME_DATA>>>

Modul ini murni (tanpa DB/jaringan) sehingga mudah diuji:
- StreamSplitter: meneruskan narasi ke klien saat stream, menahan ekor agar penanda yang terpotong
  antar-chunk tidak bocor, dan berhenti meneruskan setelah penanda ditemukan.
- parse_reply: memakai teks FINAL (x_meta.full_text), bukan gabungan delta, lalu memisahkan
  narasi dari data dan membersihkan keluaran model (data tak tepercaya).
"""
from __future__ import annotations

import re
from typing import Any, TypedDict

import llm
import sanitize
from common import clamp01

MARK = "<<<GAME_DATA"
MARK_END = "GAME_DATA>>>"

_MARK_RE = re.compile(r"<<<\s*GAME_DATA", re.I)
_MARK_END_RE = re.compile(r"GAME_DATA\s*>>>", re.I)


class ProtocolError(ValueError):
    """Balasan AI tidak sesuai protokol. Pesannya dipakai untuk meminta AI memperbaiki."""


class RubricScores(TypedDict, total=False):
    akurat: int
    lengkap: int
    jelas: int
    contoh: int


class JudgementData(TypedDict, total=False):
    umpan_balik: str
    miskonsepsi: str
    skor: float
    rubrik: RubricScores
    items: dict[str, float]


class NextTurnData(TypedDict, total=False):
    konsep: str
    public: dict[str, Any]
    secret: dict[str, Any]
    batch: list[dict[str, Any]]


class StateDeltaData(TypedDict, total=False):
    location: str


class GameDataResult(TypedDict):
    judgement: JudgementData | None
    next: NextTurnData | dict[str, Any] | None
    state_delta: StateDeltaData | dict[str, Any]
    end: bool


class StreamSplitter:
    """Teruskan hanya teks sebelum penanda. Ekor sepanjang len(MARK)-1 ditahan sampai pasti aman."""

    def __init__(self) -> None:
        self._buf = ""
        self.found = False

    def feed(self, delta: str) -> str:
        if self.found or not delta:
            return ""
        self._buf += delta
        m = _MARK_RE.search(self._buf)
        if m:
            self.found = True
            out, self._buf = self._buf[:m.start()], self._buf[m.start():]
            return out
        keep = len(MARK) - 1
        if len(self._buf) > keep:
            out, self._buf = self._buf[:-keep], self._buf[-keep:]
            return out
        return ""

    def flush(self) -> str:
        """Akhir stream: bila penanda tak pernah muncul, sisa buffer adalah narasi biasa."""
        if self.found:
            return ""
        out, self._buf = self._buf, ""
        return out


def split_reply(full_text: str) -> tuple[str, str | None]:
    """Pisahkan (narasi, teks_data). teks_data None bila penanda tidak ada."""
    text = full_text or ""
    m = _MARK_RE.search(text)
    if not m:
        return text.strip(), None
    narration = text[:m.start()].rstrip()
    if narration.endswith("```json"):
        narration = narration[:-7].rstrip()
    elif narration.endswith("```"):
        narration = narration[:-3].rstrip()
    rest = text[m.end():]
    m_end = _MARK_END_RE.search(rest)
    data = rest[:m_end.start()] if m_end else rest
    return narration.strip(), data.strip()


def _clean_json_fence(text: str) -> str:
    """Hapus pembungkus markdown code fence (``` atau ```json) di dalam blok data."""
    s = text.strip()
    while True:
        m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, flags=re.DOTALL | re.I)
        if m:
            s = m.group(1).strip()
        else:
            break
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.I)
    s = re.sub(r"\s*```$", "", s, flags=re.I)
    return s.strip()


def _clip(value: Any, n: int) -> str:
    return sanitize.clean_inline(str(value or ""))[:n]


def _judgement(raw: Any) -> JudgementData | None:
    if raw in (None, False) or not isinstance(raw, dict):
        return None
    out: JudgementData = {
        "umpan_balik": _clip(raw.get("umpan_balik"), 500),
        "miskonsepsi": _clip(raw.get("miskonsepsi"), 300),
    }
    rubrik = raw.get("rubrik")
    if isinstance(rubrik, dict):
        rb: RubricScores = {}
        for key in ("akurat", "lengkap", "jelas", "contoh"):
            try:
                rb[key] = max(0, min(3, int(round(float(rubrik.get(key))))))
            except (TypeError, ValueError):
                continue
        out["rubrik"] = rb
    # skor AI di-clamp ke [0,1]; bila rubrik lengkap, skor dihitung ulang dari rubrik (agent wasit)
    out["skor"] = clamp01(raw.get("skor"), default=-1.0)
    rb_check = out.get("rubrik") or {}
    if len(rb_check) == 4:
        out["skor"] = round(sum(rb_check.values()) / 12, 4)
    if isinstance(raw.get("items"), dict):  # penilaian per soal (Ujian Boss): {"3": 0.5}
        out["items"] = {str(k)[:6]: clamp01(v) for k, v in list(raw["items"].items())[:20]}
    return out


def parse_reply(full_text: str) -> tuple[str, GameDataResult]:
    """(narasi_bersih, data_ternormalisasi). Melempar ProtocolError bila format rusak.

    data: {"judgement": dict|None, "next": dict|None, "state_delta": dict, "end": bool}
    Field di luar skema dibuang. Validasi isi per mode dilakukan oleh play_games.
    """
    narration, data_text = split_reply(full_text)
    if data_text is None:
        raise ProtocolError("blok <<<GAME_DATA ... GAME_DATA>>> tidak ditemukan")
    cleaned = _clean_json_fence(data_text)
    try:
        obj = llm.extract_json(cleaned)
    except ValueError:
        raise ProtocolError("isi GAME_DATA bukan JSON yang valid")
    if not isinstance(obj, dict):
        raise ProtocolError("isi GAME_DATA harus berupa objek JSON")

    nxt = obj.get("next")
    if nxt is not None and not isinstance(nxt, dict):
        raise ProtocolError("'next' harus objek atau null")
    delta = obj.get("state_delta")
    data: GameDataResult = {
        "judgement": _judgement(obj.get("judgement")),
        "next": nxt,
        "state_delta": delta if isinstance(delta, dict) else {},
        "end": bool(obj.get("end")),
    }
    return sanitize.clean_md(narration), data
