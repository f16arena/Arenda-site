# Перенос VPS (NCANode + Gotenberg + ESF-sign) на новый сервер

> Цель: перенести ЭЦП/ЭСФ/PDF-инфраструктуру со старого VPS на новый Ubuntu-VPS
> **без изменения переменных окружения в Vercel**. Достигается сохранением
> тех же доменов, секретов и путей.
>
> Дата составления: 2026-06-26. Старый VPS: `78.40.108.250` (Ubuntu 24.04).

## Что на старом сервере (инвентаризация)

**Docker-контейнеры** (`restart=unless-stopped`):
- `gotenberg` — `gotenberg/gotenberg:8`, `127.0.0.1:3000->3000`, без томов (stateless). Для `pdf.commrent.kz`.
- `ncanode` (имя было `flamboyant_tharp`) — `malikzh/ncanode:latest`, `127.0.0.1:14579->14579`,
  том `ncanode_cache -> /app/cache` (только кеш OCSP/CRL — НЕ переносим, регенерируется),
  env `JAVA_OPTS=-Xms128m -Xmx512m`. Для `ecp.commrent.kz`.

**systemd-сервисы (нативные, User=ubuntu):**
- `esf-sign.service` → `/opt/esf-sign/jdk8u492-b09-jre/bin/java -jar /opt/esf-sign/esf_local_server.jar`,
  WorkingDirectory=/opt/esf-sign, Restart=always. Порт `*:6666` (UFW deny снаружи).
- `esf-sign-proxy.service` → `/usr/bin/python3 /opt/esf-sign/sign-proxy.py`, After esf-sign. Порт `127.0.0.1:6667`.
- `caddy.service` → `/etc/caddy/Caddyfile`.

**`/opt/esf-sign/`** (единственные незаменимые данные):
- `esf_local_server.jar` (46 МБ)
- `gost.p12` (1827 Б, mode 600, ubuntu) — **КЛЮЧ ЭЦП, критично**
- `jdk8u492-b09-jre/` (встроенный JRE Java 8)
- `jre8.tar.gz` (исходный архив JRE — можно не переносить)
- `sign-proxy.py` (root)

**Caddy** `/etc/caddy/Caddyfile` — домены `ecp.commrent.kz` (маршруты NCANode `:14579` по
`X-Ncanode-Secret` и ESF `:6667` по `X-Esf-Sign-Secret`) и `pdf.commrent.kz`
(`:3000` по `X-Convert-Secret`). HTTPS — авто Let's Encrypt (HTTP-01).

**UFW:** allow 22/80/443, deny 6666, default deny incoming.

## Vercel env, которые ходят на этот VPS (НЕ меняем — сохраняем 1:1)
- `NCANODE_URL=https://ecp.commrent.kz`, `NCANODE_SECRET`
- `ESF_SIGN_URL` (`https://ecp.commrent.kz/LocalService`), `ESF_SIGN_SECRET`,
  `ESF_SIGN_CERT_PATH=/opt/esf-sign/gost.p12`, `ESF_SIGN_CERT_PIN`
- `PDF_CONVERT_URL=https://pdf.commrent.kz/forms/libreoffice/convert`, `PDF_CONVERT_SECRET`

Т.к. на новом сервере сохраняем те же домены, секреты (копируем Caddyfile файлом)
и тот же путь `/opt/esf-sign/gost.p12` — **Vercel править не нужно**.

---

## Фаза 1 — Бэкап на СТАРОМ сервере (безопасно, ничего не меняет)

```bash
# 1. Зафиксировать точные образы Docker (на случай пиннинга по digest)
sudo docker inspect --format '{{.Config.Image}} -> {{index .RepoDigests 0}}' \
  $(sudo docker ps -q) | tee ~/docker-images.txt

# 2. Один архив со всем необходимым (с сохранением прав -p; gost.p12 mode 600)
cd ~
sudo tar czpf vps-migration.tar.gz \
  --exclude='/opt/esf-sign/jre8.tar.gz' \
  /opt/esf-sign \
  /etc/caddy/Caddyfile \
  /etc/systemd/system/esf-sign.service \
  /etc/systemd/system/esf-sign-proxy.service \
  /var/lib/caddy/.local/share/caddy
sudo chown ubuntu:ubuntu vps-migration.tar.gz
ls -lh vps-migration.tar.gz ~/docker-images.txt
```

## Фаза 2 — Перенос архива на НОВЫЙ сервер

С локального ПК (Windows PowerShell), через лэптоп как промежуточное звено:
```powershell
scp ubuntu@78.40.108.250:~/vps-migration.tar.gz .
scp ubuntu@78.40.108.250:~/docker-images.txt .
scp .\vps-migration.tar.gz ubuntu@NEW_IP:~/
```

## Фаза 3 — Установка ПО на НОВОМ сервере (Ubuntu 22.04/24.04)

```bash
# Docker (официальный репозиторий)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # удобство; перелогиниться для применения

# Caddy (официальный репозиторий)
sudo apt update && sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# python3 обычно уже есть; проверить
python3 --version
```

## Фаза 4 — Восстановление данных на НОВОМ сервере

```bash
cd ~
# Распаковать с сохранением прав в корень
sudo tar xzpf vps-migration.tar.gz -C /

# Права: /opt/esf-sign под ubuntu, gost.p12 mode 600, sign-proxy.py root
sudo chown -R ubuntu:ubuntu /opt/esf-sign
sudo chmod 600 /opt/esf-sign/gost.p12
sudo chown root:root /opt/esf-sign/sign-proxy.py

# Caddy-сертификаты — владелец caddy
sudo chown -R caddy:caddy /var/lib/caddy
```

## Фаза 5 — Запуск сервисов

```bash
# Docker-контейнеры (те же образы, порты только на localhost)
docker pull malikzh/ncanode:latest
docker pull gotenberg/gotenberg:8
docker run -d --name ncanode --restart unless-stopped \
  -p 127.0.0.1:14579:14579 -e JAVA_OPTS="-Xms128m -Xmx512m" \
  -v ncanode_cache:/app/cache malikzh/ncanode:latest
docker run -d --name gotenberg --restart unless-stopped \
  -p 127.0.0.1:3000:3000 gotenberg/gotenberg:8

# systemd-сервисы ESF
sudo systemctl daemon-reload
sudo systemctl enable --now esf-sign.service
sudo systemctl enable --now esf-sign-proxy.service

# Caddy
sudo systemctl restart caddy

# UFW
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw deny 6666/tcp
sudo ufw --force enable
```

## Фаза 6 — Проверка ДО переключения DNS (старый продолжает работать)

Подставить реальные секреты и `NEW_IP`. `--resolve` бьёт по новому IP с правильным Host:
```bash
NEW_IP=<новый_ip>
NCANODE_SECRET=<...>; ESF_SECRET=<...>; CONVERT_SECRET=<...>

# NCANode (без секрета должен быть 403; с секретом — ответ NCANode)
curl -sk --resolve ecp.commrent.kz:443:$NEW_IP https://ecp.commrent.kz/ -o /dev/null -w '%{http_code}\n'
curl -sk --resolve ecp.commrent.kz:443:$NEW_IP -H "X-Ncanode-Secret: $NCANODE_SECRET" https://ecp.commrent.kz/ -w '\n%{http_code}\n'

# Gotenberg health (через секрет конвертера)
curl -sk --resolve pdf.commrent.kz:443:$NEW_IP -H "X-Convert-Secret: $CONVERT_SECRET" https://pdf.commrent.kz/health -w '\n%{http_code}\n'

# Локально на сервере: ESF jar и proxy живы
curl -s 127.0.0.1:6666 -o /dev/null -w 'jar:%{http_code}\n'
systemctl is-active esf-sign esf-sign-proxy caddy
docker ps
```

## Фаза 7 — Cutover (переключение DNS)

1. **Заранее** (за сутки) снизить TTL A-записей `ecp.commrent.kz` и `pdf.commrent.kz` до 60–300 с.
2. Переключить A-записи `ecp.commrent.kz` и `pdf.commrent.kz` → `NEW_IP`.
   (Если записи проксируются через Cloudflare — поменять origin IP в CF.)
3. Дождаться распространения (минуты при низком TTL). Caddy на новом сервере уже
   с валидными сертификатами (перенесли) → HTTPS без паузы.
4. Проверить вживую: подписать/проверить документ в приложении (ЭЦП, ЭСФ, PDF).

## Фаза 8 — Дочистка
- Старый VPS оставить включённым 3–7 дней как откат (rollback = вернуть A-записи на старый IP).
- После — отменить старый VPS.
- **Безопасность:** пароль VPS и пароль ЭЦП светились в чате ранее — сменить.
  Секреты Caddy при желании ротировать (тогда обновить и Vercel-env — единственный
  случай, когда Vercel трогаем).

## Откат (rollback)
Вернуть A-записи `ecp.commrent.kz`/`pdf.commrent.kz` на старый IP `78.40.108.250`.
Старый сервер не трогали — продолжит работать как раньше.
