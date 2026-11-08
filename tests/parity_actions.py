"""Uji paritas: setiap handler agent harus ada di daftar ACTIONS server.js, dan sebaliknya.

Tanpa ini, handler baru yang lupa didaftarkan di server.js akan ditolak 404 secara diam-diam.
`upload_document` sengaja hanya ada di agent (jalurnya POST /api/upload, bukan RPC).
"""
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.update({"DATA_DIR": tempfile.mkdtemp(prefix="belajar-parity-"), "BRIDGE_URL": "ws://x/bridge",
                   "BRIDGE_TOKEN": "t" * 20, "PAF_API_TOKEN": "x", "PAF_BASE_URL": "http://127.0.0.1:9"})

AGENT_ONLY = {"upload_document"}

import handlers  # noqa: E402

js = (ROOT / "server" / "server.js").read_text(encoding="utf-8")
block = re.search(r"const ACTIONS = new Set\(\[(.*?)\]\);", js, re.S)
if not block:
    raise SystemExit("GAGAL: blok ACTIONS tidak ditemukan di server/server.js")
actions = set(re.findall(r"'([a-z_0-9]+)'", re.sub(r"//.*", "", block.group(1))))
agent = set(handlers.HANDLERS)

missing_in_server = sorted(agent - actions - AGENT_ONLY)
missing_in_agent = sorted(actions - agent)
if missing_in_server or missing_in_agent:
    if missing_in_server:
        print("Handler agent belum ada di ACTIONS server.js:", ", ".join(missing_in_server))
    if missing_in_agent:
        print("ACTIONS server.js tanpa handler di agent:", ", ".join(missing_in_agent))
    raise SystemExit(1)
print(f"Paritas OK: {len(actions)} action server = {len(agent) - len(AGENT_ONLY & agent)} handler agent.")


# Titik masuk nyata harus bisa diimpor SENDIRIAN di interpreter baru (agent.py mengimpor play_engine sebelum handlers).
# concepts/cards sengaja tidak diuji sendirian: keduanya dimuat oleh handlers (aturan: handlers dimuat paling dulu).
import subprocess  # noqa: E402

for mod in ("play_engine", "play_director", "play", "profile", "play_games", "play_protocol", "detect", "sanitize", "pipeline", "handlers", "agent"):
    r = subprocess.run([sys.executable, "-c", f"import {mod}"], cwd=ROOT, env=os.environ, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"GAGAL: 'import {mod}' sendirian error:\n{r.stderr[-600:]}")
print("Impor mandiri OK untuk semua modul.")
