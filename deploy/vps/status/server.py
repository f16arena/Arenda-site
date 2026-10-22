#!/usr/bin/env python3
"""Панель состояния cloud-001: проекты, деплои, контейнеры, нагрузка сервера.

Только чтение: ничего не перезапускает и не меняет. Слушает 127.0.0.1:3400, снаружи —
через Caddy с паролем (status.caddy). Без внешних зависимостей — стандартная библиотека Python.

Откуда что берётся:
  нагрузка        — /proc (раз в 5 с, история за час в памяти)
  контейнеры      — Docker API через /var/run/docker.sock (только пока страница открыта)
  деплои          — журналы вида «2026-10-22T13:03:02Z deploy abc -> def» / «... ok» / «... ОШИБКА»
  сайты           — HTTPS-запрос раз в 30 с
"""
import calendar
import collections
import concurrent.futures
import hashlib
import hmac
import http.client
import http.server
import json
import os
import re
import secrets
import socket
import socketserver
import sqlite3
import ssl
import subprocess
import threading
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LISTEN = ("127.0.0.1", int(os.environ.get("STATUS_PORT", "3400")))

# ── Проекты на сервере ─────────────────────────────────────────────────────────
# match: контейнер относится к проекту, если его compose working_dir начинается с одного из путей
# или имя — одно из names. deploy_log: журнал выкаток в общем формате (см. docstring).
PROJECTS = [
    {
        "id": "commrent", "name": "Commrent", "url": "https://commrent.kz/login",
        "links": ["https://commrent.kz"],
        "repo": "https://github.com/f16arena/Arenda-site",
        "match_dirs": ["/opt/commrent"], "names": [],
        "deploy_log": "/var/log/commrent-deploy.log",
        "deploy_how": "GitHub Actions при push в main",
        "backup_dir": "/opt/commrent/backups/daily", "backup_re": r"^commrent-.*\.dump$",
        "logs": {"build": "/opt/commrent/build.log", "migrate": "/opt/commrent/migrate.log",
                 "cron": "/var/log/commrent-cron.log", "deploy": "/var/log/commrent-deploy.log",
                 "backup": "/var/log/commrent-backup.log"},
    },
    {
        "id": "orda", "name": "Orda", "url": "https://www.ordaops.kz",
        "links": ["https://www.ordaops.kz", "https://db.ordaops.kz"],
        "repo": "https://github.com/f16arena/f16finance",
        "match_dirs": ["/opt/orda", "/opt/supabase/orda"], "names": [],
        "deploy_log": "/var/log/orda-deploy.log", "git_dir": "/opt/orda/app",
        "deploy_how": "сервер сам проверяет origin/main раз в минуту",
        "backup_dir": "/opt/orda/backups", "backup_re": r"^db-.*\.dump$",
        "logs": {"deploy": "/var/log/orda-deploy.log", "cron": "/var/log/orda-cron.log",
                 "backup": "/var/log/orda-backup.log"},
    },
    {
        "id": "jiyn", "name": "Jiyn", "url": "https://jiyn.commrent.kz",
        "links": ["https://jiyn.commrent.kz"],
        "repo": "https://github.com/f16arena/turanix-app",
        "match_dirs": ["/opt/jiyn"], "names": [],
        "git_dir": "/opt/jiyn", "deploy_container": "deploy-web-1",
        "deploy_how": "вручную (deploy/up.sh)",
        "backup_dir": "/opt/jiyn/deploy/backup", "backup_re": r"^jiyn-.*\.dump$",
        "logs": {"cron": "/var/log/jiyn-cron.log", "backup": "/var/log/jiyn-backup.log",
                 "alert": "/var/log/jiyn-alert.log"},
    },
    {
        "id": "tour", "name": "F16 Турниры", "url": "https://tournament.f16-arena.kz",
        "links": ["https://tournament.f16-arena.kz", "https://db.f16-arena.kz"],
        "repo": "https://github.com/padash00/Tour",
        "match_dirs": ["/opt/supabase/tour"], "names": ["site-tour"],  # сайты в общем compose /opt/sites/bin — по имени
        "deploy_log": "/var/log/site-tour-deploy.log", "git_dir": "/opt/sites/tour/app",
        "deploy_how": "сервер сам проверяет origin/main раз в минуту",
        "backup_dir": "/opt/supabase/tour/backups", "backup_re": r"^tour-db-.*\.dump$",
        "logs": {"deploy": "/var/log/site-tour-deploy.log", "backup": "/var/log/tour-backup.log",
                 "access": "/var/log/caddy/tournament-access.log"},
    },
    {
        "id": "f16arena", "name": "F16 Arena (лендинг)", "url": "https://www.f16-arena.kz",
        "links": ["https://www.f16-arena.kz"],
        "repo": "https://github.com/padash00/newf16extra-arena",
        "match_dirs": [], "names": ["site-f16-arena"],
        "deploy_log": "/var/log/site-f16-arena-deploy.log", "git_dir": "/opt/sites/f16-arena/app",
        "deploy_how": "сервер сам проверяет origin/main раз в минуту",
        "logs": {"deploy": "/var/log/site-f16-arena-deploy.log"},
    },
    {
        "id": "shared", "name": "Общие сервисы", "url": None,
        "links": ["https://ecp.commrent.kz", "https://pdf.commrent.kz"],
        "match_dirs": [], "names": ["ncanode", "gotenberg", "buildx_buildkit_polite0"],
        "units": ["caddy", "docker", "esf-sign", "esf-sign-proxy", "fail2ban"],
        "logs": {},
    },
    {
        "id": "teamspeak", "name": "TeamSpeak", "url": None,
        "links": ["ts3server://f16"],
        "match_dirs": ["/opt/teamspeak"], "names": [],
        "units": ["ts-bot"],
        "voice_state": "/opt/teamspeak/state.json",  # пишет F16 Bot раз в 15 с
        "logs": {},
    },
]

# Сайты для проверки доступности. Ответ < 500 — сайт жив (ecp/pdf отвечают 403 без секрета, db — 401).
CHECKS = [
    ("commrent", "https://commrent.kz/login"),
    ("commrent", "https://demo.commrent.kz/"),
    ("orda", "https://www.ordaops.kz/"),
    ("orda", "https://db.ordaops.kz/"),
    ("jiyn", "https://jiyn.commrent.kz/"),
    ("tour", "https://tournament.f16-arena.kz/"),
    ("tour", "https://db.f16-arena.kz/"),  # корень отдаёт 404 — это норма, база жива
    ("f16arena", "https://www.f16-arena.kz/"),
    ("shared", "https://ecp.commrent.kz/"),
    ("shared", "https://pdf.commrent.kz/"),
]

LOCK = threading.Lock()
SYS_HISTORY = collections.deque(maxlen=720)  # 1 час по 5 с
CHECK_STATE = {}  # url -> {"code","ms","at","history":deque}
CONTAINERS = {"at": 0, "items": []}
LAST_VIEW = [0.0]


# ── Docker API через unix-сокет ────────────────────────────────────────────────
class DockerConn(http.client.HTTPConnection):
    def __init__(self, timeout=10):
        super().__init__("localhost", timeout=timeout)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


def docker_get(path, raw=False, timeout=10):
    c = DockerConn(timeout)
    try:
        c.request("GET", path)
        r = c.getresponse()
        body = r.read()
        if r.status >= 400:
            raise RuntimeError(f"docker {path}: {r.status}")
        return body if raw else json.loads(body)
    finally:
        c.close()


def docker_exec(container, cmd, env=(), timeout=30, max_bytes=40_000_000):
    """Запуск команды в контейнере (как docker exec): (код выхода, stdout, stderr)."""
    c = DockerConn(timeout)
    try:
        c.request("POST", f"/containers/{container}/exec", body=json.dumps(
            {"AttachStdout": True, "AttachStderr": True, "Cmd": list(cmd), "Env": list(env)}),
            headers={"Content-Type": "application/json"})
        r = c.getresponse()
        body = r.read()
        if r.status >= 400:
            raise RuntimeError(f"docker exec {container}: {r.status} {body[:200]!r}")
        eid = json.loads(body)["Id"]
    finally:
        c.close()
    c = DockerConn(timeout)
    try:
        c.request("POST", f"/exec/{eid}/start", body=json.dumps({"Detach": False, "Tty": False}),
                  headers={"Content-Type": "application/json"})
        r = c.getresponse()
        data = r.read(max_bytes)
    finally:
        c.close()
    streams = {1: [], 2: []}
    i = 0
    while i + 8 <= len(data):
        n = int.from_bytes(data[i + 4:i + 8], "big")
        streams.get(data[i], streams[1]).append(data[i + 8:i + 8 + n])
        i += 8 + n
    code = docker_get(f"/exec/{eid}/json").get("ExitCode")
    return code, b"".join(streams[1]).decode("utf-8", "replace"), b"".join(streams[2]).decode("utf-8", "replace")


def demux_logs(data):
    """Логи без TTY идут кадрами: 8 байт заголовка (поток, длина) + данные."""
    out, i = [], 0
    while i + 8 <= len(data):
        n = int.from_bytes(data[i + 4:i + 8], "big")
        if data[i] not in (0, 1, 2) or data[i + 1:i + 4] != b"\0\0\0":
            return data.decode("utf-8", "replace")  # контейнер с TTY — поток как есть
        out.append(data[i + 8:i + 8 + n])
        i += 8 + n
    return b"".join(out).decode("utf-8", "replace")


# ── Нагрузка сервера из /proc ──────────────────────────────────────────────────
def read_cpu():
    with open("/proc/stat") as f:
        v = [int(x) for x in f.readline().split()[1:]]
    idle = v[3] + v[4]
    return sum(v), idle


def read_mem():
    m = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, val = line.split(":", 1)
            m[k] = int(val.split()[0]) * 1024
    return m


def read_net():
    rx = tx = 0
    with open("/proc/net/dev") as f:
        for line in f.readlines()[2:]:
            name, rest = line.split(":", 1)
            if name.strip() == "eth0":
                p = rest.split()
                rx, tx = int(p[0]), int(p[8])
    return rx, tx


def read_disk_io():
    rd = wr = 0
    with open("/proc/diskstats") as f:
        for line in f:
            p = line.split()
            if re.fullmatch(r"vd[a-z]|sd[a-z]|nvme\d+n\d+", p[2]):
                rd += int(p[5]) * 512
                wr += int(p[9]) * 512
    return rd, wr


# ── История (SQLite в /var/lib/server-status) — графики за сутки/неделю/месяц и аптайм ─────────
# В памяти держится последний час по 5 с; сюда раз в минуту пишется среднее, проверки сайтов —
# каждая, контейнеры — раз в минуту. Сервер — 30 дней, контейнеры — 8 дней.
HIST_PATH = os.path.join(os.environ.get("STATE_DIRECTORY", "/var/lib/server-status"), "history.db")
HLOCK = threading.Lock()
_hdb = []


def hq(sql, args=()):
    with HLOCK:
        if not _hdb:
            os.makedirs(os.path.dirname(HIST_PATH), exist_ok=True)
            con = sqlite3.connect(HIST_PATH, check_same_thread=False, isolation_level=None)
            con.executescript("""
                pragma journal_mode = wal;
                create table if not exists sys (t integer primary key, cpu real, mem integer, swap integer,
                    rx real, tx real, rd real, wr real, load real);
                create table if not exists chk (t integer, url text, ok integer, ms integer);
                create index if not exists chk_url_t on chk (url, t);
                create table if not exists ctr (t integer, name text, cpu real, mem integer);
                create index if not exists ctr_name_t on ctr (name, t);""")
            _hdb.append(con)
        return _hdb[0].execute(sql, args).fetchall()


def hist_cleanup():
    now = int(time.time())
    hq("delete from sys where t < ?", (now - 31 * 86400,))
    hq("delete from chk where t < ?", (now - 31 * 86400,))
    hq("delete from ctr where t < ?", (now - 8 * 86400,))


SYS_KEYS = ("cpu", "mem", "swap", "rx", "tx", "rd", "wr", "load")


def sys_history(rng):
    """Точки за период, не больше ~360: усреднение по корзинам (cpu — ещё и максимум)."""
    if rng <= 3600:
        with LOCK:
            return list(SYS_HISTORY)
    b = max(60, rng // 360)
    rows = hq(f"""select (t / {b}) * {b} as tt, avg(cpu), avg(mem), avg(swap), avg(rx), avg(tx), avg(rd), avg(wr),
                  avg(load), max(cpu) from sys where t >= ? group by tt order by tt""", (int(time.time()) - rng,))
    return [{"t": r[0], **{k: (r[i + 1] or 0) for i, k in enumerate(SYS_KEYS)}, "cpu_max": r[9]} for r in rows]


def uptime_report():
    now = int(time.time())
    out = {}
    for pid, url in CHECKS:
        def agg(sec):
            r = hq("select count(*), sum(ok), avg(case when ok then ms end) from chk where url = ? and t >= ?",
                   (url, now - sec))[0]
            return {"n": r[0], "pct": round(100 * (r[1] or 0) / r[0], 3) if r[0] else None,
                    "ms": round(r[2]) if r[2] is not None else None}
        days = hq("""select t / 86400 as d, count(*), sum(ok), avg(case when ok then ms end) from chk
                     where url = ? and t >= ? group by d order by d""", (url, (now // 86400 - 29) * 86400))
        msr = [r[0] for r in hq("select ms from chk where url = ? and t >= ? and ok and ms is not null order by ms",
                                (url, now - 86400))]
        out[url] = {"project": pid, "h24": agg(86400), "d7": agg(7 * 86400), "d30": agg(30 * 86400),
                    "p95": msr[int(len(msr) * 0.95)] if msr else None,
                    "days": [{"d": r[0] * 86400, "n": r[1], "pct": round(100 * (r[2] or 0) / r[1], 2),
                              "ms": round(r[3]) if r[3] is not None else None} for r in days]}
    return out


def container_history(names, rng):
    b = max(60, rng // 120)
    res = {}
    for n in names[:40]:
        rows = hq(f"""select (t / {b}) * {b} as tt, avg(cpu), avg(mem) from ctr where name = ? and t >= ?
                      group by tt order by tt""", (n, int(time.time()) - rng))
        res[n] = [[r[0], round(r[1] or 0, 2), int(r[2] or 0)] for r in rows]
    return res


def hist_preload():
    """После перезапуска: последний час и последние проверки — из базы, чтобы графики не начинались с нуля."""
    now = int(time.time())
    for r in hq("select t, cpu, mem, swap, rx, tx, rd, wr, load from sys where t >= ? order by t", (now - 3600,)):
        SYS_HISTORY.append({"t": r[0], **{k: r[i + 1] or 0 for i, k in enumerate(SYS_KEYS)}})
    for pid, url in CHECKS:
        rows = hq("select t, ok, ms from chk where url = ? order by t desc limit 120", (url,))
        if rows:
            st = CHECK_STATE.setdefault(url, {"project": pid, "history": collections.deque(maxlen=120)})
            st["history"].extend({"t": t, "ok": bool(ok), "ms": ms} for t, ok, ms in reversed(rows))
            st.update(code=200 if rows[0][1] else 0, ms=rows[0][2], at=rows[0][0])


def sampler():
    prev = None
    last_write = time.time()
    while True:
        try:
            t = time.time()
            total, idle = read_cpu()
            rx, tx = read_net()
            rd, wr = read_disk_io()
            m = read_mem()
            if prev:
                dt = t - prev["t"]
                dtot = total - prev["total"]
                pt = {
                    "t": int(t),
                    "cpu": round(100 * (1 - (idle - prev["idle"]) / dtot), 1) if dtot else 0,
                    "mem": m["MemTotal"] - m["MemAvailable"],
                    "swap": m["SwapTotal"] - m["SwapFree"],
                    "rx": max(0, (rx - prev["rx"]) / dt), "tx": max(0, (tx - prev["tx"]) / dt),
                    "rd": max(0, (rd - prev["rd"]) / dt), "wr": max(0, (wr - prev["wr"]) / dt),
                    "load": float(open("/proc/loadavg").read().split()[0]),
                }
                with LOCK:
                    SYS_HISTORY.append(pt)
                    recent = [p for p in SYS_HISTORY if p["t"] > last_write]
                if t - last_write >= 60 and recent:
                    avg = {k: sum(p[k] for p in recent) / len(recent) for k in SYS_KEYS}
                    hq("insert or replace into sys values (?,?,?,?,?,?,?,?,?)",
                       (int(t), *(avg[k] for k in SYS_KEYS)))
                    last_write = t
                    if int(t) % 86400 < 60:
                        hist_cleanup()
            prev = {"t": t, "total": total, "idle": idle, "rx": rx, "tx": tx, "rd": rd, "wr": wr}
        except Exception as e:  # noqa: BLE001 — сэмплер не должен умирать
            print("sampler:", e, flush=True)
        time.sleep(5)


# ── Контейнеры (только пока панель открыта — stats нагружает dockerd) ───────────
_prev_cpu = {}


def container_stats(cid):
    s = docker_get(f"/containers/{cid}/stats?stream=false&one-shot=true", timeout=15)
    cpu = s.get("cpu_stats", {})
    usage = cpu.get("cpu_usage", {}).get("total_usage", 0)
    system = cpu.get("system_cpu_usage", 0)
    ncpu = cpu.get("online_cpus") or 1
    pct = None
    p = _prev_cpu.get(cid)
    if p and system > p[1]:
        pct = round((usage - p[0]) / (system - p[1]) * ncpu * 100, 1)
    _prev_cpu[cid] = (usage, system)
    ms = s.get("memory_stats", {})
    mem = ms.get("usage", 0) - ms.get("stats", {}).get("inactive_file", 0)
    return {"cpu": pct, "mem": max(mem, 0), "mem_limit": ms.get("limit", 0)}


def container_sampler():
    # Пока панель открыта — каждые 10 с (живые цифры), иначе раз в минуту — только для истории.
    pool = concurrent.futures.ThreadPoolExecutor(8)
    last_write = 0.0
    while True:
        try:
            viewed = time.time() - LAST_VIEW[0] < 120
            if viewed or time.time() - last_write >= 60:
                lst = docker_get("/containers/json?all=1")
                running = [c for c in lst if c["State"] == "running"]
                stats = dict(zip([c["Id"] for c in running],
                                 pool.map(lambda c: safe(container_stats, c["Id"]), running)))
                items = []
                for c in lst:
                    st = c.get("Status", "")
                    health = ("unhealthy" if "(unhealthy)" in st else "healthy" if "(healthy)" in st
                              else "starting" if "health: starting" in st else None)
                    items.append({
                        "id": c["Id"][:12], "name": c["Names"][0].lstrip("/"), "image": c["Image"],
                        "state": c["State"], "status": st, "health": health, "created": c["Created"],
                        "dir": c["Labels"].get("com.docker.compose.project.working_dir", ""),
                        **(stats.get(c["Id"]) or {}),
                    })
                with LOCK:
                    CONTAINERS.update(at=int(time.time()), items=items)
                if time.time() - last_write >= 60:
                    now = int(time.time())
                    rows = [(now, c["name"], c.get("cpu"), c.get("mem")) for c in items
                            if c["state"] == "running" and c.get("mem") is not None]
                    for r in rows:
                        hq("insert into ctr values (?,?,?,?)", r)
                    last_write = time.time()
        except Exception as e:  # noqa: BLE001
            print("containers:", e, flush=True)
        time.sleep(10)


def safe(fn, *a):
    try:
        return fn(*a)
    except Exception:  # noqa: BLE001
        return None


# ── Проверка сайтов ────────────────────────────────────────────────────────────
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def check_url(url):
    t = time.time()
    try:
        r = OPENER.open(urllib.request.Request(url, headers={"User-Agent": "cloud-001-status"}), timeout=15)
        code = r.status
        r.close()
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:  # noqa: BLE001
        return {"code": 0, "ms": None, "error": str(e)[:120]}
    return {"code": code, "ms": int((time.time() - t) * 1000)}


def checker():
    pool = concurrent.futures.ThreadPoolExecutor(len(CHECKS))
    while True:
        res = list(pool.map(lambda c: check_url(c[1]), CHECKS))
        now = int(time.time())
        with LOCK:
            for (pid, url), r in zip(CHECKS, res):
                st = CHECK_STATE.setdefault(url, {"project": pid, "history": collections.deque(maxlen=120)})
                st.update(r, at=now)
                st["history"].append({"t": now, "ok": 0 < r["code"] < 500, "ms": r["ms"]})
        for (pid, url), r in zip(CHECKS, res):
            try:
                hq("insert into chk values (?,?,?,?)", (now, url, int(0 < r["code"] < 500), r["ms"]))
            except Exception as e:  # noqa: BLE001
                print("history:", e, flush=True)
        time.sleep(30)


# ── Деплои ─────────────────────────────────────────────────────────────────────
TS_LINE = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) (.*)$")


def iso_to_ts(s):
    return calendar.timegm(time.strptime(s, "%Y-%m-%dT%H:%M:%SZ"))


def tail_bytes(path, n):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - n))
            return f.read().decode("utf-8", "replace")
    except OSError:
        return None


def git_subjects(git_dir):
    if not git_dir or not os.path.isdir(os.path.join(git_dir, ".git")):
        return {}, None
    try:
        out = subprocess.run(["git", "-c", f"safe.directory={git_dir}", "-C", git_dir, "log", "-80",
                              "--format=%H%x09%ct%x09%s"], capture_output=True, text=True, timeout=5).stdout
    except Exception:  # noqa: BLE001
        return {}, None
    subj, head = {}, None
    for i, line in enumerate(out.splitlines()):
        h, ct, s = line.split("\t", 2)
        subj[h] = (s, int(ct))
        if i == 0:
            head = {"sha": h, "subject": s, "time": int(ct)}
    return subj, head


def parse_deploys(path, subjects):
    """Журнал «ts deploy OLD -> NEW» + итог «ts ok» или «ts <что угодно другое>» = ошибка."""
    text = tail_bytes(path, 600_000)
    if text is None:
        return []
    deploys = []
    for line in text.splitlines():
        m = TS_LINE.match(line)
        if not m:
            continue
        ts, msg = iso_to_ts(m.group(1)), m.group(2).strip()
        d = re.match(r"deploy (?:(\S+) -> )?(\S+)(?: (.+))?$", msg)
        if d:
            deploys.append({"start": ts, "from": d.group(1), "sha": d.group(2), "status": "running",
                            **({"subject": d.group(3)} if d.group(3) else {})})
        elif deploys and deploys[-1]["status"] == "running":
            last = deploys[-1]
            last["end"] = ts
            last["duration"] = ts - last["start"]
            if msg == "ok" or msg.startswith("ok "):
                last["status"] = "ok"
            else:
                last["status"] = "rollback" if "ОТКАТ" in msg.upper() else "failed"
                last["error"] = msg[:200]
    now = time.time()
    for d in deploys:
        if d["status"] == "running" and now - d["start"] > 3600:
            d["status"] = "unknown"  # оборвался без итога
        sha = d["sha"]
        full = next((h for h in subjects if h.startswith(sha.split("-")[0])), None) if subjects else None
        if full:
            d["subject"] = subjects[full][0]
            d["sha_full"] = full
    return deploys[-30:][::-1]


BUILD_LOGS = "/var/log/commrent-builds"


def deploy_log(project, start, sha):
    """Лог одной выкатки, как «Build Logs» в Vercel."""
    if project == "orda":
        # В /var/log/orda-deploy.log вывод сборки идёт между строкой «… deploy A -> B» и итогом.
        text = tail_bytes("/var/log/orda-deploy.log", 8_000_000) or ""
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(start)))
        out, on = [], False
        for ln in text.splitlines():
            if not on and ln.startswith(stamp + " deploy"):
                on = True
            if on:
                out.append(ln)
                m = TS_LINE.match(ln)
                if m and len(out) > 1 and not m.group(2).startswith("deploy"):
                    break
        return "\n".join(out) or "Лог этой выкатки уже вытеснен из журнала"
    if project == "commrent":
        tag = re.sub(r"[^A-Za-z0-9._-]", "", sha)
        path = os.path.join(BUILD_LOGS, tag + ".log")
        if os.path.exists(path):
            return tail_bytes(path, 3_000_000)
        build = tail_bytes("/opt/commrent/build.log", 3_000_000) or ""
        if tag and tag in build:
            return build + "\n── миграции ──\n" + (tail_bytes("/opt/commrent/migrate.log", 500_000) or "")
        return "Лог этой выкатки не сохранился — логи сборок сохраняются начиная с 22.10.2026"
    return "Для этого проекта лог сборки не ведётся"


def latest_backup(d, pattern):
    try:
        files = [(e.stat().st_mtime, e.stat().st_size, e.name) for e in os.scandir(d)
                 if e.is_file() and re.match(pattern, e.name)]
    except OSError:
        return None
    if not files:
        return None
    t, size, name = max(files)
    return {"name": name, "time": int(t), "size": size, "count": len(files)}


def unit_state(units):
    if not units:
        return []
    out = subprocess.run(["systemctl", "is-active", *units], capture_output=True, text=True).stdout.split()
    return [{"name": u, "state": s} for u, s in zip(units, out)]


def project_of(c):
    for p in PROJECTS:
        if c["name"] in p["names"] or any(c["dir"].startswith(d) for d in p["match_dirs"]):
            return p["id"]
    return "other"


def read_json(path):
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def build_state():
    with LOCK:
        hist = list(SYS_HISTORY)
        checks = {u: {**{k: v for k, v in s.items() if k != "history"}, "history": list(s["history"])}
                  for u, s in CHECK_STATE.items()}
        containers = list(CONTAINERS["items"])
        c_at = CONTAINERS["at"]
    m = read_mem()
    vfs = os.statvfs("/")
    with open("/proc/uptime") as f:
        uptime = float(f.read().split()[0])
    server = {
        "host": socket.gethostname(), "ncpu": os.cpu_count(), "uptime": int(uptime),
        "load": [float(x) for x in open("/proc/loadavg").read().split()[:3]],
        "mem_total": m["MemTotal"], "mem_used": m["MemTotal"] - m["MemAvailable"],
        "swap_total": m["SwapTotal"], "swap_used": m["SwapTotal"] - m["SwapFree"],
        "disk_total": vfs.f_blocks * vfs.f_frsize, "disk_used": (vfs.f_blocks - vfs.f_bfree) * vfs.f_frsize,
        "reboot_required": os.path.exists("/var/run/reboot-required"),
        "history": hist,
    }
    projects = []
    for p in PROJECTS:
        subjects, head = git_subjects(p.get("git_dir"))
        deploys = parse_deploys(p["deploy_log"], subjects) if p.get("deploy_log") else []
        if not deploys and p.get("deploy_container"):
            # Нет журнала выкаток — последняя выкатка = время создания контейнера.
            c = next((c for c in containers if c["name"] == p["deploy_container"]), None)
            if c:
                deploys = [{"start": c["created"], "sha": (head or {}).get("sha", "")[:7],
                            "subject": (head or {}).get("subject"), "status": "ok", "inferred": True}]
        projects.append({
            "id": p["id"], "name": p["name"], "url": p.get("url"), "links": p.get("links", []),
            "repo": p.get("repo"), "deploy_how": p.get("deploy_how"), "head": head,
            "deploys": deploys,
            "backup": latest_backup(p["backup_dir"], p["backup_re"]) if p.get("backup_dir") else None,
            "units": unit_state(p.get("units")),
            "logs": sorted(p.get("logs", {})),
            "checks": [dict(url=u, **checks[u]) for _, u in CHECKS if u in checks and checks[u]["project"] == p["id"]],
            "containers": [c for c in containers if project_of(c) == p["id"]],
            "voice": read_json(p.get("voice_state")),
        })
    other = [c for c in containers if project_of(c) == "other"]
    if other:
        projects.append({"id": "other", "name": "Прочее", "containers": other, "deploys": [], "checks": [],
                         "units": [], "logs": [], "links": []})
    return {"now": int(time.time()), "server": server, "projects": projects, "containers_at": c_at}


# ── Базы данных (как Table Editor и Advisors в Supabase), только чтение ───────
# Запросы идут через docker exec psql под ролью status_ro: pg_read_all_data + BYPASSRLS (видит строки
# под RLS), default_transaction_read_only и statement_timeout. Писать эта роль не может ничего —
# даже если в SQL-редакторе выключить read_only, прав на запись у неё нет. Роль создаёт
# `server.py setup-db` (install.sh).
DATABASES = [
    {"id": "commrent", "name": "Commrent", "project": "commrent", "container": "commrent-db-1",
     "db": "commrent", "admin": "commrent"},
    {"id": "orda", "name": "Orda", "project": "orda", "container": "supabase-db",
     "db": "postgres", "admin": "supabase_admin"},
    {"id": "jiyn", "name": "Jiyn", "project": "jiyn", "container": "deploy-db-1", "db": "jiyn", "admin": "postgres"},
    {"id": "jiyn_stage", "name": "Jiyn stage", "project": "jiyn", "container": "deploy-db-1",
     "db": "jiyn_stage", "admin": "postgres"},
]
RO_ROLE = "status_ro"
NULL = "␀"  # так psql печатает NULL в CSV — отличить от пустой строки
SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast", "auth", "storage", "realtime", "supabase_functions",
                  "extensions", "graphql", "graphql_public", "net", "pgsodium", "pgsodium_masks", "vault", "cron",
                  "supabase_migrations", "_realtime", "_analytics", "pgbouncer", "pgtle", "_supavisor"}


class DbError(Exception):
    pass


def db_conf(dbid):
    d = next((d for d in DATABASES if d["id"] == dbid), None)
    if not d:
        raise DbError("Нет такой базы")
    return d


def psql(d, sql, csv_mode=False, timeout=30):
    cmd = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", RO_ROLE, "-d", d["db"]]
    cmd += ["--csv", "-P", f"null={NULL}"] if csv_mode else ["-A", "-t"]
    code, out, err = docker_exec(d["container"], cmd + ["-c", sql], timeout=timeout)
    if code != 0:
        msg = re.sub(r"^psql:(<stdin>|):?\d*:?\s*", "", err.strip()).replace("ERROR:  ", "")
        raise DbError(msg or f"psql завершился с кодом {code}")
    return out


def psql_json(d, sql):
    out = psql(d, f"select coalesce(json_agg(t), '[]') from ({sql}) t").strip()
    return json.loads(out or "[]")


def qi(name):
    return '"' + name.replace('"', '""') + '"'


def ql(value):
    return "'" + str(value).replace("'", "''") + "'"


def db_list():
    out = []
    for d in DATABASES:
        item = {k: d[k] for k in ("id", "name", "project")}
        try:
            r = psql_json(d, f"""select pg_database_size(current_database()) as size,
                (select count(*) from pg_stat_activity where datname = current_database()) as connections,
                (select setting from pg_settings where name = 'server_version') as version""")[0]
            item.update(r, ok=True)
        except Exception as e:  # noqa: BLE001
            item.update(ok=False, error=str(e)[:200])
        out.append(item)
    return out


def db_tables(dbid):
    d = db_conf(dbid)
    rows = psql_json(d, """
        select n.nspname as schema, c.relname as name, c.relkind as kind,
               greatest(c.reltuples, 0)::bigint as rows_est,
               pg_total_relation_size(c.oid) as size, c.relrowsecurity as rls
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p','v','m','f') and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        order by n.nspname, c.relname""")
    for r in rows:
        r["system"] = r["schema"] in SYSTEM_SCHEMAS
    return {"db": dbid, "tables": rows}


def table_columns(d, schema, table):
    cols = psql_json(d, f"""
        select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
               coalesce(a.attnum = any(i.indkey), false) as pk
        from pg_attribute a
        left join pg_index i on i.indrelid = a.attrelid and i.indisprimary
        where a.attrelid = {ql(qi(schema) + '.' + qi(table))}::regclass and a.attnum > 0 and not a.attisdropped
        order by a.attnum""")
    if not cols:
        raise DbError("Таблица не найдена")
    return cols


OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}


def db_rows(dbid, schema, table, limit, offset, order, direction, filters):
    d = db_conf(dbid)
    cols = table_columns(d, schema, table)
    names = {c["name"] for c in cols}
    where = []
    for f in filters[:10]:
        col, op, val = f.get("col"), f.get("op"), str(f.get("val", ""))
        if col not in names:
            raise DbError(f"Нет колонки {col}")
        c = qi(col)
        if op == "null":
            where.append(f"{c} is null")
        elif op == "notnull":
            where.append(f"{c} is not null")
        elif op == "like":
            where.append(f"{c}::text ilike {ql('%' + val + '%')}")
        elif op in ("eq", "neq"):
            where.append(f"{c}::text {OPS[op]} {ql(val)}")  # как текст — работает для uuid, enum, jsonb
        elif op in OPS:
            where.append(f"{c} {OPS[op]} {ql(val)}")
        else:
            raise DbError("Неизвестный оператор фильтра")
    w = (" where " + " and ".join(where)) if where else ""
    src = f"{qi(schema)}.{qi(table)}"
    if order in names:
        ob = f" order by {qi(order)} {'desc' if direction == 'desc' else 'asc'} nulls last"
    else:
        pk = [c["name"] for c in cols if c["pk"]]
        ob = (" order by " + ", ".join(qi(p) for p in pk)) if pk else ""
    t0 = time.time()
    rows = psql_json(d, f"select * from {src}{w}{ob} limit {int(limit)} offset {int(offset)}")
    ms = int((time.time() - t0) * 1000)
    try:  # точный счёт на большой таблице может быть долгим — тогда оценка из статистики
        total = int(psql(d, f"set statement_timeout = '3s'; select count(*) from {src}{w}").strip().splitlines()[-1])
        exact = True
    except (DbError, ValueError, IndexError):
        total = int(psql(d, f"select greatest(reltuples,0)::bigint from pg_class where oid = {ql(src)}::regclass").strip() or 0)
        exact = False
    return {"columns": cols, "rows": rows, "total": total, "exact": exact, "ms": ms}


def db_structure(dbid, schema, table):
    d = db_conf(dbid)
    reg = ql(qi(schema) + "." + qi(table))
    return {
        "columns": psql_json(d, f"""
            select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
                   pg_get_expr(ad.adbin, ad.adrelid) as "default", col_description(a.attrelid, a.attnum) as comment
            from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
            where a.attrelid = {reg}::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum"""),
        "constraints": psql_json(d, f"""select conname as name, contype as type, pg_get_constraintdef(oid) as def
            from pg_constraint where conrelid = {reg}::regclass order by contype, conname"""),
        "indexes": psql_json(d, f"""select i.relname as name, pg_get_indexdef(i.oid) as def,
                   pg_relation_size(i.oid) as size, x.indisunique as uniq, coalesce(s.idx_scan, 0) as scans
            from pg_index x join pg_class i on i.oid = x.indexrelid
            left join pg_stat_all_indexes s on s.indexrelid = i.oid
            where x.indrelid = {reg}::regclass order by i.relname"""),
        "policies": psql_json(d, f"""select policyname as name, cmd, roles::text as roles, qual, with_check
            from pg_policies where schemaname = {ql(schema)} and tablename = {ql(table)} order by policyname"""),
        "triggers": psql_json(d, f"""select tgname as name, pg_get_triggerdef(oid) as def from pg_trigger
            where tgrelid = {reg}::regclass and not tgisinternal order by tgname"""),
        "info": (psql_json(d, f"""select c.relrowsecurity as rls, pg_total_relation_size(c.oid) as size,
                   greatest(c.reltuples,0)::bigint as rows_est, obj_description(c.oid) as comment,
                   s.seq_scan, s.idx_scan, s.n_tup_ins, s.n_tup_upd, s.n_tup_del, s.n_dead_tup,
                   s.last_autovacuum, s.last_autoanalyze
            from pg_class c left join pg_stat_all_tables s on s.relid = c.oid
            where c.oid = {reg}::regclass""") or [{}])[0],
    }


def db_sql(dbid, sql, max_rows=1000):
    import csv
    import io
    d = db_conf(dbid)
    if not sql.strip():
        raise DbError("Пустой запрос")
    t0 = time.time()
    out = psql(d, sql, csv_mode=True, timeout=40)
    ms = int((time.time() - t0) * 1000)
    rd = csv.reader(io.StringIO(out))
    header = next(rd, None)
    if header is None:
        return {"columns": [], "rows": [], "ms": ms, "message": "Выполнено, строк нет"}
    rows, truncated = [], False
    for row in rd:
        if len(rows) >= max_rows:
            truncated = True
            break
        rows.append([None if v == NULL else v for v in row])
    return {"columns": header, "rows": rows, "ms": ms, "truncated": truncated}


def db_activity(dbid):
    d = db_conf(dbid)
    return {
        "activity": psql_json(d, """
            select pid, usename as "user", application_name as app, client_addr::text as client, state,
                   extract(epoch from now() - query_start)::int as secs, wait_event_type as wait, left(query, 400) as query
            from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
            order by state = 'active' desc, query_start nulls last limit 100"""),
        "locks": psql_json(d, """
            select l.pid, l.mode, l.locktype, c.relname as rel, left(a.query, 200) as query
            from pg_locks l left join pg_class c on c.oid = l.relation
            join pg_stat_activity a on a.pid = l.pid where not l.granted limit 50"""),
    }


def db_advisor(dbid):
    """Советник производительности (как Performance Advisor в Supabase): находки + готовый SQL для исправления.
    Панель ничего не исправляет сама — только показывает."""
    d = db_conf(dbid)
    stats = (psql_json(d, """
        select round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) as cache_hit,
               (select round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2)
                  from pg_statio_user_indexes) as index_hit,
               numbackends as connections, deadlocks, temp_files, temp_bytes, xact_commit, xact_rollback,
               (select setting::int from pg_settings where name = 'max_connections') as max_connections,
               pg_database_size(datname) as size, stats_reset
        from pg_stat_database where datname = current_database()""") or [{}])[0]
    findings = []
    # 1. Внешние ключи без индекса — медленные join и удаления в родительской таблице
    for r in psql_json(d, """
        select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def,
               string_agg(a.attname, ', ' order by k.n) as cols,
               (select n_live_tup from pg_stat_user_tables s where s.relid = c.conrelid) as live
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality k(attnum, n)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        join pg_namespace ns on ns.oid = (select relnamespace from pg_class where oid = c.conrelid)
        where c.contype = 'f' and ns.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','supabase_functions','extensions','net','vault','cron','pgsodium','graphql')
          and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                          and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
                          and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] <@ c.conkey)
        group by c.oid, c.conrelid, c.conname order by live desc nulls last limit 40"""):
        findings.append({"kind": "fk_no_index", "level": "warn" if (r["live"] or 0) > 1000 else "info",
                         "title": f"Внешний ключ без индекса: {r['tbl']} ({r['cols']})",
                         "detail": f"{r['def']}. Join по этой связи и удаление строк в родительской таблице читают {r['tbl']} целиком. Строк: {r['live'] or 0}.",
                         "sql": f"create index concurrently on {r['tbl']} ({r['cols']});"})
    # 2. Таблицы, которые чаще читаются целиком, чем по индексу
    for r in psql_json(d, """
        select schemaname || '.' || relname as tbl, seq_scan, seq_tup_read, idx_scan, n_live_tup as live
        from pg_stat_user_tables
        where n_live_tup > 5000 and seq_scan > 50 and seq_scan > coalesce(idx_scan, 0)
        order by seq_tup_read desc limit 15"""):
        findings.append({"kind": "seq_scan", "level": "warn",
                         "title": f"Чтение целиком: {r['tbl']}",
                         "detail": f"{r['seq_scan']} полных просмотров против {r['idx_scan'] or 0} по индексу, прочитано {r['seq_tup_read']} строк, в таблице {r['live']}. Найдите запросы к ней в «Медленных запросах» и добавьте индекс по их условиям.",
                         "sql": None})
    # 3. Индексы, которые ни разу не использовались (кроме первичных и уникальных — они держат ограничения)
    for r in psql_json(d, """
        select s.schemaname || '.' || s.indexrelname as idx, s.schemaname || '.' || s.relname as tbl,
               pg_relation_size(s.indexrelid) as size, s.idx_scan
        from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
        where s.idx_scan = 0 and not i.indisprimary and not i.indisunique
          and pg_relation_size(s.indexrelid) > 64 * 1024
        order by pg_relation_size(s.indexrelid) desc limit 20"""):
        findings.append({"kind": "unused_index", "level": "info",
                         "title": f"Индекс не используется: {r['idx']}",
                         "detail": f"На {r['tbl']}, занимает {r['size']} байт и замедляет каждую запись. 0 обращений с момента сброса статистики ({stats.get('stats_reset') or 'с запуска'}) — если база работает недавно, подождите.",
                         "sql": f"drop index concurrently {r['idx']};", "size": r["size"]})
    # 4. Мёртвые строки — autovacuum не успевает
    for r in psql_json(d, """
        select schemaname || '.' || relname as tbl, n_live_tup as live, n_dead_tup as dead, last_autovacuum
        from pg_stat_user_tables where n_dead_tup > 1000 and n_dead_tup > n_live_tup * 0.2
        order by n_dead_tup desc limit 15"""):
        findings.append({"kind": "dead_tuples", "level": "warn",
                         "title": f"Много мёртвых строк: {r['tbl']}",
                         "detail": f"{r['dead']} мёртвых на {r['live']} живых, последний autovacuum: {r['last_autovacuum'] or 'никогда'}.",
                         "sql": f"vacuum (analyze) {r['tbl']};"})
    # 5. Дубликаты индексов
    # Удалять предлагаем только индекс, который не держит ограничение (первичный ключ, unique, exclude):
    # такие удаляются вместе с ограничением, и «лишний» может оказаться единственной защитой уникальности.
    for r in psql_json(d, """
        select indrelid::regclass::text as tbl,
               json_agg(json_build_object('name', indexrelid::regclass::text, 'pk', indisprimary,
                        'uniq', indisunique,
                        'con', exists (select 1 from pg_constraint c where c.conindid = x.indexrelid))
                        order by indisprimary desc, indisunique desc) as idx
        from pg_index x join pg_class t on t.oid = x.indrelid join pg_namespace n on n.oid = t.relnamespace
        where n.nspname !~ '^pg_'
        group by indrelid, indkey, indclass, indexprs::text, indpred::text
        having count(*) > 1 limit 20"""):
        idx = r["idx"]
        removable = [i for i in idx if not i["con"] and not i["pk"]]
        # если все — ограничения, ничего не предлагаем; если нет ни одного ограничения — оставляем первый
        if len(removable) == len(idx):
            removable = removable[1:]
        names = ", ".join(i["name"] for i in idx)
        findings.append({"kind": "dup_index", "level": "warn" if removable else "info",
                         "title": f"Одинаковые индексы на {r['tbl']}",
                         "detail": f"{names} — индексы по одним и тем же колонкам. "
                                   + ("Лишний только тратит место и замедляет каждую запись."
                                      if removable else "Все они держат ограничения — удалять их надо через само ограничение, вручную."),
                         "sql": "\n".join(f"drop index concurrently {i['name']};" for i in removable) or None})
    # 6. Таблицы без первичного ключа
    for r in psql_json(d, """
        select n.nspname || '.' || c.relname as tbl, greatest(c.reltuples,0)::bigint as rows
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','supabase_functions','extensions','net','vault','cron','pgsodium','graphql','_realtime','supabase_migrations')
          and n.nspname !~ '^pg_' and not exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary)
        limit 20"""):
        findings.append({"kind": "no_pk", "level": "info", "title": f"Нет первичного ключа: {r['tbl']}",
                         "detail": f"Строк: {r['rows']}. Без него нельзя надёжно адресовать строку, а репликация и некоторые инструменты отказываются работать.",
                         "sql": None})
    if stats.get("cache_hit") is not None and stats["cache_hit"] < 99 and (stats.get("size") or 0) > 50 * 1024 * 1024:
        findings.insert(0, {"kind": "cache", "level": "warn", "title": f"Попадание в кэш {stats['cache_hit']}%",
                            "detail": "Меньше 99% — база часто читает с диска. Обычно лечится индексами или увеличением shared_buffers.",
                            "sql": "show shared_buffers;"})
    if stats.get("max_connections") and stats.get("connections", 0) > 0.8 * stats["max_connections"]:
        findings.insert(0, {"kind": "conn", "level": "warn", "title": "Подключений почти под лимит",
                            "detail": f"{stats['connections']} из {stats['max_connections']}.", "sql": None})
    # Медленные запросы: pg_stat_statements лежит в public (обычный Postgres) или в extensions (Supabase).
    top = None  # None — расширение в этой базе не подключено
    ext = psql(d, "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace "
                  "where e.extname = 'pg_stat_statements'").strip()
    if ext:
        top = psql_json(d, f"""
            select calls, round(total_exec_time)::bigint as total_ms, round(mean_exec_time::numeric, 1) as mean_ms,
                   round(max_exec_time::numeric, 1) as max_ms, rows,
                   round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 1) as hit,
                   left(query, 1500) as query
            from {qi(ext)}.pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
              and query not ilike '%pg_stat_statements%'
            order by total_exec_time desc limit 30""")
    rank = {"warn": 0, "info": 1}
    findings.sort(key=lambda f: rank.get(f["level"], 2))
    return {"stats": stats, "findings": findings, "top": top}


def setup_db_roles():
    """Роль только для чтения во всех кластерах (запускается из install.sh: server.py setup-db)."""
    sql = f"""
do $$ begin
  if not exists (select from pg_roles where rolname = '{RO_ROLE}') then
    create role {RO_ROLE} login bypassrls;
  end if;
end $$;
alter role {RO_ROLE} login bypassrls nosuperuser nocreatedb nocreaterole noreplication connection limit 8;
grant pg_read_all_data to {RO_ROLE};
grant pg_read_all_stats to {RO_ROLE};
alter role {RO_ROLE} set default_transaction_read_only = on;
alter role {RO_ROLE} set statement_timeout = '20s';
alter role {RO_ROLE} set idle_in_transaction_session_timeout = '30s';"""
    done = set()
    for d in DATABASES:
        if d["container"] in done:
            continue
        done.add(d["container"])
        code, out, err = docker_exec(d["container"], ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                                                      "-U", d["admin"], "-d", d["db"], "-c", sql])
        print(d["container"], "ok" if code == 0 else "ОШИБКА: " + err.strip())


# ── Ошибки и журналы (как Logs в Vercel/Supabase) ──────────────────────────────
# Источники: журналы контейнеров, systemd-службы, файлы. Ошибки группируются по «отпечатку»
# (сообщение без чисел, id, времени) — как Issues в Sentry: сколько раз, когда первый/последний.
class LogError(Exception):
    pass


def log_sources():
    with LOCK:
        cs = list(CONTAINERS["items"])
    if not cs:
        cs = [{"name": c["Names"][0].lstrip("/"), "dir": c["Labels"].get("com.docker.compose.project.working_dir", "")}
              for c in docker_get("/containers/json?all=1")]
    src = [{"id": "c:" + c["name"], "name": c["name"], "kind": "container", "project": project_of(c)} for c in cs]
    for p in PROJECTS:
        for u in p.get("units", []):
            src.append({"id": "u:" + u, "name": u, "kind": "service", "project": p["id"]})
        for k in p.get("logs", {}):
            src.append({"id": f"f:{p['id']}:{k}", "name": f"{p['name']} · {k}", "kind": "file", "project": p["id"]})
    return src


def _parse_ts(s):
    try:
        return calendar.timegm(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, TypeError):
        return None


def read_source(sid, since_s=None, tail=2000):
    """Строки источника: [(unix_ts | None, текст)]."""
    kind, _, rest = sid.partition(":")
    lines = []
    if kind == "c":
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", rest):
            raise LogError("Плохое имя контейнера")
        q = f"stdout=1&stderr=1&timestamps=1&tail={int(tail)}"
        if since_s:
            q += f"&since={int(time.time() - since_s)}"
        text = demux_logs(docker_get(f"/containers/{rest}/logs?{q}", raw=True, timeout=20))
        for ln in text.splitlines():
            ts, _, msg = ln.partition(" ")
            lines.append((_parse_ts(ts), msg))
    elif kind == "u":
        if rest not in {u for p in PROJECTS for u in p.get("units", [])}:
            raise LogError("Нет такой службы")
        args = ["journalctl", "-u", rest, "-o", "short-unix", "--no-pager", "-n", str(int(tail))]
        if since_s:
            args += ["--since", f"-{int(since_s)}s"]
        out = subprocess.run(args, capture_output=True, text=True, timeout=20).stdout
        for ln in out.splitlines():
            ts, _, msg = ln.partition(" ")
            try:
                t = int(float(ts))
            except ValueError:
                continue  # «-- No entries --» и прочие служебные строки
            lines.append((t, re.sub(r"^\S+ [^:]+: ", "", msg)))
    elif kind == "f":
        pid, _, key = rest.partition(":")
        proj = next((p for p in PROJECTS if p["id"] == pid), None)
        path = proj and proj.get("logs", {}).get(key)
        if not path:
            raise LogError("Нет такого журнала")
        for ln in (tail_bytes(path, 2_000_000) or "").splitlines()[-int(tail):]:
            m = re.match(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)", ln)
            lines.append((_parse_ts(m.group(1)) if m else None, ln))
    else:
        raise LogError("Неизвестный источник")
    return lines


ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
# Шум, который выглядит как ошибка, но ей не является (проверено на журналах cloud-001).
NOT_ERRORS = re.compile(r"Failed to find Server Action|aborting with incomplete response|"
                        r"\b0 errors?\b|errors?: 0\b|error_count\W+0|\"error\":\s*(null|false)|"
                        r"OnError|ErrorBoundary|errorPage", re.I)


ACCESS_LOG = re.compile(r'"(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) [^"]*HTTP/[\d.]+" (\d{3}) ')


def level_of(msg):
    m = msg.lower()
    a = ACCESS_LOG.search(msg)
    if a:  # строка журнала доступа (nginx/envoy): уровень по коду ответа, а не по словам в адресе
        code = int(a.group(1))
        return "error" if code >= 500 else "warn" if code >= 400 else "info"
    if re.search(r'"level"\s*:\s*"(error|fatal|panic)"|\blevel=(error|fatal)\b|\[(error|fatal)\]|^\s*(error|fatal)\b[:\s]', m):
        return "error"
    if re.search(r'"level"\s*:\s*"warn|\blevel=warn|\[warn', m):
        return "warn"
    if re.search(r'"level"\s*:\s*"(info|debug)"|\blevel=(info|debug)\b', m):
        return "info"
    if NOT_ERRORS.search(msg):
        return "info"
    if re.search(r"\b(error|fatal|panic|exception|traceback|uncaught|unhandled|econnrefused|etimedout|"
                 r"out of memory|segfault|permission denied)\b|ошибк|упал", m):
        return "error"
    if re.search(r"\b(warn|warning|deprecated)\b|предупрежд", m):
        return "warn"
    return "info"


def fingerprint(msg):
    s = ANSI.sub("", msg)
    # logfmt (docker) и JSON (caddy): группируем по самому сообщению, без адресов и портов в остальных полях
    m = re.search(r'\bmsg="((?:[^"\\]|\\.)*)"', s) or re.search(r'"msg"\s*:\s*"((?:[^"\\]|\\.)*)"', s)
    if m:
        s = m.group(1)
        s = re.sub(r"\S+:\d{2,5}(->\S+:\d{2,5})?", "<addr>", s)
    s = re.sub(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "<uuid>", s, flags=re.I)
    s = re.sub(r"\d{4}-\d\d-\d\d[T ][\d:.]+Z?", "<time>", s)
    s = re.sub(r"\b(c[a-z0-9]{20,}|[0-9a-f]{12,})\b", "<id>", s)
    s = re.sub(r"\d+", "N", s)
    return s.strip()[:220]


ERR_CACHE = {}


ERR_BUSY = set()


def errors_report(hours):
    """Отчёт об ошибках. Сбор занимает 4–6 с (35 источников, journald 3,5 ГБ), поэтому:
    свежий кэш — сразу; устаревший — тоже сразу, а пересчёт уходит в фон; без кэша — ждём."""
    hit = ERR_CACHE.get(hours)
    if hit and time.time() - hit[0] < 55:
        return hit[1]
    if hit:
        _errors_refresh_async(hours)
        return hit[1]
    return _errors_build(hours)


def _errors_refresh_async(hours):
    with LOCK:
        if hours in ERR_BUSY:
            return
        ERR_BUSY.add(hours)

    def run():
        try:
            _errors_build(hours)
        except Exception as e:  # noqa: BLE001
            print("errors refresh:", e, flush=True)
        finally:
            with LOCK:
                ERR_BUSY.discard(hours)
    threading.Thread(target=run, daemon=True).start()


def errors_warmer():
    """Пока панель открыта — держит отчёты за 1 ч (значок в меню) и 24 ч тёплыми."""
    for h in (1, 24):  # после рестарта сразу, чтобы первое открытие не ждало
        _errors_refresh_async(h)
    while True:
        if time.time() - LAST_VIEW[0] < 600:
            for h in (1, 24):
                hit = ERR_CACHE.get(h)
                if not hit or time.time() - hit[0] > 45:
                    _errors_refresh_async(h)
        time.sleep(15)


ERR_BUILD = threading.Lock()  # сборки строго по одной: три параллельных съедали 200 МБ (MemoryMax)


def _errors_build(hours):
    with ERR_BUILD:
        hit = ERR_CACHE.get(hours)
        if hit and time.time() - hit[0] < 30:  # пока ждали замок, отчёт уже собрал кто-то другой
            return hit[1]
        return _errors_collect(hours)


def _errors_collect(hours):
    since = int(hours * 3600)
    now = time.time()
    bucket = max(300, since // 48)
    start = int((now - since) // bucket * bucket)
    buckets = list(range(start, int(now) + 1, bucket))
    groups, timeline = {}, collections.Counter()

    def scan(src):
        try:
            return src, read_source(src["id"], since_s=since, tail=20000)
        except Exception:  # noqa: BLE001
            return src, []

    srcs = [s for s in log_sources() if s["kind"] in ("container", "service")]
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        for src, lines in ex.map(scan, srcs):
            for t, msg in lines:
                if not msg.strip() or level_of(msg) != "error" or (t and now - t > since):
                    continue
                key = src["id"] + "|" + fingerprint(msg)
                g = groups.get(key)
                if not g:
                    g = groups[key] = {"source": src["name"], "sid": src["id"], "project": src["project"],
                                       "fp": fingerprint(msg), "message": "", "count": 0, "first": t, "last": None,
                                       "spark": collections.Counter()}
                g["count"] += 1
                if t:
                    g["first"] = min(g["first"] or t, t)
                    b = int(t // bucket * bucket)
                    g["spark"][b] += 1
                    timeline[b] += 1
                if not g["last"] or (t and t >= g["last"]):
                    g["last"] = t
                    g["message"] = ANSI.sub("", msg).strip()[:2000]
    items = sorted(groups.values(), key=lambda g: g["last"] or 0, reverse=True)
    for g in items:
        g["spark"] = [g["spark"].get(b, 0) for b in buckets]
    data = {"hours": hours, "bucket": bucket, "buckets": buckets, "timeline": [timeline.get(b, 0) for b in buckets],
            "groups": items[:300], "total": sum(g["count"] for g in items), "sources": len(srcs)}
    ERR_CACHE[hours] = (time.time(), data)
    return data


def logs_query(sids, q, level, minutes, limit):
    rx = None
    if q:
        try:
            rx = re.compile(q, re.I)
        except re.error:
            rx = re.compile(re.escape(q), re.I)

    def one(sid):
        try:
            return sid, read_source(sid, since_s=minutes * 60 if minutes else None, tail=5000)
        except Exception as e:  # noqa: BLE001
            return sid, [(None, f"[не удалось прочитать: {e}]")]

    out = []
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for sid, lines in ex.map(one, sids[:40]):
            for t, msg in lines:
                if rx and not rx.search(msg):
                    continue
                lv = level_of(msg)
                if (level == "error" and lv != "error") or (level == "warn" and lv == "info"):
                    continue
                out.append({"t": t, "src": sid, "lv": lv, "msg": ANSI.sub("", msg)[:4000]})
    out.sort(key=lambda r: r["t"] or 0)
    return {"lines": out[-limit:], "matched": len(out)}


def cron_report():
    """Задачи по расписанию: что и когда запускается (из /etc/cron.d), последние запуски из журналов."""
    jobs = []
    for f in sorted(os.listdir("/etc/cron.d")):
        if f.startswith(".") or f in ("e2scrub_all", "sysstat", "atop"):
            continue
        try:
            text = open(os.path.join("/etc/cron.d", f)).read()
        except OSError:
            continue
        for ln in text.splitlines():
            m = re.match(r"^\s*([\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+)\s+(\S+)\s+(.+)$", ln)
            if not m or ln.lstrip().startswith("#"):
                continue
            cmd = m.group(3)
            name = (re.search(r"/api/cron/([\w-]+)", cmd) or re.search(r"/([\w.-]+\.sh)", cmd) or re.search(r"(\S+)", cmd)).group(1)
            jobs.append({"file": f, "schedule": m.group(1), "name": name, "cmd": cmd[:300]})
    tails = {}

    def tail_of(path):
        if path not in tails:
            tails[path] = (tail_bytes(path, 300_000) or "").splitlines()
        return tails[path]

    for j in jobs:
        pid = "commrent" if j["file"].startswith("commrent") else "orda" if j["file"].startswith("orda") else \
            "jiyn" if j["file"].startswith("jiyn") else None
        j["project"] = pid
        logs = next((p.get("logs", {}) for p in PROJECTS if p["id"] == pid), {})
        # Где искать итог: файл из «>> /var/log/…» в самой строке крона, иначе журнал бэкапа или крона проекта.
        redirect = re.search(r">>\s*(/var/log/\S+)", j["cmd"])
        if redirect:
            path, match = redirect.group(1), None
        elif "backup" in j["name"] and logs.get("backup"):
            path, match = logs["backup"], None
        else:
            path, match = logs.get("cron"), j["name"]
        last = None
        for ln in reversed(tail_of(path) if path else []):
            if ln.strip() and (match is None or match in ln):
                last = ANSI.sub("", ln)[:400]
                break
        j["last"] = last
    return {"jobs": jobs}


# ── Вход ───────────────────────────────────────────────────────────────────────
# Пароль хранится только как scrypt-хеш в /var/lib/server-status/auth.json. Сессия — подписанная
# кука (HMAC ключом из того же файла); смена пароля меняет ключ, и все остальные сессии гаснут.
STATE_DIR = os.environ.get("STATE_DIRECTORY", "/var/lib/server-status")
AUTH_FILE = os.path.join(STATE_DIR, "auth.json")
COOKIE = "cs_session"
SESSION_DAYS = 30
MAX_FAILS, LOCK_MINUTES = 5, 15
AUTH = {}
FAILS = {}  # ip -> [время неудачных попыток]


def _hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, maxmem=64 * 1024 * 1024).hex()


def auth_set(user, password):
    salt = secrets.token_bytes(16)
    data = {"user": user, "salt": salt.hex(), "hash": _hash(password, salt),
            "key": secrets.token_hex(32), "changed": int(time.time())}
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = AUTH_FILE + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(data, f)
    os.replace(tmp, AUTH_FILE)
    AUTH.clear()
    AUTH.update(data)


def auth_load():
    try:
        with open(AUTH_FILE) as f:
            AUTH.update(json.load(f))
    except FileNotFoundError:
        print("auth: пароль не задан — войти нельзя. Задать: STATUS_PASSWORD=... python3 server.py set-password", flush=True)


def auth_verify(user, password):
    if not AUTH or not password:
        return False
    ok_user = hmac.compare_digest(user.strip().lower(), AUTH["user"].lower())
    ok_pass = hmac.compare_digest(_hash(password, bytes.fromhex(AUTH["salt"])), AUTH["hash"])
    return ok_user and ok_pass


def _sign(payload):
    return hmac.new(bytes.fromhex(AUTH["key"]), payload.encode(), hashlib.sha256).hexdigest()


def auth_cookie(remember):
    exp = int(time.time()) + SESSION_DAYS * 86400
    payload = f"{exp}.{secrets.token_hex(8)}"
    age = f"; Max-Age={SESSION_DAYS * 86400}" if remember else ""
    return f"{COOKIE}={payload}.{_sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict{age}"


def auth_check_cookie(header):
    if not AUTH:
        return False
    for part in header.split(";"):
        k, _, v = part.strip().partition("=")
        if k == COOKIE:
            payload, _, sig = v.rpartition(".")
            try:
                exp = int(payload.split(".")[0])
            except ValueError:
                return False
            return exp > time.time() and hmac.compare_digest(_sign(payload), sig)
    return False


def auth_locked(ip):
    now = time.time()
    with LOCK:
        recent = [t for t in FAILS.get(ip, []) if now - t < LOCK_MINUTES * 60]
        FAILS[ip] = recent
    return int(LOCK_MINUTES * 60 - (now - recent[0])) if len(recent) >= MAX_FAILS else 0


def auth_fail(ip):
    with LOCK:
        FAILS.setdefault(ip, []).append(time.time())
        return MAX_FAILS - len(FAILS[ip])


def auth_reset_fails(ip):
    with LOCK:
        FAILS.pop(ip, None)


def password_problem(pw, login):
    if len(pw) < 10:
        return "Минимум 10 символов"
    if len(pw) > 200:
        return "Слишком длинный пароль"
    if pw.lower() == login.lower() or pw.lower() in ("password123", "qwerty12345", "1234567890"):
        return "Слишком простой пароль"
    if len(set(pw)) < 5:
        return "Слишком однообразный пароль"
    return None


# ── HTTP ───────────────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8", headers=()):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def page(self, name):
        with open(os.path.join(HERE, name), "rb") as f:
            return self.send(200, f.read(), "text/html; charset=utf-8")

    def client_ip(self):
        # Сюда ходит только Caddy, он кладёт адрес клиента в X-Forwarded-For.
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def session_ok(self):
        return auth_check_cookie(self.headers.get("Cookie", ""))

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        # Защита от подделки запроса с чужого сайта: кука SameSite=Strict + только JSON + свой Origin.
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403, json.dumps({"error": "Чужой источник запроса"}))
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.send(415, "{}")
        try:
            data = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 10_000)) or b"{}")
        except ValueError:
            return self.send(400, "{}")
        ip = self.client_ip()
        if u.path == "/api/login":
            wait = auth_locked(ip)
            if wait:
                return self.send(429, json.dumps({"error": f"Слишком много попыток. Попробуйте через {wait // 60 + 1} мин."},
                                                 ensure_ascii=False))
            if auth_verify(str(data.get("login", "")), str(data.get("password", ""))):
                auth_reset_fails(ip)
                print(f"auth: вход {ip}", flush=True)
                return self.send(200, '{"ok":true}', headers=[("Set-Cookie", auth_cookie(data.get("remember", True)))])
            left = auth_fail(ip)
            print(f"auth: неверный пароль {ip}", flush=True)
            msg = "Неверный логин или пароль" + (f". Осталось попыток: {left}" if 0 < left < 3 else "")
            if left <= 0:
                msg = f"Вход заблокирован на {LOCK_MINUTES} минут — слишком много неверных попыток"
            return self.send(401, json.dumps({"error": msg}, ensure_ascii=False))
        if not self.session_ok():
            return self.send(401, json.dumps({"error": "Сессия истекла, войдите снова"}, ensure_ascii=False))
        if u.path == "/api/db/sql":
            try:
                res = db_sql(str(data.get("db", "")), str(data.get("sql", ""))[:100_000])
            except DbError as e:
                return self.send(400, json.dumps({"error": str(e)}, ensure_ascii=False))
            print(f"db: sql в {data.get('db')} с {ip}", flush=True)
            return self.send(200, json.dumps(res, ensure_ascii=False))
        if u.path == "/api/logout":
            return self.send(200, '{"ok":true}', headers=[("Set-Cookie", f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict")])
        if u.path == "/api/password":
            cur, new = str(data.get("current", "")), str(data.get("new", ""))
            login = str(data.get("login") or AUTH["user"]).strip()
            if not auth_verify(AUTH["user"], cur):
                return self.send(400, json.dumps({"error": "Текущий пароль неверный", "field": "current"}, ensure_ascii=False))
            problem = password_problem(new, login)
            if problem:
                return self.send(400, json.dumps({"error": problem, "field": "new"}, ensure_ascii=False))
            if not re.fullmatch(r"[A-Za-z0-9._@-]{3,40}", login):
                return self.send(400, json.dumps({"error": "Логин: 3–40 символов, латиница, цифры, . _ @ -",
                                                  "field": "login"}, ensure_ascii=False))
            auth_set(login, new)  # меняет и ключ сессий — все остальные устройства выйдут
            print(f"auth: пароль изменён с {ip}", flush=True)
            return self.send(200, json.dumps({"ok": True, "user": login}), headers=[("Set-Cookie", auth_cookie(True))])
        return self.send(404, "{}")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        try:
            if u.path == "/login":
                return self.page("login.html")
            if not self.session_ok():
                if u.path.startswith("/api/"):
                    return self.send(401, json.dumps({"error": "unauthorized"}))
                return self.send(302, "", headers=[("Location", "/login")])
            if u.path == "/":
                return self.page("index.html")
            if u.path in ("/views.js", "/views.css", "/db.js"):
                with open(os.path.join(HERE, u.path[1:]), "rb") as f:
                    ctype = "text/javascript" if u.path.endswith(".js") else "text/css"
                    return self.send(200, f.read(), ctype + "; charset=utf-8")
            if u.path == "/api/me":
                return self.send(200, json.dumps({"user": AUTH["user"], "changed": AUTH.get("changed")}))
            arg = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
            if u.path == "/api/errors":
                hours = max(1, min(int(arg("hours", "24") or 24), 24 * 14))
                LAST_VIEW[0] = time.time()
                return self.send(200, json.dumps(errors_report(hours), ensure_ascii=False))
            if u.path == "/api/log-sources":
                return self.send(200, json.dumps(log_sources(), ensure_ascii=False))
            if u.path == "/api/log-search":
                sids = [s for s in arg("src").split(",") if s]
                minutes = int(arg("minutes", "60") or 0)
                limit = max(50, min(int(arg("limit", "1000") or 1000), 5000))
                return self.send(200, json.dumps(logs_query(sids, arg("q"), arg("level"), minutes, limit), ensure_ascii=False))
            if u.path == "/api/cron":
                return self.send(200, json.dumps(cron_report(), ensure_ascii=False))
            if u.path.startswith("/api/db/"):
                try:
                    what = u.path[len("/api/db/"):]
                    if what == "list":
                        res = db_list()
                    elif what == "tables":
                        res = db_tables(arg("db"))
                    elif what == "rows":
                        res = db_rows(arg("db"), arg("schema"), arg("table"),
                                      max(1, min(int(arg("limit", "50") or 50), 500)), max(0, int(arg("offset", "0") or 0)),
                                      arg("order"), arg("dir"), json.loads(arg("f", "[]") or "[]"))
                    elif what == "structure":
                        res = db_structure(arg("db"), arg("schema"), arg("table"))
                    elif what == "activity":
                        res = db_activity(arg("db"))
                    elif what == "advisor":
                        res = db_advisor(arg("db"))
                    else:
                        return self.send(404, "{}")
                except DbError as e:
                    return self.send(400, json.dumps({"error": str(e)}, ensure_ascii=False))
                return self.send(200, json.dumps(res, ensure_ascii=False, default=str))
            if u.path == "/api/history":
                rng = max(3600, min(int(arg("range", "86400") or 86400), 31 * 86400))
                return self.send(200, json.dumps(sys_history(rng)))
            if u.path == "/api/uptime":
                return self.send(200, json.dumps(uptime_report()))
            if u.path == "/api/container-history":
                rng = max(3600, min(int(arg("range", "86400") or 86400), 8 * 86400))
                return self.send(200, json.dumps(container_history([n for n in arg("names").split(",") if n], rng)))
            if u.path == "/api/deploy-log":
                return self.send(200, deploy_log(arg("project"), int(arg("start", "0") or 0), arg("sha")),
                                 "text/plain; charset=utf-8")
            if u.path == "/api/state":
                LAST_VIEW[0] = time.time()
                return self.send(200, json.dumps(build_state(), ensure_ascii=False))
            if u.path == "/api/logs":
                tail = min(int(q.get("tail", ["300"])[0]), 2000)
                if "container" in q:
                    name = q["container"][0]
                    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
                        return self.send(400, "{}")
                    data = docker_get(f"/containers/{name}/logs?stdout=1&stderr=1&timestamps=1&tail={tail}",
                                      raw=True)
                    return self.send(200, demux_logs(data), "text/plain; charset=utf-8")
                proj = next((p for p in PROJECTS if p["id"] == q.get("project", [""])[0]), None)
                path = proj and proj.get("logs", {}).get(q.get("log", [""])[0])
                if not path:
                    return self.send(404, "{}")
                text = tail_bytes(path, 400_000) or "(файла нет)"
                return self.send(200, "\n".join(text.splitlines()[-tail:]), "text/plain; charset=utf-8")
            return self.send(404, "{}")
        except Exception as e:  # noqa: BLE001
            return self.send(500, json.dumps({"error": str(e)}))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        # Вкладку закрыли посреди ответа — не ошибка, не засоряем журнал трассировками.
        import sys
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    import sys
    if sys.argv[1:2] == ["setup-db"]:
        setup_db_roles()
        sys.exit(0)
    if sys.argv[1:2] == ["set-password"]:
        # Первая установка или сброс забытого пароля (на сервере):
        #   STATUS_PASSWORD=... python3 server.py set-password [логин]
        auth_set(sys.argv[2] if len(sys.argv) > 2 else "admin", os.environ["STATUS_PASSWORD"])
        print("пароль сохранён:", AUTH_FILE)
        sys.exit(0)
    auth_load()
    try:
        hist_preload()
    except Exception as e:  # noqa: BLE001
        print("history preload:", e, flush=True)
    for fn in (sampler, container_sampler, checker, errors_warmer):
        threading.Thread(target=fn, daemon=True).start()
    print(f"status: http://{LISTEN[0]}:{LISTEN[1]}", flush=True)
    Server(LISTEN, Handler).serve_forever()
