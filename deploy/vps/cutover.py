"""Переключение Commrent с Vercel+Supabase на cloud-001.

    python deploy/vps/cutover.py            # переключить
    python deploy/vps/cutover.py rollback   # вернуть на Vercel

Шаги переключения:
  1. Supabase -> только чтение (default_transaction_read_only) + закрыть текущие соединения Vercel,
     чтобы после финальной копии в старую БД ничего не дописалось.
  2. Финальная копия БД с полной сверкой (sync-from-supabase.sh).
  3. DNS в Vercel: commrent.kz и *.commrent.kz -> A 185.113.132.3 (ALIAS/CNAME на Vercel убираются).
  4. Cron на сервере.
  5. Ждём DNS, выпускаем сертификаты (корень, www, поддомены организаций), проверяем снаружи.
Токен Vercel берётся из Desktop/commrent-migration-secrets.txt.
"""
import json
import re
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

IP = "185.113.132.3"
TEAM = "team_0OXchN6ebZWKrLrU6fJayU3P"
DOMAIN = "commrent.kz"
# Записи Vercel до переключения — для отката.
VERCEL_RECORDS = [
    {"name": "", "type": "ALIAS", "value": "dda9f19964da99ef.vercel-dns-017.com", "ttl": 60},
    {"name": "*", "type": "ALIAS", "value": "dda9f19964da99ef.vercel-dns-017.com", "ttl": 60},
    {"name": "*", "type": "CNAME", "value": "cname.vercel-dns.com.", "ttl": 60},
]
VPS_RECORDS = [
    {"name": "", "type": "A", "value": IP, "ttl": 60},
    {"name": "*", "type": "A", "value": IP, "ttl": 60},
]

HOME = Path.home()
SSH = ["ssh", "-F", str(HOME / ".ssh/config"), "-o", f"UserKnownHostsFile={HOME / '.ssh/known_hosts'}",
       "-i", str(HOME / ".ssh/id_ed25519_cloud001"), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
       "-o", "ServerAliveInterval=30", f"root@{IP}"]
TOKEN = re.search(r"^VERCEL_TOKEN=(\S+)",
                  (HOME / "Desktop/commrent-migration-secrets.txt").read_text(encoding="utf-8"), re.M).group(1)

SUPA = 'cd /opt/commrent && set -a && . ./.env && set +a && docker run --rm postgres:17 psql "$SUPABASE_SOURCE_URL" -At -c'


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def remote(cmd, check=True):
    r = subprocess.run(SSH + [cmd], capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (r.stdout + r.stderr).strip()
    if check and r.returncode != 0:
        raise SystemExit(f"ОШИБКА на сервере ({r.returncode}):\n{out}")
    return out


def vercel(method, path, body=None):
    sep = "&" if "?" in path else "?"
    req = urllib.request.Request(f"https://api.vercel.com{path}{sep}teamId={TEAM}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return json.loads(body) if body.strip() else {}


def set_dns(target):
    records = vercel("GET", f"/v4/domains/{DOMAIN}/records?limit=100")["records"]
    for rec in records:
        if rec["name"] in ("", "*") and rec["type"] in ("A", "ALIAS", "CNAME"):
            vercel("DELETE", f"/v2/domains/{DOMAIN}/records/{rec['id']}")
            log(f"  DNS удалено: {rec['name'] or '@'} {rec['type']} {rec['value']}")
    for rec in target:
        vercel("POST", f"/v2/domains/{DOMAIN}/records", rec)
        log(f"  DNS создано: {rec['name'] or '@'} {rec['type']} {rec['value']}")


def resolve_public(host):
    """Спрашиваем у DNS Google через DoH, чтобы не зависеть от локального кеша."""
    try:
        with urllib.request.urlopen(f"https://dns.google/resolve?name={host}&type=A", timeout=10) as r:
            return [a["data"] for a in json.load(r).get("Answer", []) if a.get("type") == 1]
    except Exception:
        return []


def https_status(host, path="/"):
    """Запрос прямо на IP сервера с нужным SNI — не зависит от DNS этой машины."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((IP, 443), timeout=30) as sock, ctx.wrap_socket(sock, server_hostname=host) as s:
            s.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode())
            return s.recv(64).decode(errors="replace").split("\r\n")[0]
    except Exception as e:
        return f"ERR {type(e).__name__}: {e}"


def cutover():
    log("0. Предпроверка")
    print(remote("docker inspect -f '{{.State.Health.Status}}' commrent-web-1 commrent-db-1"))

    log("1. Supabase -> только чтение, закрываю соединения Vercel")
    remote(SUPA + ' "ALTER DATABASE postgres SET default_transaction_read_only = on"')
    print(remote(SUPA + ' "select count(pg_terminate_backend(pid)) from pg_stat_activity'
                        ' where datname=current_database() and usename=current_user and pid<>pg_backend_pid()"'))
    time.sleep(3)
    print(remote(SUPA + ' "show default_transaction_read_only"'))

    log("2. Финальная копия БД со сверкой")
    out = remote("/opt/commrent/sync-from-supabase.sh 2>&1 | grep -vE 'NOTICE|DETAIL|drop cascades'")
    print(out)
    if "совпадают 1:1" not in out or "ГОТОВО" not in out:
        raise SystemExit("Сверка не прошла — DNS НЕ переключаю. Supabase остаётся read-only: "
                         "для отмены запусти `cutover.py rollback`.")

    log("3. DNS -> VPS")
    set_dns(VPS_RECORDS)

    log("4. Cron на сервере")
    remote("cp /opt/commrent/commrent.cron /etc/cron.d/commrent && chmod 644 /etc/cron.d/commrent")

    log("5. Жду DNS (Google DoH)")
    for _ in range(60):
        if resolve_public(DOMAIN) == [IP] and resolve_public(f"bcf16.{DOMAIN}") == [IP]:
            break
        time.sleep(10)
    log(f"  {DOMAIN} -> {resolve_public(DOMAIN)}; bcf16.{DOMAIN} -> {resolve_public('bcf16.' + DOMAIN)}")

    log("6. Сертификаты и проверка снаружи")
    slugs = remote("docker exec commrent-db-1 psql -U commrent -d commrent -Atc 'select slug from organizations order by 1'").split()
    hosts = [DOMAIN, f"www.{DOMAIN}"] + [f"{s}.{DOMAIN}" for s in slugs]
    for h in hosts:
        status = "ERR"
        for _ in range(6):  # первый запрос запускает выпуск сертификата
            status = https_status(h, "/login" if h in (DOMAIN, f"www.{DOMAIN}") else "/admin")
            if not status.startswith("ERR"):
                break
            time.sleep(10)
        log(f"  {h}: {status}")
    log("Готово. Откат при необходимости: python deploy/vps/cutover.py rollback")


def rollback():
    log("Откат: DNS -> Vercel")
    set_dns(VERCEL_RECORDS)
    log("Cron на сервере выключен")
    remote("rm -f /etc/cron.d/commrent")
    log("Supabase -> снова запись разрешена")
    remote(SUPA + ' "ALTER DATABASE postgres RESET default_transaction_read_only"')
    log("ВНИМАНИЕ: данные, записанные на VPS после переключения, в Supabase НЕ попали.")


if __name__ == "__main__":
    rollback() if sys.argv[1:] == ["rollback"] else cutover()
