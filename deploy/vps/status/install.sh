#!/bin/bash
# Установка/обновление панели состояния на cloud-001. Запуск на сервере из каталога с файлами:
#   bash install.sh
# Пароль задаётся один раз (дальше меняется из самой панели):
#   STATUS_PASSWORD=... bash install.sh            — при первой установке или чтобы сбросить забытый
set -euo pipefail
cd "$(dirname "$0")"
install -d -m 755 /opt/server-status
install -m 644 server.py index.html login.html views.js views.css /opt/server-status/
install -m 644 server-status.service /etc/systemd/system/server-status.service
install -m 644 status.caddy /etc/caddy/sites/status.caddy
systemctl daemon-reload
systemctl enable -q server-status

if [ -n "${STATUS_PASSWORD:-}" ]; then
  install -d -m 700 /var/lib/server-status
  STATE_DIRECTORY=/var/lib/server-status STATUS_PASSWORD="$STATUS_PASSWORD" \
    python3 /opt/server-status/server.py set-password "${STATUS_USER:-admin}"
fi
[ -f /var/lib/server-status/auth.json ] || echo "ВНИМАНИЕ: пароль не задан — запустите с STATUS_PASSWORD=..."

systemctl restart server-status
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null 2>&1
systemctl reload caddy
sleep 2
curl -fsS -o /dev/null http://127.0.0.1:3400/login && echo "status: ok"
