#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-catpawai-proxy}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="${SUDO_USER:-$(id -un)}"
NODE_BIN="$(command -v node || true)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo bash scripts/install-systemd.sh" >&2
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "Node.js was not found in PATH. Install Node.js 18 or newer first." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "$APP_DIR/.env was not found. Copy your Windows-generated .env before installing." >&2
  exit 1
fi

chmod +x "$APP_DIR/start-linux.sh"

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=CatPawAI OpenAI-compatible local proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=${APP_DIR}/start-linux.sh
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME"
