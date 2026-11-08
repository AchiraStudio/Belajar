"""Agent lokal: menghubungi VPS lewat WebSocket (koneksi keluar) dan menjalankan semua
operasi yang menyentuh data lokal (SQLite, file, pemanggilan PAF-Model).

Jalankan:  python agent.py
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from logging.handlers import RotatingFileHandler
from urllib.parse import quote, urlsplit

import websockets

import config
import ssl
import certifi

SSL_CTX = ssl.create_default_context(cafile=certifi.where())

config.DATA_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler(config.DATA_DIR / "agent.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"),
    ],
)
log = logging.getLogger("agent")

import db  # noqa: E402
import jobs  # noqa: E402
import play_engine  # noqa: E402
from common import UserError  # noqa: E402
from handlers import HANDLERS  # noqa: E402


def _bridge_uri() -> str:
    sep = "&" if "?" in config.BRIDGE_URL else "?"
    return f"{config.BRIDGE_URL}{sep}token={quote(config.BRIDGE_TOKEN)}"


def _safe_target() -> str:
    parts = urlsplit(config.BRIDGE_URL)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"


async def process_message(raw, loop, send_queue=None) -> str:
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return json.dumps({"ok": False, "error": "JSON tidak valid", "req_id": ""})
    req_id = payload.get("req_id", "")
    action = payload.get("action", "")
    handler = HANDLERS.get(action)
    if not handler:
        return json.dumps({"ok": False, "error": f"Action '{action}' tidak dikenal", "req_id": req_id})
    try:
        if payload.get("stream") and send_queue is not None:
            def emit(data: dict):
                chunk_msg = json.dumps({"req_id": req_id, "type": "chunk", "data": data}, ensure_ascii=False)
                loop.call_soon_threadsafe(send_queue.put_nowait, chunk_msg)

            payload["_on_chunk"] = lambda chunk_text: emit({"chunk": chunk_text})
            payload["_emit"] = emit      # event bebas ({"chunk"|"stage": ...}); dipakai game

        # handler memakai SQLite/berkas: jalankan di thread agar event loop (ping/pong) tetap hidup
        data = await loop.run_in_executor(None, handler, payload)
        return json.dumps({"ok": True, "data": data, "req_id": req_id}, ensure_ascii=False)
    except UserError as exc:
        return json.dumps({"ok": False, "error": str(exc), "req_id": req_id}, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        log.exception("Error di handler '%s'", action)
        return json.dumps({"ok": False, "error": "Kesalahan internal di agent (lihat agent.log)",
                           "req_id": req_id}, ensure_ascii=False)


async def serve_connection(ws) -> None:
    loop = asyncio.get_running_loop()
    tasks: set = set()
    send_queue: asyncio.Queue[str] = asyncio.Queue()

    async def sender():
        while True:
            msg = await send_queue.get()
            try:
                await ws.send(msg)
            except Exception as exc:
                log.warning("Gagal mengirim balasan ke bridge: %s", exc)
            finally:
                send_queue.task_done()

    sender_task = asyncio.create_task(sender())

    async def handle(raw):
        response = await process_message(raw, loop, send_queue)
        await send_queue.put(response)

    try:
        async for raw in ws:
            task = asyncio.create_task(handle(raw))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        sender_task.cancel()
        for task in tasks:
            task.cancel()


async def backup_loop() -> None:
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, db.backup)
        except Exception:  # noqa: BLE001
            log.exception("Backup gagal")
        await asyncio.sleep(6 * 3600)


async def connect_and_serve() -> None:
    delay = config.RECONNECT_DELAY
    log.info("Agent siap. Bridge: %s | PAF-Model: %s", _safe_target(), config.PAF_BASE_URL)
    while True:
        try:
            log.info("Menghubungkan ke VPS ...")
            async with websockets.connect(
                _bridge_uri(), ssl=SSL_CTX, ping_interval=20, ping_timeout=20, open_timeout=15,
                max_size=None, close_timeout=5,
            ) as ws:
                log.info("Terhubung ke VPS.")
                delay = config.RECONNECT_DELAY
                await serve_connection(ws)
            log.info("Koneksi ditutup oleh server.")
        except asyncio.CancelledError:
            raise
        except websockets.exceptions.ConnectionClosed as exc:
            code = getattr(getattr(exc, "rcvd", None), "code", None)
            if code == 4000:
                # VPS menutup karena ada agent lain yang terhubung (mis. agent.py terbuka dua kali)
                log.error("Agent lain sudah terhubung ke VPS. Tutup salah satunya agar tidak saling memutus.")
                delay = max(delay, 60)
            else:
                log.warning("Koneksi putus: %s", exc)
        except Exception as exc:  # noqa: BLE001
            log.warning("Koneksi gagal/putus: %s", exc.__class__.__name__ + (f": {exc}" if str(exc) else ""))
        log.info("Menyambung ulang dalam %ss ...", delay)
        await asyncio.sleep(delay)
        delay = min(delay * 2, config.RECONNECT_MAX)


async def main() -> None:
    missing = config.missing_required()
    if missing:
        log.error("Konfigurasi belum lengkap: %s. Salin .env.example menjadi .env lalu isi.", ", ".join(missing))
        sys.exit(2)
    db.init()
    jobs.recover()
    play_engine.recover()
    await asyncio.gather(connect_and_serve(), backup_loop())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAgent dihentikan.")
