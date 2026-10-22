"""Оформление F16 Arena: разделители, описания каналов с баннерами, «+ Создать комнату», ранги,
аватар-права для ботов, приветствие. Повторный запуск безопасен."""
import json, os, socket, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsq import TS, esc  # noqa: E402

ICONS = "/opt/teamspeak/icons"
IMG = "https://ts.f16-arena.kz/ch/%s.png"
ts = TS()
ids = json.load(open(os.path.join(ICONS, "ids.json")))

for k, iid in ids.items():
    data = open(os.path.join(ICONS, k + ".png"), "rb").read()
    r = ts.cmd("ftinitupload clientftfid=%d name=%s cid=0 cpw= size=%d overwrite=1 resume=0"
               % (iid % 30000 + 1, esc("/icon_%d" % iid), len(data)))[0]
    s = socket.create_connection(("127.0.0.1", int(r.get("port", 30033))), timeout=10)
    s.sendall(r["ftkey"].encode() + data); s.close()


def gperm(sgid, perms):
    ts.cmd("servergroupaddperm sgid=%s %s" % (sgid, "|".join(
        "permsid=%s permvalue=%d permnegated=0 permskip=0" % kv for kv in perms.items())))


def chans():
    return ts.cmd("channellist -flags -limits")


# ── ранги и боты ──
groups = {g["name"]: g["sgid"] for g in ts.cmd("servergrouplist") if g.get("type") == "1"}
for name, icon, sort in (("Свой", "r1", 7), ("Завсегдатай", "r2", 8), ("Легенда", "r3", 9)):
    sg = groups.get(name) or ts.cmd("servergroupadd name=%s type=1" % esc(name))[0]["sgid"]
    gperm(sg, {"i_icon_id": ids[icon], "i_group_sort_id": sort, "i_group_needed_modify_power": 75,
               "i_group_needed_member_add_power": 75, "i_group_needed_member_remove_power": 75})
if "Бот" in groups:
    gperm(groups["Бот"], {"i_client_max_avatar_filesize": 300000, "b_client_modify_own_description": 1})

# ── «+ Создать комнату» перед «Свои комнаты» ──
cl = chans(); by = {c["channel_name"]: c for c in cl}
if "+ Создать комнату" not in by:
    top = [c for c in cl if c["pid"] == "0"]
    i = next(n for n, c in enumerate(top) if c["channel_name"] == "Свои комнаты")
    ts.cmd("channelcreate channel_name=%s channel_flag_permanent=1 channel_order=%s channel_codec=4 channel_codec_quality=10"
           % (esc("+ Создать комнату"), top[i - 1]["cid"]))
    cl = chans(); by = {c["channel_name"]: c for c in cl}

# ── разделители: заголовок по центру + пустая строка перед секцией ──
titles = {"ИГРЫ": "1", "ТУРНИРЫ": "2", "КОМНАТЫ": "5", "ОТДЫХ": "3", "АДМИНИСТРАЦИЯ": "4"}
for c in cl:
    for t, n in titles.items():
        if c["pid"] == "0" and c["channel_name"].startswith("[cspacer%s]" % n):
            ts.cmd("channeledit cid=%s channel_name=%s" % (c["cid"], esc("[cspacer%s]━━━━━━  %s  ━━━━━━" % (n, t)))) \
                if c["channel_name"] != "[cspacer%s]━━━━━━  %s  ━━━━━━" % (n, t) else None
cl = chans()
top = [c for c in cl if c["pid"] == "0"]
names = [c["channel_name"] for c in top]
for i, c in enumerate(top):
    if c["channel_name"].startswith("[cspacer") and i > 0 and not names[i - 1].startswith("[spacer"):
        ts.cmd("channelcreate channel_name=%s channel_flag_permanent=1 channel_flag_maxclients_unlimited=0"
               " channel_maxclients=0 channel_order=%s" % (esc("[spacer1%s]" % i), top[i - 1]["cid"]))

# ── описания каналов с баннерами ──
CMDS = ("[b]Команды бота[/b] — пиши в чат сервера или лобби:\n"
        "[b]!комната[/b] — своя комната   [b]!5x5[/b] — собрать команду\n"
        "[b]!онлайн[/b] — кто где   [b]!ранг[/b] — твои часы   [b]!помощь[/b] — всё")
DESC = {
    "Лобби": ("lobby", "Здесь все собираются. Отсюда — в игры, турнир или свою комнату.\n\n" + CMDS +
              "\n\n[b]Правила:[/b] без оскорблений, рекламы и музыки в голосовых — музыка в «Музыке»."),
    "CS2": ("cs2", "Отряды до 5 человек в CS2 #1–#3. Не хватает людей — напиши [b]!5x5[/b] в чат сервера."),
    "Dota 2": ("dota", "Пати до 5 человек в Dota 2 #1–#3. Собрать пати — [b]!5x5[/b]."),
    "Valorant": ("valorant", "Отряды до 5 человек. Собрать команду — [b]!5x5[/b]."),
    "PUBG": ("pubg", "Сквады до 4 человек. Собрать сквад — [b]!4x4[/b]."),
    "Турнир": ("tour", "Каналы команд и судей на время турнира.\n"
               "Сетка и расписание: [url=https://tournament.f16-arena.kz]tournament.f16-arena.kz[/url]"),
    "+ Создать комнату": ("rooms", "[b]Зайди сюда — и бот сразу создаст тебе личную комнату[/b] и перенесёт туда.\n"
                          "Комната удалится сама, когда все выйдут. Переименовать или поставить пароль: ПКМ → «Изменить канал»."),
    "Свои комнаты": ("rooms", "Здесь появляются личные комнаты. Создать: зайди в «+ Создать комнату» или напиши [b]!комната[/b]."),
    "Музыка": ("music", "Бот [b]F16 Music[/b] играет YouTube и радио. Пиши в чат этого канала:\n"
               "[b]!p название[/b] — найти и включить   [b]!q название[/b] — в очередь\n"
               "[b]!play ссылка[/b] — по ссылке   [b]!add ссылка[/b] — ссылку в очередь\n"
               "[b]!next[/b]  [b]!pause[/b]  [b]!stop[/b]  [b]!volume 40[/b]  [b]!song[/b] — что играет"),
    "AFK": ("afk", "Бот переносит сюда тех, кто отошёл или долго молчит. Вернуться — двойной клик по своему каналу."),
    "Общение": (None, "Просто поболтать. Музыку — в канал «Музыка»."),
}
by = {c["channel_name"]: c for c in chans()}
for name, (img, text) in DESC.items():
    if name in by:
        d = ("[img]%s[/img]\n" % (IMG % img) if img else "") + text
        ts.cmd("channeledit cid=%s channel_description=%s" % (by[name]["cid"], esc(d)))
ts.cmd("channeladdperm cid=%s permsid=i_icon_id permvalue=%d" % (by["+ Создать комнату"]["cid"], ids["c_new"]))
for c in chans():
    if c["pid"] == by["PUBG"]["cid"]:
        ts.cmd("channeledit cid=%s channel_maxclients=4 channel_flag_maxclients_unlimited=0" % c["cid"])

# ── приветствие сервера ──
ts.cmd("serveredit virtualserver_welcomemessage=" + esc(
    "[b]Добро пожаловать на F16 Arena![/b]\n"
    "Своя комната — зайди в «+ Создать комнату». Собрать команду — [b]!5x5[/b] в чат. Все команды — [b]!помощь[/b].\n"
    "Сайт: [url=https://f16-arena.kz]f16-arena.kz[/url] · Турниры: [url=https://tournament.f16-arena.kz]tournament.f16-arena.kz[/url]"))
print("готово, каналов:", len(chans()))
