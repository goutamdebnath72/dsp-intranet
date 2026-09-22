#!/bin/bash
# scripts/dev-with-tunnel.sh
#
# Starts the ngrok tunnel and the Next.js dev server together with one
# command, and makes sure ngrok gets killed automatically when the dev
# server stops (Ctrl+C) -- so you never end up with an orphaned tunnel
# still running in the background after you're done.
#
# Usage: npm run dev:tunnel

set -e

NGROK_URL="https://gala-giggly-backlands.ngrok-free.dev"
NGROK_LOG="/tmp/ngrok-dev.log"

echo "Starting ngrok tunnel ($NGROK_URL -> localhost:3000)..."
ngrok http 3000 --url="$NGROK_URL" > "$NGROK_LOG" 2>&1 &
NGROK_PID=$!

# Whenever this script exits for ANY reason (normal exit, Ctrl+C, error),
# kill the backgrounded ngrok process too.
cleanup() {
  echo ""
  echo "Stopping ngrok tunnel (pid $NGROK_PID)..."
  kill "$NGROK_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Give ngrok a moment to actually come up before starting the dev server,
# so the very first request isn't racing the tunnel's startup.
sleep 2

if ! kill -0 "$NGROK_PID" 2>/dev/null; then
  echo "ngrok failed to start -- check $NGROK_LOG for details:"
  tail -n 20 "$NGROK_LOG"
  exit 1
fi

echo "ngrok is up. Starting Next.js dev server..."
rm -rf .next
npm run dev
