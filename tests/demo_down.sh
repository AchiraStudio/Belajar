#!/usr/bin/env bash
D=/tmp/claude-0/demo
[ -f "$D/pids" ] && while read -r p; do kill "$p" 2>/dev/null; done <"$D/pids"; rm -f "$D/pids"; exit 0
