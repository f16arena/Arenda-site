// Прокси перед esf_local_server.jar, чтобы подпись принимала ключ БАЙТАМИ
// (<certificateBase64>), а не только путём (<certificatePath>). Нужен для
// самообслуживания: орг загружает .p12 в кабинете → хранится в БД (шифр) →
// приложение шлёт ключ в каждом запросе подписи. Прокси материализует временный
// файл, подставляет путь и зовёт jar, затем удаляет файл.
//
// Развёртывание на VPS (один раз, рядом с esf-sign; НЕ трогая NCANode):
//   1) node >= 18 на VPS (или: apt-get install -y nodejs)
//   2) положить этот файл, напр. /opt/esf-sign/sign-proxy.mjs
//   3) systemd-юнит esf-sign-proxy (порт 6667):
//        ExecStart=/usr/bin/node /opt/esf-sign/sign-proxy.mjs
//        Environment=JAR_URL=http://127.0.0.1:6666/LocalService
//        Environment=PROXY_PORT=6667
//        Environment=PROXY_SECRET=<тот же X-Esf-Sign-Secret>
//   4) Caddy: маршрут https://ecp.commrent.kz/LocalService → 127.0.0.1:6667
//      (вместо :6666). Заголовок X-Esf-Sign-Secret уже проксируется.
//   5) В приложении ESF_SIGN_URL остаётся прежним (через Caddy) — меняется
//      только бэкенд за Caddy (6666 → 6667).
// ufw: наружу 6667 закрыть (как 6666).

import http from "node:http"
import { writeFile, unlink, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const JAR_URL = process.env.JAR_URL || "http://127.0.0.1:6666/LocalService"
const PORT = Number(process.env.PROXY_PORT || 6667)
const SECRET = process.env.PROXY_SECRET || ""

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405); res.end("Method Not Allowed"); return
  }
  if (SECRET && req.headers["x-esf-sign-secret"] !== SECRET) {
    res.writeHead(403); res.end("Forbidden"); return
  }
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", async () => {
    let body = Buffer.concat(chunks).toString("utf8")
    let tempFile = null
    try {
      const m = body.match(/<certificateBase64>([\s\S]*?)<\/certificateBase64>/)
      if (m) {
        const dir = await mkdtemp(path.join(tmpdir(), "esfkey-"))
        tempFile = path.join(dir, "key.p12")
        await writeFile(tempFile, Buffer.from(m[1].trim(), "base64"), { mode: 0o600 })
        // Заменяем элемент ключа на путь к временному файлу (XML-escape пути не нужен — temp-путь без спецсимволов).
        body = body.replace(/<certificateBase64>[\s\S]*?<\/certificateBase64>/, `<certificatePath>${tempFile}</certificatePath>`)
      }
      const upstream = await fetch(JAR_URL, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
        body,
      })
      const text = await upstream.text()
      res.writeHead(upstream.status, { "Content-Type": "text/xml; charset=utf-8" })
      res.end(text)
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
      res.end(`proxy error: ${e instanceof Error ? e.message : "unknown"}`)
    } finally {
      if (tempFile) await unlink(tempFile).catch(() => {})
    }
  })
})

server.listen(PORT, "127.0.0.1", () => console.log(`esf sign proxy on 127.0.0.1:${PORT} → ${JAR_URL}`))
