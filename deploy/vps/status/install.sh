#!/bin/bash
# Установка/обновление панели состояния на cloud-001. Запуск на сервере из каталога со файлами:
#   STATUS_PASSWORD=... bash install.sh     (пароль нужен только при первой установке)
set -euo pipefail
cd "$(dirname "$0")"
install -d -m 755 /opt/server-status
install -m 644 server.py index.html /opt/server-status/
install -m 644 server-status.service /etc/systemd/system/server-status.service
systemctl daemon-reload
systemctl enable -q server-status
systemctl restart server-status

if [ ! -f /etc/caddy/sites/status.caddy ] || [ -n "${STATUS_PASSWORD:-}" ]; then
  : "${STATUS_PASSWORD:?нужен STATUS_PASSWORD для первой установки}"
  HASH=$(caddy hash-password --plaintext "$STATUS_PASSWORD")
  sed "s|PASSWORD_HASH|$HASH|" status.caddy > /etc/caddy/sites/status.caddy.new
  mv /etc/caddy/sites/status.caddy.new /etc/caddy/sites/status.caddy
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null
  systemctl reload caddy
fi
sleep 2
curl -fsS -o /dev/null http://127.0.0.1:3400/api/state && echo "status: ok"
