#!/usr/bin/env bash
# Menjalankan tumpukan demo (PAF tiruan + server + agent) di latar belakang dengan data contoh.
# Pemakaian: PY=... bash tests/demo_up.sh   |   berhenti: bash tests/demo_down.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PY="${PY:-python3}"
D=/tmp/claude-0/demo; bash "$ROOT/tests/demo_down.sh" 2>/dev/null; rm -rf "$D"; mkdir -p "$D"
export APP_PASSWORD="demo-password-123" SESSION_SECRET="rahasia-demo-0123456789" BRIDGE_TOKEN="bridge-demo-0123456789"
export PORT=3060 HOST=127.0.0.1 DATA_DIR="$D/data"
$PY "$ROOT/tests/make_fixtures.py" "$D/fx" >/dev/null
nohup $PY "$ROOT/tests/mock_paf.py" 9190 >"$D/paf.log" 2>&1 & echo $! >>"$D/pids"
(cd "$ROOT/server" && nohup node server.js >"$D/server.log" 2>&1 & echo $! >>"$D/pids")
sleep 1.5
(cd "$ROOT" && BRIDGE_URL=ws://127.0.0.1:3060/bridge PAF_BASE_URL=http://127.0.0.1:9190 PAF_API_TOKEN=paf_testtoken_1234567890 \
  LLM_BACKOFF_BASE=0.05 CHUNK_CHARS=1500 nohup $PY agent.py >"$D/agent.log" 2>&1 & echo $! >>"$D/pids")
sleep 2.5
$PY "$ROOT/tests/demo_seed.py" "$D" && echo "DEMO SIAP di http://127.0.0.1:3060 (password: demo-password-123)"
