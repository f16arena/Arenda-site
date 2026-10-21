#!/bin/bash
# Серверная часть деплоя Commrent (лежит в /opt/commrent/deploy-server.sh).
# На вход (stdin) — tar с исходниками, аргумент — метка версии:
#   git archive HEAD | ssh root@cloud-001 /opt/commrent/deploy-server.sh <метка>
# Для ключа GitHub Actions этот скрипт — forced command в authorized_keys, метка приходит
# через SSH_ORIGINAL_COMMAND: ключ умеет только деплоить.
#
# Порядок: сборка -> миграции -> перезапуск -> проверка здоровья. Пока сборка не прошла,
# работающая версия не трогается; если новая версия не поднялась — откат на прежний образ.
set -euo pipefail
cd /opt/commrent

exec 9>/opt/commrent/.deploy.lock
flock -w 1800 9 || { echo "Другой деплой идёт слишком долго"; exit 1; }

RAW="${1:-${SSH_ORIGINAL_COMMAND:-}}"
TAG=$(printf '%s' "$RAW" | tr -cd 'a-zA-Z0-9._-' | cut -c1-60)
TAG="${TAG:-manual}-$(date -u +%m%d%H%M)"
log() { echo "$(date -u +%T) $*"; }
log "Деплой $TAG"

log "1. Исходники"
rm -rf src.new && mkdir src.new
tar -x -C src.new
cp src.new/deploy/vps/Dockerfile src.new/Dockerfile

log "2. Сборка образа"
set -a; . ./.env; set +a
if ! docker build -t "commrent-web:$TAG" \
    --build-arg NEXT_PUBLIC_SENTRY_DSN="$NEXT_PUBLIC_SENTRY_DSN" \
    --build-arg NEXT_PUBLIC_TELEGRAM_BOT_NAME="$NEXT_PUBLIC_TELEGRAM_BOT_NAME" \
    src.new > build.log 2>&1; then
  tail -60 build.log; log "СБОРКА УПАЛА — работающая версия не тронута"; exit 1
fi

log "3. Миграции"
if ! WEB_TAG="$TAG" docker compose run --rm -T --no-deps web node scripts/deploy-migrations.mjs \
    < /dev/null > migrate.log 2>&1; then
  tail -30 migrate.log; log "МИГРАЦИИ УПАЛИ — работающая версия не тронута"; exit 1
fi
tail -3 migrate.log

log "4. Перезапуск"
PREV=$(docker inspect -f '{{.Image}}' commrent-web-1 2>/dev/null || true)
docker tag "commrent-web:$TAG" commrent-web:latest
docker compose up -d web < /dev/null 2>&1 | tail -1
health() {
  for _ in $(seq 40); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' commrent-web-1)" = healthy ] && return 0
    sleep 3
  done
  return 1
}
if ! health; then
  docker logs --tail 40 commrent-web-1 2>&1
  if [ -n "$PREV" ]; then
    log "Новая версия не поднялась — ОТКАТ на прежний образ"
    docker tag "$PREV" commrent-web:latest
    docker compose up -d web < /dev/null 2>&1 | tail -1
    health && log "Откат выполнен, сайт работает на прежней версии"
  fi
  exit 1
fi

log "5. Служебные файлы с сервера синхронизирую из репозитория"
install -m 700 src.new/deploy/vps/cron-call.sh cron-call.sh
install -m 700 src.new/deploy/vps/backup.sh backup.sh
install -m 700 src.new/deploy/vps/sync-from-supabase.sh sync-from-supabase.sh
install -m 644 src.new/deploy/vps/compose.yml compose.yml
install -m 644 src.new/deploy/vps/commrent.cron /etc/cron.d/commrent
install -m 700 src.new/deploy/vps/deploy-server.sh deploy-server.sh.next

rm -rf src.prev; [ -d src ] && mv src src.prev; mv src.new src
# Храним 4 последних образа (для ручного отката), остальные удаляем.
docker images commrent-web --format '{{.Tag}}' | grep -v '^latest$' | tail -n +5 \
  | xargs -r -I{} docker rmi "commrent-web:{}" > /dev/null 2>&1 || true
docker image prune -f > /dev/null
log "Готово: $TAG, health: healthy"
# Сам себя обновляем последним действием: rename атомарен, а bash дочитывает старый файл
# по уже открытому дескриптору — запущенный экземпляр это не ломает.
mv -f deploy-server.sh.next deploy-server.sh
