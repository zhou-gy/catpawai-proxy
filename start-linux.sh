#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18 or newer first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Current version: $(node -v)" >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  echo ".env was not found in $APP_DIR. Copy your Windows-generated .env here first." >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm ci --omit=dev
fi

exec node clean/server.js
