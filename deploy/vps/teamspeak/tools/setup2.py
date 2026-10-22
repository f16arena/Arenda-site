"""Разовая настройка F16 Arena: иконки, роли, свои комнаты, защита от спама. Повторный запуск безопасен."""
import json, os, socket, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsq import TS, QueryError, esc  # noqa: E402

ICONS = "/opt/teamspeak/icons"
ts = TS()
ids = json.load(open(os.path.join(ICONS, "ids.json")))

# ── иконки: загрузка через файловый сервер (порт 30033) ──
for k, iid in ids.items():
    data = open(os.path.join(ICONS, k + ".png"), "rb").read()
    r = ts.cmd("ftinitupload clientftfid=%d name=%s cid=0 cpw= size=%d overwrite=1 resume=0"
               % (abs(iid) % 30000 + 1, esc("/icon_%d" % iid), len(data)))[0]
    s = socket.create_connection(("127.0.0.1", int(r.get("port", 30033))), timeout=10)
    s.sendall(r["ftkey"].encode() + data)
    s.close()
print("иконок:", len(ids))


def setperm(kind, target, perms):
    if kind == "group":
        args = "|".join("permsid=%s permvalue=%d permnegated=0 permskip=0" % (p, v) for p, v in perms.items())
        ts.cmd("servergroupaddperm sgid=%s %s" % (target, args))
    else:
        args = "|".join("permsid=%s permvalue=%d" % (p, v) for p, v in perms.items())
        ts.cmd("channeladdperm cid=%s %s" % (target, args))


ts.cmd("serveredit virtualserver_icon_id=%d" % ids["server"])

# ── роли ──
groups = {g["name"]: g["sgid"] for g in ts.cmd("servergrouplist") if g.get("type") == "1"}


def group(name, icon, sort, perms):
    sgid = groups.get(name) or ts.cmd("servergroupadd name=%s type=1" % esc(name))[0]["sgid"]
    base = {"i_icon_id": ids[icon], "i_group_sort_id": sort, "b_group_is_permanent": 1,
            "i_group_needed_modify_power": 75, "i_group_needed_member_add_power": 50,
            "i_group_needed_member_remove_power": 50}
    base.update(perms)
    setperm("group", sgid, base)
    return sgid


mod = group("Модератор", "g_mod", 2, {
    "i_group_needed_member_add_power": 75, "i_group_needed_member_remove_power": 75,
    "i_client_kick_from_server_power": 50, "i_client_kick_from_channel_power": 50,
    "i_client_move_power": 50, "i_client_ban_power": 50, "i_client_ban_max_bantime": 7 * 86400,
    "b_client_ban_create": 1, "b_client_ban_list": 1, "b_client_ban_delete_own": 1,
    "i_client_needed_kick_from_server_power": 50, "i_client_needed_kick_from_channel_power": 50,
    "i_client_needed_move_power": 50, "i_client_needed_ban_power": 50,
    "i_group_member_add_power": 50, "i_group_member_remove_power": 50,
    "i_client_poke_power": 50, "i_channel_join_power": 50, "i_channel_subscribe_power": 50,
    "i_client_talk_power": 50, "b_client_remoteaddress_view": 1, "b_client_info_view": 1,
    "b_channel_modify_name": 1, "b_channel_modify_description": 1, "i_channel_modify_power": 50,
    "i_channel_delete_power": 50, "b_channel_delete_temporary": 1, "b_channel_delete_flag_force": 1,
    "b_virtualserver_servergroup_list": 1, "b_client_ignore_antiflood": 1,
})
captain = group("Капитан", "g_captain", 3, {"i_client_move_power": 30, "i_client_poke_power": 30})
player = group("Игрок F16", "g_player", 4, {})
tour = group("Турнир", "g_tour", 5, {})
print("роли:", {"Модератор": mod, "Капитан": captain, "Игрок F16": player, "Турнир": tour})

# ── гости: только временные комнаты, без постоянных каналов ──
guest = next(g["sgid"] for g in ts.cmd("servergrouplist") if g["name"] == "Guest" and g.get("type") == "1")
setperm("group", guest, {
    "b_channel_create_temporary": 1, "b_channel_create_child": 1,
    "b_channel_create_permanent": 0, "b_channel_create_semi_permanent": 0,
    "b_channel_create_with_password": 1, "b_channel_create_with_maxclients": 1,
    "b_channel_create_modify_with_codec_opusvoice": 1, "i_channel_create_modify_with_codec_maxquality": 10,
    "i_client_poke_power": 25, "i_client_private_textmessage_power": 25,
})

# ── защита от ботов: уровень безопасности профиля и флуд ──
ts.cmd("serveredit virtualserver_needed_identity_security_level=15"
       " virtualserver_antiflood_points_tick_reduce=5"
       " virtualserver_antiflood_points_needed_command_block=150"
       " virtualserver_antiflood_points_needed_ip_block=250"
       " virtualserver_hostmessage_mode=0")

# ── каналы: «Свои комнаты» и иконки ──
chans = ts.cmd("channellist")
by = {c["channel_name"]: c for c in chans}
if "Свои комнаты" not in by:
    after = by["Турнир"]["cid"]
    sp = ts.cmd("channelcreate channel_name=%s channel_flag_permanent=1 channel_flag_maxclients_unlimited=0"
                " channel_maxclients=0 channel_order=%s" % (esc("[cspacer5]═══ КОМНАТЫ ═══"), after))[0]["cid"]
    ts.cmd("channelcreate channel_name=%s channel_flag_permanent=1 channel_order=%s channel_codec=4"
           " channel_codec_quality=10 channel_description=%s" % (
               esc("Свои комнаты"), sp,
               esc("Создай комнату для своей компании: ПКМ по этому каналу → «Создать подканал».\n"
                   "Комната удалится сама, когда все выйдут.")))
    chans = ts.cmd("channellist")
    by = {c["channel_name"]: c for c in chans}

icon_for = {"Лобби": "c_lobby", "CS2": "c_cs2", "Dota 2": "c_dota", "Valorant": "c_valorant", "PUBG": "c_pubg",
            "Турнир": "c_tour", "Свои комнаты": "c_rooms", "Общение": "c_chat", "Музыка": "c_music",
            "AFK": "c_afk", "Администрация": "c_admin"}
for c in chans:
    key = icon_for.get(c["channel_name"])
    if not key:
        parent = next((p["channel_name"] for p in chans if p["cid"] == c["pid"]), None)
        key = icon_for.get(parent) if parent in ("CS2", "Dota 2", "Valorant", "PUBG", "Турнир") else None
    if key:
        ts.cmd("channeladdperm cid=%s permsid=i_icon_id permvalue=%d" % (c["cid"], ids[key]))
adm = by["Администрация"]["cid"]
ts.cmd("channeladdperm cid=%s permsid=i_channel_needed_join_power permvalue=50|permsid=i_channel_needed_subscribe_power permvalue=50" % adm)
print("каналов:", len(chans))
