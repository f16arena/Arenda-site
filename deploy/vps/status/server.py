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
import http.client
import http.server
import json
import os
import re
import socket
import socketserver
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
                 "cron": "/var/log/commrent-cron.log", "deploy": "/var/log/commrent-deploy.log"},
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
        "id": "shared", "name": "Общие сервисы", "url": None,
        "links": ["https://ecp.commrent.kz", "https://pdf.commrent.kz"],
        "match_dirs": [], "names": ["ncanode", "gotenberg", "buildx_buildkit_polite0"],
        "units": ["caddy", "docker", "esf-sign", "esf-sign-proxy", "fail2ban"],
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


def sampler():
    prev = None
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
    pool = concurrent.futures.ThreadPoolExecutor(8)
    while True:
        try:
            if time.time() - LAST_VIEW[0] < 120:
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
        })
    other = [c for c in containers if project_of(c) == "other"]
    if other:
        projects.append({"id": "other", "name": "Прочее", "containers": other, "deploys": [], "checks": [],
                         "units": [], "logs": [], "links": []})
    return {"now": int(time.time()), "server": server, "projects": projects, "containers_at": c_at}


# ── HTTP ───────────────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        try:
            if u.path == "/":
                with open(os.path.join(HERE, "index.html"), "rb") as f:
                    return self.send(200, f.read(), "text/html; charset=utf-8")
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


if __name__ == "__main__":
    for fn in (sampler, container_sampler, checker):
        threading.Thread(target=fn, daemon=True).start()
    print(f"status: http://{LISTEN[0]}:{LISTEN[1]}", flush=True)
    Server(LISTEN, Handler).serve_forever()
