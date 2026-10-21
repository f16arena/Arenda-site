#!/bin/bash
# Ежедневный бэкап БД Commrent (cron /etc/cron.d/commrent-backup, 21:00 UTC = 02:00 Астана).
# Хранит 14 последних дампов в /opt/commrent/backups/daily; latest.dump — ссылка на свежий
# (её забирает компьютер владельца, см. deploy/vps/pull-backup.ps1).
set -euo pipefail
D=/opt/commrent/backups/daily
mkdir -p "$D"
F="$D/commrent-$(date -u +%Y%m%d-%H%M).dump"
docker exec commrent-db-1 pg_dump -U commrent -d commrent -Fc > "$F.part"
# Проверка, что дамп читается целиком, прежде чем считать его готовым.
docker exec -i commrent-db-1 pg_restore -l < "$F.part" > /dev/null
mv "$F.part" "$F"
ln -sfn "$(basename "$F")" "$D/latest.dump"
ls -1t "$D"/commrent-*.dump | tail -n +15 | xargs -r rm -f
echo "$(date -u +%FT%TZ) backup ok $(du -h "$F" | cut -f1) $F" >> /var/log/commrent-backup.log
