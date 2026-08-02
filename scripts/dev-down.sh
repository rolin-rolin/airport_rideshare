#!/usr/bin/env bash
# Stops the Next dev server and local Supabase, cleanly, so the next
# dev-up.sh starts from a fresh state.
set -uo pipefail
cd "$(dirname "$0")/.."

RUNTIME_DIR=".dev-runtime"
PID_FILE="$RUNTIME_DIR/next.pid"

echo "==> Stopping Next dev server..."
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  # next dev spawns a next-server child; kill both, TERM first so
  # turbopack's persistent cache gets a chance to close cleanly
  # (an abrupt kill is what corrupted the cache last time).
  pkill -TERM -P "$PID" 2>/dev/null || true
  kill -TERM "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
# fallback in case the pidfile was stale or missing
pkill -TERM -f "node_modules/.bin/next dev" 2>/dev/null || true
pkill -TERM -f "next-server" 2>/dev/null || true

sleep 2

# force-kill anything still holding port 3000
PORT_PIDS=$(lsof -ti tcp:3000 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
  echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
fi

echo "==> Stopping local Supabase..."
supabase stop

echo "==> Done."
