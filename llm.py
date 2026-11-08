"""Klien PAF-Model (gateway mirip OpenAI Chat Completions).

Catatan perilaku gateway (lihat API_USAGE.md):
- hanya pesan `user` terakhir yang dikirim, jadi setiap request harus berdiri sendiri;
- streaming SSE didukung untuk DeepSeek ("stream": true);
- sesi tidak kedaluwarsa otomatis, jadi sesi dihapus setelah dipakai;
- error ada di field `detail`;
- `x_meta.full_text` pada chunk terakhir adalah teks paling akurat, dan
  `x_meta.mode_fallback` = true berarti sesi hilang sehingga gateway membuat sesi baru.

Semua permintaan HTTP melewati satu fungsi (`_post_once`) sehingga telemetri, think_mode,
deteksi mode_fallback, dan semaphore per-backend diatur di satu tempat.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field

import requests

import config

log = logging.getLogger("llm")


class LLMError(Exception):
    def __init__(self, message: str, status: int | None = None,
                 retryable: bool = False, fatal: bool = False,
                 raw_text: str | None = None):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.fatal = fatal
        self.raw_text = raw_text


@dataclass
class LLMResponse:
    """Hasil satu permintaan: teks akhir, id sesi gateway, dan metadata `x_meta`."""
    text: str
    session_id: str | None = None
    meta: dict = field(default_factory=dict)
    first_chunk_s: float | None = None
    total_s: float = 0.0
    tool_calls: list | None = None

    @property
    def mode_fallback(self) -> bool:
        return bool(self.meta.get("mode_fallback"))

    def __iter__(self):
        return iter((self.text, self.session_id))

    def __getitem__(self, index):
        return (self.text, self.session_id)[index]

    def __str__(self) -> str:
        return self.text


# level -> urutan (backend, think_mode).
# Sesuai pembaruan gateway:
# - Input gambar/file upload (attachments) menggunakan DeepSeek (bukan Qwen).
# - Qwen dinonaktifkan sementara untuk attachment (HTTP 400 upstream).
# - Grok hanya digunakan untuk kebutuhan yang kompleks & deep (level="deep", level="detail",
#   atau analisis lampiran berkas yang kompleks).
PLANS = {
    # Cepat / ringan: Qwen fast, fallback DeepSeek instant (tanpa Grok karena Grok khusus kompleks & deep)
    "fast":   [("qwen", "fast"), ("deepseek", "instant")],
    # Normal / standar materi: Qwen auto, fallback DeepSeek
    "normal": [("qwen", "auto"), ("deepseek", None)],
    # Penalaran terstruktur: Qwen thinking, fallback DeepSeek thinking
    "reason": [("qwen", "thinking"), ("deepseek", "thinking")],
    # Kompleks & deep (penjelasan mendalam soal sulit / evaluasi mendalam): Grok utama!
    "deep":   [("grok", None), ("deepseek", "thinking"), ("qwen", "thinking")],
    # Catatan materi detail: Grok utama untuk analisis materi mendalam
    "detail": [("grok", None), ("deepseek", "thinking"), ("qwen", "thinking")],
    # Sesi chat per dokumen: DeepSeek sebagai model utama, fallback Qwen auto
    "chat":   [("deepseek", None), ("qwen", "auto")],
    # Visi / Unggah gambar & berkas: DeepSeek utama (menggantikan Qwen)
    "vision": [("deepseek", "instant"), ("deepseek", None)],
    # Analisis lampiran gambar/file yang kompleks & mendalam: Grok utama
    "vision_deep": [("grok", None), ("deepseek", "thinking")],
}

# Semaphore per-backend: DeepSeek (stream, sesi panjang untuk game/chat) dipisah dari
# Qwen/Grok (pemrosesan dokumen) supaya satu giliran game tidak menahan pemrosesan materi.
_sems = {
    "deepseek": threading.Semaphore(config.LLM_CONCURRENCY_STREAM),
    "qwen": threading.Semaphore(config.LLM_CONCURRENCY),
    "grok": threading.Semaphore(config.LLM_CONCURRENCY),
}

# Telemetri latensi (untuk gerbang go/no-go Fase 2): detik sampai chunk pertama dan total.
_latency: deque = deque(maxlen=300)


def _sleep_backoff(attempt: int) -> None:
    time.sleep(min(30.0, config.LLM_BACKOFF_BASE * (2 ** attempt)))


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, int(round((pct / 100) * (len(ordered) - 1)))))
    return round(ordered[k], 2)


def latency_stats() -> dict:
    first = [x["first"] for x in _latency if x["first"] is not None]
    total = [x["total"] for x in _latency]
    return {"n": len(total), "first_p50": _percentile(first, 50), "first_p95": _percentile(first, 95),
            "total_p50": _percentile(total, 50), "total_p95": _percentile(total, 95)}


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.PAF_API_TOKEN}"}


def _detail(resp: requests.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except Exception:
        detail = None
    return str(detail or resp.text[:200] or f"HTTP {resp.status_code}")


def delete_session(session_id: str | None) -> None:
    if not session_id:
        return
    try:
        requests.delete(f"{config.PAF_BASE_URL}/v1/sessions/{session_id}",
                        headers=_headers(), timeout=10)
    except requests.RequestException:
        pass


def _delete_session(session_id: str) -> None:
    delete_session(session_id)


def _status_error(resp: requests.Response, backend: str) -> LLMError:
    """Petakan status HTTP non-200 ke LLMError (fatal / retryable / coba backend lain)."""
    detail, code = _detail(resp), resp.status_code
    if code == 401 and resp.headers.get("WWW-Authenticate"):
        return LLMError("API token PAF-Model salah atau sudah kedaluwarsa", code, fatal=True)
    if code == 503:
        return LLMError("Gateway PAF-Model belum memiliki API token: " + detail, code, fatal=True)
    if code in (400, 422):
        return LLMError("Request ditolak gateway: " + detail, code, fatal=True)
    if code in (429, 500, 502, 504):
        return LLMError(f"{backend}: {detail}", code, retryable=True)
    # 401 tanpa WWW-Authenticate = akun backend belum login, 404 dst.: coba backend lain
    return LLMError(f"{backend}: {detail}", code)


def _read_stream(resp: requests.Response, on_chunk, t0: float) -> LLMResponse:
    accumulated: list[str] = []
    meta: dict = {}
    full_text: str | None = None
    session_id = resp.headers.get("X-Session-ID")
    first: float | None = None
    try:
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            line = line.strip()
            if line.startswith(":"):          # komentar SSE (ping)
                continue
            if line == "data: [DONE]":
                break
            if not line.startswith("data: "):
                continue
            try:
                obj = json.loads(line[6:].strip())
            except ValueError:
                continue
            if isinstance(obj, dict) and "error" in obj:
                err = obj["error"]
                detail = err.get("message") if isinstance(err, dict) else str(err)
                raise LLMError(f"Streaming error dari model: {detail or err}", retryable=True)
            m = obj.get("x_meta") or {}
            if isinstance(m, dict):
                meta.update({k: v for k, v in m.items() if k != "full_text"})
                if m.get("session_id"):
                    session_id = m["session_id"]
                if m.get("full_text"):
                    full_text = m["full_text"]
            choices = obj.get("choices") or []
            if choices:
                piece = (choices[0].get("delta") or {}).get("content") or ""
                if piece:
                    if first is None:
                        first = time.time() - t0
                    accumulated.append(piece)
                    if on_chunk:
                        try:
                            on_chunk(piece)
                        except Exception:
                            pass
    except LLMError:
        raise
    except requests.RequestException as exc:
        raise LLMError(f"Gagal membaca stream ({exc.__class__.__name__})", retryable=True)
    except Exception as exc:
        raise LLMError(f"Gagal membaca potongan stream: {exc}", retryable=True)
    # Teks final paling akurat ada di x_meta.full_text; chunk tengah bisa terlewat.
    text = (full_text or "".join(accumulated)).strip()
    if not text:
        raise LLMError("Balasan kosong dari model", retryable=True)
    return LLMResponse(text, session_id, meta, first_chunk_s=first)


def _post_once(body: dict, *, backend: str, stream: bool = False, session_id: str | None = None,
               on_chunk: Callable[[str], None] | None = None,
               tools: list | None = None, tool_choice: str | None = None) -> LLMResponse:
    """Satu permintaan HTTP ke gateway (tanpa retry). Satu-satunya tempat requests.post dipanggil."""
    headers = _headers()
    if session_id:
        headers["X-Session-ID"] = session_id
        body["session_id"] = session_id
    if tools is not None:
        body["tools"] = tools
    if tool_choice is not None:
        body["tool_choice"] = tool_choice
    else:
        body.pop("tool_choice", None)
    t0 = time.time()
    with _sems.get(backend, _sems["qwen"]):
        try:
            resp = requests.post(f"{config.PAF_BASE_URL}/v1/chat/completions", json=body,
                                 headers=headers, timeout=config.PAF_TIMEOUT, stream=stream)
        except requests.Timeout:
            raise LLMError("Gateway PAF-Model tidak membalas tepat waktu", retryable=True)
        except requests.RequestException as exc:
            raise LLMError(f"Tidak dapat menghubungi PAF-Model ({exc.__class__.__name__})", retryable=True)

        if resp.status_code != 200:
            raise _status_error(resp, backend)

        sid_header = resp.headers.get("X-Session-ID") or session_id
        if stream and "text/event-stream" in resp.headers.get("Content-Type", ""):
            out = _read_stream(resp, on_chunk, t0)
            out.session_id = out.session_id or sid_header
        else:
            try:
                data = resp.json()
                msg = data["choices"][0]["message"]
                text = (msg.get("content") or "").strip()
                tool_calls = msg.get("tool_calls")
            except (ValueError, KeyError, IndexError, TypeError):
                raise LLMError("Balasan gateway tidak dikenali", retryable=True)
            if not text and not tool_calls:
                raise LLMError("Balasan kosong dari model", retryable=True)
            meta = data.get("x_meta") if isinstance(data.get("x_meta"), dict) else {}
            out = LLMResponse(text, (meta.get("session_id") or sid_header), dict(meta), tool_calls=tool_calls)
            if on_chunk and text:
                try:
                    on_chunk(text)
                except Exception:
                    pass
    out.total_s = round(time.time() - t0, 2)
    _latency.append({"first": out.first_chunk_s, "total": out.total_s, "backend": backend})
    return out


_post = _post_once


def _resolve_plan(level: str = "normal", attachments: list | None = None) -> list[tuple[str, str | None]]:
    """Tentukan urutan (backend, think_mode) berdasarkan level dan lampiran.

    Aturan:
    1. Bila ada lampiran (gambar/file):
       - Qwen dinonaktifkan sementara oleh upstream gateway (HTTP 400).
       - Untuk tugas kompleks & deep ('deep', 'detail', 'vision_deep'): gunakan Grok (atau DeepSeek thinking).
       - Untuk tugas umum/visi/OCR: gunakan DeepSeek.
    2. Bila tanpa lampiran:
       - Grok HANYA digunakan untuk tugas kompleks & deep ('deep', 'detail').
       - Tugas umum ('normal', 'fast', 'reason'): Qwen utama, fallback DeepSeek.
    """
    if attachments:
        if level in ("deep", "detail", "vision_deep"):
            plan = PLANS.get("vision_deep", [("grok", None), ("deepseek", "thinking")])
        else:
            plan = PLANS.get("vision", [("deepseek", "instant"), ("deepseek", None)])
    else:
        plan = PLANS.get(level, PLANS["normal"])

    if not config.LLM_FALLBACK:
        return plan[:1]
    return plan


def _call_response(backend: str, think: str | None, prompt: str, attachments=None,
                   tools: list | None = None, tool_choice: str | None = None) -> LLMResponse:
    if backend == "qwen" and attachments:
        raise LLMError("Lampiran gambar/file tidak didukung oleh backend Qwen upstream", status=400, retryable=False)
    body: dict = {"model": backend, "messages": [{"role": "user", "content": prompt}]}
    if backend in ("qwen", "deepseek") and think:
        body["think_mode"] = think
    if attachments:
        body["attachments"] = attachments
    if tools is not None:
        body["tools"] = tools
    if tool_choice is not None:
        body["tool_choice"] = tool_choice
    else:
        body.pop("tool_choice", None)
    out = _post_once(body, backend=backend, tools=tools, tool_choice=tool_choice)
    if out.session_id:
        _delete_session(out.session_id)       # sesi sekali pakai: bebaskan agar tidak menumpuk
    return out


def _call(backend: str, think: str | None, prompt: str, attachments=None) -> str:
    return _call_response(backend, think, prompt, attachments).text


def ask(prompt: str, level: str = "normal", attachments=None) -> str:
    """Kirim satu prompt mandiri dan kembalikan teks balasan."""
    plan = _resolve_plan(level, attachments)
    last: LLMError | None = None
    for backend, think in plan:
        for attempt in range(config.LLM_RETRIES + 1):
            try:
                return _call(backend, think, prompt, attachments)
            except LLMError as exc:
                last = exc
                log.warning("LLM %s gagal (percobaan %d): %s", backend, attempt + 1, exc)
                if exc.fatal:
                    raise
                if exc.retryable and attempt < config.LLM_RETRIES:
                    _sleep_backoff(attempt)
                    continue
                break
    raise last or LLMError("Gagal menghubungi model")


STREAM_UNSUPPORTED = ("Worker gateway belum dijalankan dengan --enable-stream. "
                      "Mulai ulang worker dengan flag tersebut lalu coba lagi.")


def chat_stream(
    prompt: str,
    gateway_session_id: str | None = None,
    mode: str = "new",
    on_chunk: Callable[[str], None] | None = None,
    think_mode: str | None = None,
    allow_nonstream: bool = False,
) -> LLMResponse:
    """DeepSeek dengan sesi persisten (NEW / CONTINUE) dan stream SSE; mengembalikan LLMResponse.

    Bila gateway menolak stream (400) dan allow_nonstream=False (jalur game, D6), kesalahan
    dilaporkan dengan jelas alih-alih jatuh diam-diam ke mode non-stream.
    Sesi gateway TIDAK dihapus otomatis: pemanggil bertanggung jawab (delete_session).
    """
    body: dict = {"model": "deepseek", "messages": [{"role": "user", "content": prompt}],
                  "mode": mode, "stream": True}
    if think_mode:
        body["think_mode"] = think_mode
    last: LLMError | None = None
    for attempt in range(config.LLM_RETRIES + 1):
        try:
            return _post_once(dict(body), backend="deepseek", stream=True,
                              session_id=gateway_session_id, on_chunk=on_chunk)
        except LLMError as exc:
            last = exc
            if exc.status == 400 and "stream" in str(exc).lower():
                if allow_nonstream:
                    log.info("Mode stream tidak didukung worker. Fallback non-stream.")
                    return _chat_nonstream(prompt, gateway_session_id, mode, on_chunk, think_mode)
                raise LLMError(STREAM_UNSUPPORTED, 400, fatal=True)
            if exc.fatal or not exc.retryable or attempt >= config.LLM_RETRIES:
                raise
            _sleep_backoff(attempt)
    raise last or LLMError("Gagal menghubungi DeepSeek")


def _chat_nonstream(prompt, gateway_session_id, mode, on_chunk, think_mode) -> LLMResponse:
    body: dict = {"model": "deepseek", "messages": [{"role": "user", "content": prompt}], "mode": mode}
    if think_mode:
        body["think_mode"] = think_mode
    last: LLMError | None = None
    for attempt in range(config.LLM_RETRIES + 1):
        try:
            return _post_once(dict(body), backend="deepseek", stream=False,
                              session_id=gateway_session_id, on_chunk=on_chunk)
        except LLMError as exc:
            last = exc
            if exc.fatal or not exc.retryable or attempt >= config.LLM_RETRIES:
                raise
            _sleep_backoff(attempt)
    raise last or LLMError("Gagal menghubungi DeepSeek")


def chat_call(
    prompt: str,
    gateway_session_id: str | None = None,
    mode: str = "new",
    stream: bool = True,
    on_chunk: Callable[[str], None] | None = None,
) -> tuple[str, str | None]:
    """Jalur chat/Panel Tanya (perilaku lama): (teks, gateway_session_id).

    mode="new" menginjeksi konteks; mode="continue" melanjutkan sesi. Bila worker menolak
    stream, jatuh ke non-stream. Kejadian mode_fallback dicatat ke log.
    """
    if stream:
        out = chat_stream(prompt, gateway_session_id, mode, on_chunk, allow_nonstream=True)
    else:
        out = _chat_nonstream(prompt, gateway_session_id, mode, on_chunk, None)
    if out.mode_fallback:
        log.warning("Gateway melaporkan mode_fallback (sesi %s hilang); konteks mungkin tidak ada.",
                    gateway_session_id)
    return out.text, out.session_id


# ---- JSON ----
# Perintah LaTeX yang diawali b/f/n/r/t bentrok dengan escape JSON (\b \f \n \r \t),
# mis. \frac akan terbaca sebagai form-feed + "rac". Lindungi sebelum parsing.
_LATEX_CMD = re.compile(
    r"(?<!\\)\\(?=(?:beta|bar|begin|binom|bf|boldsymbol|frac|forall|footnote|nu|neq|ne|nabla|not|notin|"
    r"rho|right|rightarrow|Rightarrow|rm|tau|theta|text|textbf|times|to|tilde|top|tan)(?![a-zA-Z]))")


def _repair(text: str) -> str:
    text = _LATEX_CMD.sub(r"\\\\", text)
    return re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)  # backslash lain yang tidak valid


def _loads(text: str):
    protected = _LATEX_CMD.sub(r"\\\\", text)
    try:
        return json.loads(protected)
    except ValueError:
        return json.loads(_repair(text))


def extract_json(text: str):
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, flags=re.S | re.I)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return _loads(cleaned)
    except ValueError:
        pass
    decoder = json.JSONDecoder()
    tried = 0
    for match in re.finditer(r"[\[{]", cleaned):
        tried += 1
        if tried > 40:
            break
        snippet = cleaned[match.start():]
        for candidate in (_LATEX_CMD.sub(r"\\\\", snippet), _repair(snippet)):
            try:
                obj, _ = decoder.raw_decode(candidate)
            except ValueError:
                continue
            if isinstance(obj, (dict, list)):
                return obj
    raise ValueError("JSON tidak ditemukan dalam jawaban")


def chat_json(prompt: str, level: str = "normal", validate=None, attachments=None,
              tries: int = 3):
    """Minta JSON; ulangi dengan catatan perbaikan bila format rusak."""
    current = prompt
    last_error: Exception | None = None
    last_raw: str | None = None
    for _ in range(tries):
        out = ask(current, level, attachments)
        last_raw = out
        try:
            obj = extract_json(out)
            return validate(obj) if validate else obj
        except ValueError as exc:
            last_error = exc
            current = (prompt + "\n\nCATATAN: jawaban sebelumnya tidak valid ("
                       + str(exc)[:120] + "). Kirim ulang HANYA JSON valid sesuai format, "
                       "tanpa teks lain dan tanpa blok kode.")
    raise LLMError(f"Format jawaban AI tidak valid: {last_error}", raw_text=last_raw)


def _fallback_tool_to_json(
    prompt: str,
    tool_spec: dict,
    level: str = "normal",
    attachments: list | None = None,
    tries: int = 2,
    validate: Callable | None = None,
) -> dict:
    """Fallback ke chat_json jika model/worker menolak tools (HTTP 400)."""
    params = tool_spec.get("parameters", {})
    desc = tool_spec.get("description", "")
    spec_str = json.dumps(params, ensure_ascii=False, indent=2)
    extra = (
        f"\n\nPENTING: Hasilkan balasan HANYA sebagai JSON valid yang memenuhi skema parameter fungsi '{tool_spec.get('name', 'output')}':\n"
        f"{spec_str}\n"
    )
    if desc:
        extra += f"Deskripsi fungsi: {desc}\n"
    extra += "Kirim HANYA JSON murni tanpa teks pengantar atau blok markdown di luar JSON."
    return chat_json(prompt + extra, level=level, validate=validate, attachments=attachments, tries=tries)


def ask_tool(
    prompt: str,
    tool_spec: dict,
    level: str = "normal",
    attachments: list | None = None,
    tries: int = 2,
    validate: Callable | None = None,
) -> dict:
    """Kirim permintaan menggunakan OpenAI Tool Calling (tools) dan kembalikan arguments yang diurai.

    Parameter:
    - prompt: Teks instruksi untuk model.
    - tool_spec: Definisi function OpenAI ({"name": ..., "description": ..., "parameters": {...}}).
    - level: Profil inferensi ('normal', 'reason', 'fast', dsb.).
    - attachments: Berkas atau gambar pelengkap.
    - tries: Jumlah percobaan bila terjadi kegagalan retryable atau parse error.
    - validate: Fungsi validasi opsional untuk memvalidasi/memperbaiki hasil parsing.

    Bila worker mengembalikan HTTP 400 (tidak mendukung tools), fungsi ini otomatis
    fallback ke chat_json berbasis skema JSON parameter.
    """
    if not tool_spec or not isinstance(tool_spec, dict) or not tool_spec.get("name"):
        raise ValueError("tool_spec harus berupa dictionary dengan kunci 'name'")

    tools = [{"type": "function", "function": tool_spec}]
    tool_choice = "auto"

    # Gateway PAF-Model hanya mendukung function calling (tools) pada backend DeepSeek.
    # Backend Qwen melempar HTTP 500 (name 'QWEN_CONFIG' is not defined) bila dikirimkan tools.
    plan = [("deepseek", "instant"), ("deepseek", None)]
    if not config.LLM_FALLBACK:
        plan = plan[:1]

    last_exc: Exception | None = None
    max_attempts = max(1, tries)

    for backend, think in plan:
        for attempt in range(max_attempts):
            try:
                resp = _call_response(
                    backend,
                    think,
                    prompt,
                    attachments,
                    tools=tools,
                    tool_choice=tool_choice,
                )

                if resp.tool_calls:
                    tc = resp.tool_calls[0]
                    fn = tc.get("function") if isinstance(tc, dict) else getattr(tc, "function", {})
                    raw_args = fn.get("arguments", "{}") if isinstance(fn, dict) else getattr(fn, "arguments", "{}")
                    if isinstance(raw_args, (dict, list)):
                        data = raw_args
                    elif isinstance(raw_args, str):
                        data = _loads(raw_args)
                    else:
                        raise ValueError(f"Tipe arguments tool_calls tidak valid: {type(raw_args)}")

                    if validate:
                        data = validate(data)
                    return data

                # Jika model tidak mengisi tool_calls tapi membalas teks JSON
                if resp.text:
                    try:
                        extracted = extract_json(resp.text)
                        if validate:
                            extracted = validate(extracted)
                        return extracted
                    except Exception:
                        pass

                raise LLMError(f"{backend}: Model tidak memanggil tool '{tool_spec.get('name')}'", retryable=True, raw_text=resp.text)

            except LLMError as exc:
                last_exc = exc
                if exc.status in (400, 422):
                    log.warning("Tool calling ditolak gateway/worker (HTTP %d: %s). Fallback ke chat_json.", exc.status, exc)
                    return _fallback_tool_to_json(prompt, tool_spec, level, attachments, tries, validate)
                log.warning("ask_tool %s gagal (percobaan %d): %s", backend, attempt + 1, exc)
                if exc.fatal:
                    raise
                if exc.retryable and attempt < max_attempts - 1:
                    _sleep_backoff(attempt)
                    continue
                break
            except Exception as exc:
                last_exc = exc
                log.warning("ask_tool gagal memproses balasan (percobaan %d): %s", attempt + 1, exc)
                if attempt < max_attempts - 1:
                    _sleep_backoff(attempt)
                    continue
                break

    raise last_exc or LLMError("Gagal memperoleh balasan tool dari model")


def ask_structured(
    prompt: str,
    tool_spec: dict,
    level: str = "normal",
    attachments: list | None = None,
    tries: int = 2,
    validate: Callable | None = None,
) -> dict:
    """Helper terpadu untuk inferensi terstruktur (schema-driven).

    Logika:
    - Memeriksa rencana backend untuk `level` dan `attachments`.
    - Jika target backend utama adalah 'deepseek': panggil ask_tool (karena DeepSeek native
      mendukung tools di PAF-Model).
    - Jika target backend adalah 'qwen' atau 'grok' (atau jika worker menolak tools):
      gunakan _fallback_tool_to_json.
    - Pemanggil selalu mendapatkan output dictionary terstruktur tanpa perlu tahu model apa yang memprosesnya.
    """
    plan = _resolve_plan(level, attachments)
    primary_backend = plan[0][0] if plan else "qwen"

    if primary_backend == "deepseek":
        try:
            return ask_tool(prompt, tool_spec, level=level, attachments=attachments, tries=tries, validate=validate)
        except LLMError as exc:
            if exc.fatal:
                raise
            log.warning("ask_tool DeepSeek gagal (%s: %s). Mencoba fallback JSON.", type(exc).__name__, exc)
            return _fallback_tool_to_json(prompt, tool_spec, level=level, attachments=attachments, tries=tries, validate=validate)
    else:
        return _fallback_tool_to_json(prompt, tool_spec, level=level, attachments=attachments, tries=tries, validate=validate)


def probe_stream() -> dict:
    """Permintaan kecil ke DeepSeek untuk memastikan worker berjalan dengan --enable-stream."""
    got: list[str] = []
    sid = None
    try:
        out = chat_stream("Balas dengan satu kata: siap.", None, "new", on_chunk=got.append,
                          think_mode="instant")
        sid = out.session_id
        return {"stream_ok": True, "first_chunk_s": out.first_chunk_s, "total_s": out.total_s}
    except LLMError as exc:
        return {"stream_ok": False, "error": str(exc)}
    finally:
        delete_session(sid)


def health(probe: bool = False) -> dict:
    """Cek koneksi ke gateway dan daftar model yang tersedia."""
    try:
        resp = requests.get(f"{config.PAF_BASE_URL}/v1/models", headers=_headers(), timeout=8)
    except requests.RequestException as exc:
        return {"ok": False, "error": f"Tidak dapat terhubung ({exc.__class__.__name__})"}
    if resp.status_code != 200:
        return {"ok": False, "error": _detail(resp), "status": resp.status_code}
    try:
        models = [m.get("id") for m in resp.json().get("data", [])]
    except ValueError:
        models = []
    out = {"ok": True, "models": models, "latency": latency_stats()}
    if probe:
        out.update(probe_stream())
    return out
