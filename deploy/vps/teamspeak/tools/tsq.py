"""Мини-клиент TeamSpeak 3 ServerQuery (127.0.0.1:10011)."""
import os, socket, time

ESC = [("\\", "\\\\"), ("/", "\\/"), (" ", "\\s"), ("|", "\\p"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t")]


def esc(s):
    for a, b in ESC:
        s = s.replace(a, b)
    return s


def unesc(s):
    out, i = [], 0
    m = {"\\": "\\", "/": "/", "s": " ", "p": "|", "n": "\n", "r": "\r", "t": "\t", "a": "\a", "b": "\b", "f": "\f", "v": "\v"}
    while i < len(s):
        if s[i] == "\\" and i + 1 < len(s):
            out.append(m.get(s[i + 1], s[i + 1])); i += 2
        else:
            out.append(s[i]); i += 1
    return "".join(out)


def parse(text):
    """'a=1 b=2|a=3' -> [{'a': '1', 'b': '2'}, {'a': '3'}]"""
    rows = []
    for part in text.split("|") if text else []:
        row = {}
        for kv in part.split(" "):
            if not kv:
                continue
            k, _, v = kv.partition("=")
            row[k] = unesc(v)
        rows.append(row)
    return rows


class QueryError(RuntimeError):
    def __init__(self, cmd, eid, msg):
        super().__init__("%s: %s %s" % (cmd.split(" ")[0], eid, msg))
        self.id = eid


class TS:
    def __init__(self, password=None, host="127.0.0.1", port=10011, timeout=15):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.f = self.sock.makefile("rwb")
        self.f.readline(); self.f.readline()
        self.events = []
        self.login("serveradmin", password or os.environ["TS_QUERY_PASS"])
        self.cmd("use sid=1")

    def login(self, user, pw):
        self.cmd("login %s %s" % (esc(user), esc(pw)))

    def _line(self):
        line = self.f.readline()
        if not line:
            raise ConnectionError("ServerQuery закрыл соединение")
        return line.decode("utf-8", "replace").strip("\r\n")

    def cmd(self, cmd, retries=5):
        self.f.write((cmd + "\n").encode()); self.f.flush()
        data = []
        while True:
            line = self._line()
            if line.startswith("notify"):
                self.events.append(line); continue
            if line.startswith("error "):
                e = parse(line[6:])[0]
                if e.get("id") == "524" and retries:  # флуд-защита
                    time.sleep(1.5)
                    return self.cmd(cmd, retries - 1)
                if e.get("id") not in ("0", "1281"):  # 1281 = пустой результат
                    raise QueryError(cmd, e.get("id"), e.get("msg", ""))
                return parse("".join(data))
            if line:
                data.append(line)
