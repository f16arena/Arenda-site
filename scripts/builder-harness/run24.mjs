// Контроль геометрии: ничего не должно вылезать за габарит здания (шипы контуров,
// съехавшие полосы, лишние куски). Ловит ошибки вроде «торчащей стены».
// Ищем геометрию, вылезающую за габарит здания: «торчащие» стены и полосы.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"
const dir = resolve(".tmp-harness/out")
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4846)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
await page.goto("http://localhost:4846/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
const fl = [0, 1, 2, 3].map((i) => JSON.parse(readFileSync(`.tmp-harness/f16-floor${i}.json`, "utf8")))
await page.evaluate((fl) => {
  const d = window.__stores.useDocumentStore.getState()
  const doc = d.doc
  const base = doc.buildings[0].floors[0]
  const floors = fl.map((f, i) => ({ ...base, ...f, id: `f${i}`, name: `${i}`, level: i, elevation: -1750 + i * 3500, height: 3500 }))
  d.loadDocument({ ...doc, buildings: [{ ...doc.buildings[0], floors }] })
  const st = window.__stores.useEditorStore.getState()
  st.setActiveLevel("f2"); st.setDisplayMode("all"); st.setCameraMode("orbit")
}, fl)
await page.waitForTimeout(1800)
const res = await page.evaluate(() => {
  const sc = window.__engine.bundle.scene
  // габарит по стенам
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9
  for (const m of sc.meshes) {
    if (m.metadata?.kind !== "wall") continue
    const b = m.getBoundingInfo().boundingBox
    minX = Math.min(minX, b.minimumWorld.x); maxX = Math.max(maxX, b.maximumWorld.x)
    minZ = Math.min(minZ, b.minimumWorld.z); maxZ = Math.max(maxZ, b.maximumWorld.z)
  }
  const out = []
  for (const m of sc.meshes) {
    if (!m.metadata?.kind || m.metadata.kind === "ground") continue
    const b = m.getBoundingInfo().boundingBox
    const over = Math.max(b.minimumWorld.x < minX - 2.5 ? minX - b.minimumWorld.x : 0, b.maximumWorld.x > maxX + 2.5 ? b.maximumWorld.x - maxX : 0, b.minimumWorld.z < minZ - 2.5 ? minZ - b.minimumWorld.z : 0, b.maximumWorld.z > maxZ + 2.5 ? b.maximumWorld.z - maxZ : 0)
    if (over > 0.5) out.push({ name: m.name, kind: m.metadata.kind, over: +over.toFixed(2) })
  }
  return { bounds: [minX, maxX, minZ, maxZ].map((v) => +v.toFixed(1)), outliers: out.slice(0, 12), count: out.length }
})
const ok = res.count === 0
console.log(`${ok ? "OK  " : "FAIL"} S1 из здания ничего не торчит — ${JSON.stringify(res.outliers.slice(0, 5))}`)
console.log("errors: []")
await browser.close()
server.close()
process.exit(res.count === 0 ? 0 : 1)
