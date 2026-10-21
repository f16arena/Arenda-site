#!/bin/bash
# Ручной деплой Commrent на cloud-001 (запускать из Git Bash в корне arenda-pro):
#   bash deploy/vps/deploy.sh
# Обычно не нужен: пуш в main деплоит сам (.github/workflows/deploy-vps.yml).
# Берёт закоммиченное + незакоммиченные правки в отслеживаемых файлах (новые файлы — только после git add).
# Сборку, миграции, перезапуск и откат делает сервер: deploy/vps/deploy-server.sh.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

K="$HOME/.ssh"
SSH=(ssh -F "$K/config" -o UserKnownHostsFile="$K/known_hosts" -i "$K/id_ed25519_cloud001"
     -o IdentitiesOnly=yes -o BatchMode=yes -o ServerAliveInterval=30 root@185.113.132.3)

TREE=$(git stash create)
TREE=${TREE:-HEAD}
TAG="$(git rev-parse --short HEAD)$([ "$TREE" = HEAD ] || echo -local)"
git archive --format=tar "$TREE" | "${SSH[@]}" /opt/commrent/deploy-server.sh "$TAG"
