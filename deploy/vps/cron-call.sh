#!/bin/bash
# Вызов cron-эндпоинта Commrent так же, как это делал Vercel Cron: GET + Bearer CRON_SECRET.
# Использование: /opt/commrent/cron-call.sh /api/cron/check-deadlines
set -uo pipefail
CRON_SECRET=$(grep '^CRON_SECRET=' /opt/commrent/.env | cut -d= -f2- | sed "s/^'//; s/'$//")
START=$(date -u +%FT%TZ)
CODE=$(curl -s -o /tmp/commrent-cron.out -w '%{http_code}' -m 600 \
  -H "Authorization: Bearer $CRON_SECRET" -H "Host: commrent.kz" -H "X-Forwarded-Proto: https" \
  "http://127.0.0.1:3300$1")
echo "$START $1 -> $CODE $(head -c 300 /tmp/commrent-cron.out | tr '\n' ' ')" >> /var/log/commrent-cron.log
[ "$CODE" = 200 ]
