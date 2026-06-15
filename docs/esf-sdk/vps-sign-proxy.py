#!/usr/bin/env python3
# Прокси перед esf_local_server.jar: принимает ключ БАЙТАМИ (<certificateBase64>)
# и подменяет на временный файл (<certificatePath>) для jar. Нужен для
# самообслуживания (орг грузит .p12 в кабинете → ключ шифр в БД → шлётся в
# каждом запросе подписи). Без ключа-байтов — обычный passthrough на jar.
# Слушает 127.0.0.1:6667; секрет проверяет Caddy (X-Esf-Sign-Secret) на входе.
import http.server
import urllib.request
import urllib.error
import re
import base64
import os
import tempfile

JAR = "http://127.0.0.1:6666"
PORT = 6667
CERT_RE = re.compile(rb"<certificateBase64>(.*?)</certificateBase64>", re.S)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length)
        tmp = None
        try:
            m = CERT_RE.search(body)
            if m:
                raw = base64.b64decode(m.group(1).strip())
                fd, tmp = tempfile.mkstemp(suffix=".p12")
                os.write(fd, raw)
                os.close(fd)
                os.chmod(tmp, 0o600)
                body = CERT_RE.sub(b"<certificatePath>" + tmp.encode() + b"</certificatePath>", body, count=1)
            req = urllib.request.Request(
                JAR + self.path,
                data=body,
                headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": ""},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data, code = r.read(), r.getcode()
            except urllib.error.HTTPError as he:
                data, code = he.read(), he.code
            self.send_response(code)
            self.send_header("Content-Type", "text/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:  # noqa: BLE001
            msg = ("proxy error: %s" % e).encode()
            self.send_response(500)
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
