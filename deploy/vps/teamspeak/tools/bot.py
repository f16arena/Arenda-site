"""F16 Bot: приветствует новичков, уносит отошедших в AFK, пишет состояние для панели.

Работает через ServerQuery, раз в 15 секунд опрашивает список клиентов.
Состояние — /opt/teamspeak/state.json (читает status.commrent.kz).
"""
import json, os, sys, time, traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsq import TS, esc  # noqa: E402

STATE = "/opt/teamspeak/state.json"
PUBLIC = "/opt/teamspeak/www/status.json"
TICK = 15
AFK_NAME = "AFK"
SKIP_CHANNELS = {"AFK", "Администрация"}
SKIP_NICKS = {"F16 Music"}  # музыкальный бот молчит между треками — не трогать
AWAY_AFTER = 2 * 60          # отошёл (статус «away») — через 2 минуты
MUTED_AFTER = 10 * 60        # выключен звук и молчит — через 10 минут
IDLE_AFTER = 60 * 60         # просто молчит — через час

WELCOME = (
    "[b]Привет, %s! Ты на сервере F16 Arena.[/b]\n"
    "• Каналы игр — CS2, Dota 2, Valorant, PUBG; в подканалах до 5 человек.\n"
    "• Хочешь свою комнату — ПКМ по «Свои комнаты» → «Создать подканал».\n"
    "• Отошёл — перенесу в AFK, вернёшься сам.\n"
    "Сайт: [url=https://f16-arena.kz]f16-arena.kz[/url]"
)


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *a, flush=True)


def run():
    ts = TS()
    try:
        ts.cmd("clientupdate client_nickname=" + esc("F16 Bot"))
    except Exception:
        pass
    seen = None
    while True:
        chans = ts.cmd("channellist")
        cname = {c["cid"]: c["channel_name"] for c in chans}
        afk = next((c["cid"] for c in chans if c["channel_name"] == AFK_NAME), None)
        clients = [c for c in ts.cmd("clientlist -times -away -voice -country -groups") if c.get("client_type") == "0"]
        now_ids = {c["clid"] for c in clients}

        for c in clients:
            # приветствие — только при первом заходе на сервер
            if seen is not None and c["clid"] not in seen:
                try:
                    info = ts.cmd("clientinfo clid=" + c["clid"])[0]
                    if info.get("client_totalconnections") == "1":
                        ts.cmd("sendtextmessage targetmode=1 target=%s msg=%s" % (c["clid"], esc(WELCOME % c["client_nickname"])))
                        log("welcome", c["client_nickname"])
                except Exception as e:
                    log("welcome error", e)
            # AFK
            if afk and cname.get(c["cid"]) not in SKIP_CHANNELS and c["client_nickname"] not in SKIP_NICKS:
                idle = int(c.get("client_idle_time", "0")) // 1000
                away = c.get("client_away") == "1"
                muted = c.get("client_output_muted") == "1"
                if (away and idle >= AWAY_AFTER) or (muted and idle >= MUTED_AFTER) or idle >= IDLE_AFTER:
                    try:
                        ts.cmd("clientmove clid=%s cid=%s" % (c["clid"], afk))
                        ts.cmd("sendtextmessage targetmode=1 target=%s msg=%s" % (
                            c["clid"], esc("Ты давно молчишь — перенёс в AFK. Вернуться: двойной клик по своему каналу.")))
                        log("afk", c["client_nickname"], "from", cname.get(c["cid"]), "idle", idle)
                    except Exception as e:
                        log("afk error", e)
        seen = now_ids

        si = ts.cmd("serverinfo")[0]
        state = {
            "at": int(time.time()),
            "name": si.get("virtualserver_name"),
            "version": si.get("virtualserver_version", "").split(" ")[0],
            "uptime": int(si.get("virtualserver_uptime", 0)),
            "online": len(clients),
            "max": int(si.get("virtualserver_maxclients", 0)),
            "channels": len(chans),
            "ping": round(float(si.get("virtualserver_total_ping", 0) or 0)),
            "packetloss": round(100 * float(si.get("virtualserver_total_packetloss_total", 0) or 0), 2),
            "clients": [{
                "nick": c["client_nickname"], "channel": cname.get(c["cid"], ""),
                "idle": int(c.get("client_idle_time", "0")) // 1000, "country": c.get("client_country", ""),
                "away": c.get("client_away") == "1", "muted": c.get("client_output_muted") == "1",
            } for c in clients],
        }
        write(STATE, state)
        # публичное для сайта f16-arena.kz — только числа, без ников
        write(PUBLIC, {"online": state["online"], "max": state["max"], "at": state["at"]})
        time.sleep(TICK)


if __name__ == "__main__":
    while True:
        try:
            run()
        except Exception:
            log("ошибка, переподключение через 10 с\n" + traceback.format_exc())
            time.sleep(10)
