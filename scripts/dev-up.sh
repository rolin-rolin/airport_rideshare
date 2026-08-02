#!/usr/bin/env bash
# Starts local Supabase + the Next dev server, then mints a magic-link OTP
# and prints the URL to open to be logged in. Pass an email as $1
# (defaults below); must match ALLOWED_EMAIL_DOMAIN (nd.edu).
set -euo pipefail
cd "$(dirname "$0")/.."

RUNTIME_DIR=".dev-runtime"
PID_FILE="$RUNTIME_DIR/next.pid"
LOG_FILE="$RUNTIME_DIR/next.log"
EMAIL="${1:-testuser1@nd.edu}"

mkdir -p "$RUNTIME_DIR"

echo "==> Starting local Supabase..."
supabase start

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "==> Dev server already running (pid $(cat "$PID_FILE"))"
else
  echo "==> Starting Next dev server..."
  nohup npm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown
fi

echo "==> Waiting for http://localhost:3000 ..."
for _ in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000; then
    break
  fi
  sleep 1
done

if ! curl -s -o /dev/null http://localhost:3000; then
  echo "Dev server did not come up in time — check $LOG_FILE" >&2
  exit 1
fi

echo "==> Minting magic-link OTP for $EMAIL ..."
node scripts/dev-magic-link.mjs "$EMAIL"
