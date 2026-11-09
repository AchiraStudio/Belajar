#!/usr/bin/env bash
# Menjalankan seluruh tumpukan lokal: PAF tiruan + server Node + agent Python, lalu tests/e2e.js
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Interpreter Python: PY dari environment, jika tidak python3 / python / py (python3 di Windows
# sering hanya stub Microsoft Store, jadi setiap kandidat diuji dulu).
if [ -z "${PY:-}" ]; then
  for cand in "$ROOT/.venv/Scripts/python.exe" "$ROOT/.venv/bin/python" python3 python py; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import sys" >/dev/null 2>&1; then PY="$cand"; break; fi
  done
fi
PY="${PY:-python3}"
# Layout agent: folder agent/ bila ada, jika tidak file agent.py ada di root repo
AGENT_DIR="$ROOT/agent"; [ -d "$AGENT_DIR" ] || AGENT_DIR="$ROOT"
TMP="$(mktemp -d)"
PORT_PAF=9177; PORT_APP=3055
export APP_PASSWORD="kata-sandi-uji-123" SESSION_SECRET="rahasia-sesi-uji-0123456789" BRIDGE_TOKEN="bridge-token-uji-0123456789"
export PORT=$PORT_APP HOST=127.0.0.1 MAX_UPLOAD_MB=40 SSE_PING_MS=250
export MOCK_GM_DELAY=0.06
export DATA_DIR="$TMP/data" FIXTURES="$TMP/fx" BASE="http://127.0.0.1:$PORT_APP"
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; wait 2>/dev/null; }
trap cleanup EXIT

$PY "$ROOT/tests/make_fixtures.py" "$FIXTURES" >/dev/null || exit 1
$PY "$ROOT/tests/mock_paf.py" $PORT_PAF >"$TMP/paf.log" 2>&1 & pids+=($!)
(cd "$ROOT/server" && exec node server.js >"$TMP/server.log" 2>&1) & pids+=($!)
sleep 1.5
(cd "$AGENT_DIR" && BRIDGE_URL="ws://127.0.0.1:$PORT_APP/bridge" PAF_BASE_URL="http://127.0.0.1:$PORT_PAF" \
  PAF_API_TOKEN="paf_testtoken_1234567890" LLM_BACKOFF_BASE=0.05 CHUNK_CHARS=1500 exec $PY agent.py >"$TMP/agent.log" 2>&1) & AGENT_PID=$!; pids+=($AGENT_PID)
sleep 2.5
start_agent() {
  (cd "$AGENT_DIR" && BRIDGE_URL="ws://127.0.0.1:$PORT_APP/bridge" PAF_BASE_URL="http://127.0.0.1:$PORT_PAF" \
    PAF_API_TOKEN="paf_testtoken_1234567890" LLM_BACKOFF_BASE=0.05 CHUNK_CHARS=1500 exec $PY agent.py >>"$TMP/agent.log" 2>&1) & AGENT_PID=$!; pids+=($AGENT_PID)
}

NODE_PATH="${NODE_PATH:-}" node "$ROOT/tests/e2e.js"
code=$?
if [ $code -eq 0 ]; then
  echo "== Game v2 (SSE nyata)"
  export PLAY_DOC=$(cd "$ROOT" && $PY tests/seed_play.py | tail -1)
  node "$ROOT/tests/e2e_play.js" || code=1
fi
if [ $code -eq 0 ]; then
  echo "== PC mati lalu menyala lagi"
  kill $AGENT_PID; wait $AGENT_PID 2>/dev/null; sleep 1
  node "$ROOT/tests/offline.js" down || code=1
  start_agent
  node "$ROOT/tests/offline.js" up || code=1
fi
if [ $code -ne 0 ]; then
  echo "--- server.log"; tail -15 "$TMP/server.log"; echo "--- agent.log"; tail -25 "$TMP/agent.log"
fi
exit $code
