"""F16 Bot для TeamSpeak F16 Arena.

- «+ Создать комнату»: зашёл — бот создаёт личную временную комнату и переносит туда;
- команды в чате сервера / лобби / в личке: !помощь, !комната, !5x5, !онлайн, !ранг, !бронь, !турнир, !музыка, !afk;
- ранги за часы в TeamSpeak (Свой → Завсегдатай → Легенда);
- приветствие новичков, перенос отошедших в AFK;
- состояние для панели status.commrent.kz и число онлайн для сайта.

Работает через ServerQuery, опрос раз в 2 секунды (IP бота в query_ip_allowlist — без флуд-лимитов).
"""
import json, os, re, sys, time, traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsq import TS, esc, parse  # noqa: E402

STATE = "/opt/teamspeak/state.json"
PUBLIC = "/opt/teamspeak/www/status.json"
RANKS_FILE = "/opt/teamspeak/ranks.json"
FAST, SLOW = 2, 15

LOBBY, AFK_NAME, ROOMS, CREATE = "Лобби", "AFK", "Свои комнаты", "+ Создать комнату"
SKIP_CHANNELS = {"AFK", "Администрация"}
MUSIC_BOT, MUSIC_CHANNEL = "F16 Music", "Музыка"
SKIP_NICKS = {MUSIC_BOT}  # музыкальный бот молчит между треками — не трогать
AWAY_AFTER = 2 * 60          # статус «отошёл» — через 2 минуты
MUTED_AFTER = 10 * 60        # выключен звук и молчит — через 10 минут
IDLE_AFTER = 60 * 60         # просто молчит — через час
RANKS = [(10 * 3600, "Свой"), (50 * 3600, "Завсегдатай"), (200 * 3600, "Легенда")]

SITE = "https://f16-arena.kz"
WELCOME = (
    "[b]Привет, %s! Ты на сервере F16 Arena.[/b]\n"
    "• Своя комната — зайди в «+ Создать комнату».\n"
    "• Собрать команду — напиши [b]!5x5[/b] в чат сервера.\n"
    "• Все команды — [b]!помощь[/b]."
)
HELP = (
    "[b]Команды F16 Bot[/b] (пиши в чат сервера, лобби или мне в личку):\n"
    "[b]!комната[/b] — своя комната, удалится сама, когда все выйдут\n"
    "[b]!5x5[/b] (или !2x2 … !5x5) — собрать команду: комната на N мест + клич в чат\n"
    "[b]!онлайн[/b] — кто в каких каналах\n"
    "[b]!ранг[/b] — твои часы на сервере и следующий ранг\n"
    "[b]!бронь[/b] — забронировать ПК в клубе\n"
    "[b]!турнир[/b] — турниры F16 Arena\n"
    "[b]!музыка[/b] — как включить музыку\n"
    "[b]!afk[/b] — уйти в AFK"
)
MUSIC = ("Зайди в канал «Музыка» и напиши в чат канала: [b]!play ссылка[/b] (YouTube или радио).\n"
         "Ещё: !add — в очередь, !next, !pause, !stop, !volume 40, !song — что играет.")


def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *a, flush=True)


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def hours(sec):
    h = sec / 3600
    return ("%.1f" % h).replace(".", ",") if h < 10 else str(int(h))


class Bot:
    def __init__(self):
        self.ts = TS()
        try:
            self.ts.cmd("clientupdate client_nickname=" + esc("F16 Bot"))
        except Exception:
            pass
        self.me = self.ts.cmd("whoami")[0]["client_id"]
        self.seen = None
        self.ranks = self.load_ranks()
        self.ranks_dirty = False
        self.refresh()
        self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
        for ev in ("textserver", "textprivate"):
            self.ts.cmd("servernotifyregister event=" + ev)
        self.ts.cmd("servernotifyregister event=textchannel id=" + self.cid[LOBBY])

    # ── данные сервера ──
    def refresh(self):
        self.chans = self.ts.cmd("channellist")
        self.cname = {c["cid"]: c["channel_name"] for c in self.chans}
        self.cid = {c["channel_name"]: c["cid"] for c in self.chans}
        self.groups = {g["name"]: g["sgid"] for g in self.ts.cmd("servergrouplist") if g.get("type") == "1"}
        self.cgroups = {g["name"]: g["cgid"] for g in self.ts.cmd("channelgrouplist") if g.get("type") == "1"}

    def clients(self):
        return [c for c in self.ts.cmd("clientlist -uid -times -away -voice -country -groups") if c.get("client_type") == "0"]

    def pm(self, clid, text):
        self.ts.cmd("sendtextmessage targetmode=1 target=%s msg=%s" % (clid, esc(text)))

    def say(self, text):
        self.ts.cmd("sendtextmessage targetmode=3 target=1 msg=%s" % esc(text))

    # ── комнаты ──
    def make_room(self, client, name, maxclients=0):
        parent = self.cid.get(ROOMS)
        if not parent:
            return None
        name = name[:38]
        base, n = name, 2
        while name in self.cid:
            name = "%s %d" % (base, n); n += 1
        args = "channel_name=%s cpid=%s channel_codec=4 channel_codec_quality=10" % (esc(name), parent)
        if maxclients:
            args += " channel_flag_maxclients_unlimited=0 channel_maxclients=%d" % maxclients
        args += " channel_description=" + esc("Комната %s. Удалится сама, когда все выйдут.\n"
                                              "Владелец может переименовать и поставить пароль: ПКМ → «Изменить канал»." % client["client_nickname"])
        new = self.ts.cmd("channelcreate " + args)[0]["cid"]
        # создатель-бот оказался внутри — сначала переносим игрока, потом уходим сами, иначе комната удалится пустой
        self.ts.cmd("clientmove clid=%s cid=%s" % (client["clid"], new))
        self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
        admin = self.cgroups.get("Channel Admin")
        if admin:
            try:
                self.ts.cmd("setclientchannelgroup cgid=%s cid=%s cldbid=%s" % (admin, new, client["client_database_id"]))
            except Exception as e:
                log("channel admin", e)
        try:
            self.ts.cmd("channeladdperm cid=%s permsid=i_icon_id permvalue=%d" % (new, self.icon_rooms))
        except Exception:
            pass
        self.cid[name] = new; self.cname[new] = name
        log("room", name, "for", client["client_nickname"])
        return new, name

    @property
    def icon_rooms(self):
        return 480404243

    # ── команды ──
    def on_text(self, ev, by_clid):
        msg = ev.get("msg", "").strip()
        clid = ev.get("invokerid")
        if not msg.startswith("!") or ev.get("invokeruid") == "serveradmin" or clid == self.me:
            return
        client = by_clid.get(clid)
        if not client:
            return
        cmd = msg.split()[0].lower()
        nick = client["client_nickname"]
        if cmd in ("!помощь", "!help", "!команды", "!бот"):
            self.pm(clid, HELP)
        elif cmd in ("!комната", "!room"):
            r = self.make_room(client, "Комната " + nick)
            if r:
                self.pm(clid, "Готово — ты в комнате «%s». Позови друзей, она удалится сама, когда все выйдут." % r[1])
        elif re.fullmatch(r"!([1-5])[xх]([1-5])", cmd) or cmd.startswith("!сбор"):
            m = re.fullmatch(r"!([1-5])[xх]([1-5])", cmd)
            n = int(m.group(1)) if m else 5
            label = "%dx%d" % (n, n)
            r = self.make_room(client, "%s · %s" % (label, nick), maxclients=n)
            if r:
                self.say("[b]%s[/b] собирает команду %s — заходи: [url=channelid://%s]%s[/url]" % (nick, label, r[0], r[1]))
        elif cmd in ("!онлайн", "!online", "!кто"):
            by = {}
            for c in by_clid.values():
                if c["client_nickname"] not in SKIP_NICKS:
                    by.setdefault(self.cname.get(c["cid"], "?"), []).append(c["client_nickname"])
            lines = ["[b]%s[/b]: %s" % (ch, ", ".join(sorted(n))) for ch, n in sorted(by.items())]
            self.pm(clid, "[b]Сейчас на сервере %d[/b]\n%s" % (sum(len(v) for v in by.values()), "\n".join(lines)))
        elif cmd in ("!ранг", "!rank", "!время"):
            sec = self.ranks.get(client["client_unique_identifier"], 0)
            cur = next((n for t, n in reversed(RANKS) if sec >= t), None)
            nxt = next(((t, n) for t, n in RANKS if sec < t), None)
            text = "Ты провёл на сервере [b]%s ч[/b]." % hours(sec)
            text += " Ранг: [b]%s[/b]." % cur if cur else " Ранга пока нет."
            if nxt:
                text += " До «%s» — %s ч." % (nxt[1], hours(nxt[0] - sec))
            self.pm(clid, text)
        elif cmd in ("!бронь", "!booking"):
            self.pm(clid, "Бронь ПК и PlayStation: [url=%s]f16-arena.kz[/url] → «Забронировать». Клуб работает 24/7." % SITE)
        elif cmd in ("!турнир", "!турниры", "!tournament"):
            self.pm(clid, "Турниры F16 Arena: [url=https://tournament.f16-arena.kz]tournament.f16-arena.kz[/url]")
        elif cmd in ("!музыка", "!music"):
            self.pm(clid, MUSIC)
        elif cmd == "!afk" and self.cid.get(AFK_NAME):
            self.ts.cmd("clientmove clid=%s cid=%s" % (clid, self.cid[AFK_NAME]))
        else:
            if self.cname.get(client["cid"]) != "Музыка":  # команды музыки — боту F16 Music
                self.pm(clid, "Не знаю такую команду. Напиши [b]!помощь[/b].")

    # ── ранги ──
    def load_ranks(self):
        try:
            return json.load(open(RANKS_FILE, encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def tick_ranks(self, clients, dt):
        rank_ids = {self.groups.get(n) for _, n in RANKS} - {None}
        for c in clients:
            if c["client_nickname"] in SKIP_NICKS or self.cname.get(c["cid"]) == AFK_NAME or c.get("client_away") == "1":
                continue
            uid = c["client_unique_identifier"]
            sec = self.ranks.get(uid, 0) + dt
            self.ranks[uid] = sec
            self.ranks_dirty = True
            want = next((self.groups.get(n) for t, n in reversed(RANKS) if sec >= t), None)
            have = set(c.get("client_servergroups", "").split(",")) & rank_ids
            if want and want not in have:
                for g in have:
                    self.ts.cmd("servergroupdelclient sgid=%s cldbid=%s" % (g, c["client_database_id"]))
                self.ts.cmd("servergroupaddclient sgid=%s cldbid=%s" % (want, c["client_database_id"]))
                name = next(n for _, n in RANKS if self.groups.get(n) == want)
                self.pm(c["clid"], "Новый ранг: [b]%s[/b]! Спасибо, что ты с нами." % name)
                log("rank", c["client_nickname"], name)

    # ── основной цикл ──
    def run(self):
        last_slow, last_refresh, last_save = 0, time.time(), time.time()
        while True:
            now = time.time()
            if now - last_refresh > 60:
                self.refresh(); last_refresh = now
            clients = self.clients()
            by_clid = {c["clid"]: c for c in clients}

            # входящие команды (notify-строки копятся, пока идут обычные запросы)
            while self.ts.events:
                line = self.ts.events.pop(0)
                if line.startswith("notifytextmessage"):
                    ev = parse(line.partition(" ")[2])[0]
                    try:
                        self.on_text(ev, by_clid)
                    except Exception as e:
                        log("command error", e)

            # F16 Music живёт только в «Музыке»
            music = self.cid.get(MUSIC_CHANNEL)
            for c in clients:
                if c["client_nickname"] == MUSIC_BOT and music and c["cid"] != music:
                    try:
                        self.ts.cmd("clientmove clid=%s cid=%s" % (c["clid"], music))
                        log("music bot returned from", self.cname.get(c["cid"]))
                    except Exception as e:
                        log("music bot move", e)

            # «+ Создать комнату»
            create = self.cid.get(CREATE)
            for c in clients:
                if create and c["cid"] == create and c["client_nickname"] != MUSIC_BOT:
                    try:
                        self.make_room(c, "Комната " + c["client_nickname"])
                    except Exception as e:
                        log("room error", e)
                        self.refresh()

            # приветствие — только при первом заходе на сервер
            ids = set(by_clid)
            if self.seen is not None:
                for clid in ids - self.seen:
                    c = by_clid[clid]
                    try:
                        if self.ts.cmd("clientinfo clid=" + clid)[0].get("client_totalconnections") == "1":
                            self.pm(clid, WELCOME % c["client_nickname"])
                            log("welcome", c["client_nickname"])
                    except Exception as e:
                        log("welcome error", e)
            self.seen = ids

            if now - last_slow >= SLOW:
                dt = min(SLOW, int(now - last_slow)) if last_slow else 0
                last_slow = now
                clients = self.clients()
                self.afk(clients)
                if dt:
                    self.tick_ranks(clients, dt)
                self.write_state(clients)
            if self.ranks_dirty and now - last_save > 60:
                write(RANKS_FILE, self.ranks); self.ranks_dirty = False; last_save = now
            time.sleep(FAST)

    def afk(self, clients):
        afk = self.cid.get(AFK_NAME)
        for c in clients:
            if not afk or self.cname.get(c["cid"]) in SKIP_CHANNELS or c["client_nickname"] in SKIP_NICKS:
                continue
            idle = int(c.get("client_idle_time", "0")) // 1000
            away = c.get("client_away") == "1"
            muted = c.get("client_output_muted") == "1"
            if (away and idle >= AWAY_AFTER) or (muted and idle >= MUTED_AFTER) or idle >= IDLE_AFTER:
                try:
                    self.ts.cmd("clientmove clid=%s cid=%s" % (c["clid"], afk))
                    self.pm(c["clid"], "Ты давно молчишь — перенёс в AFK. Вернуться: двойной клик по своему каналу.")
                    log("afk", c["client_nickname"], "from", self.cname.get(c["cid"]), "idle", idle)
                except Exception as e:
                    log("afk error", e)

    def write_state(self, clients):
        si = self.ts.cmd("serverinfo")[0]
        state = {
            "at": int(time.time()),
            "name": si.get("virtualserver_name"),
            "version": si.get("virtualserver_version", "").split(" ")[0],
            "uptime": int(si.get("virtualserver_uptime", 0)),
            "online": len(clients),
            "max": int(si.get("virtualserver_maxclients", 0)),
            "channels": len(self.chans),
            "ping": round(float(si.get("virtualserver_total_ping", 0) or 0)),
            "packetloss": round(100 * float(si.get("virtualserver_total_packetloss_total", 0) or 0), 2),
            "clients": [{
                "nick": c["client_nickname"], "channel": self.cname.get(c["cid"], ""),
                "idle": int(c.get("client_idle_time", "0")) // 1000, "country": c.get("client_country", ""),
                "away": c.get("client_away") == "1", "muted": c.get("client_output_muted") == "1",
            } for c in clients],
        }
        write(STATE, state)
        # публичное для сайта f16-arena.kz — только числа, без ников
        write(PUBLIC, {"online": state["online"], "max": state["max"], "at": state["at"]})


if __name__ == "__main__":
    while True:
        try:
            bot = Bot()
            try:
                bot.run()
            finally:
                if bot.ranks_dirty:
                    write(RANKS_FILE, bot.ranks)
        except Exception:
            log("ошибка, переподключение через 10 с\n" + traceback.format_exc())
            time.sleep(10)
