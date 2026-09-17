import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4835)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4835/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1000)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const shot = (n) => page.screenshot({ path: join(shots, n + ".png") })
const floor = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  return d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
})
const sel = () => page.evaluate(() => window.__stores.useEditorStore.getState().selection)
// экранная точка для мм плана на плоскости активного этажа
const toScreen = (x, y) => page.evaluate(({ x, y }) => {
  const eng = window.__engine
  const scene = eng.bundle.scene
  const cam = scene.activeCamera
  const V = cam.position.constructor
  const M = scene.getTransformMatrix().constructor
  const w = eng.bundle.engine.getRenderWidth(), h = eng.bundle.engine.getRenderHeight()
  const p = V.Project(new V(x / 1000, 0, y / 1000), M.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h))
  const ratio = w / window.innerWidth
  return { x: p.x / ratio, y: p.y / ratio }
}, { x, y })
const drag = async (a, b, steps = 12) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); await page.waitForTimeout(600) }
const click = async (p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(400) }





// ── DXF. подложка из DXF в настоящем масштабе ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1000)
{
  const f = await floor()
  const n = f.wallGraph.nodes
  // DXF из осей стен этажа в МЕТРАХ ($INSUNITS 6) со смещением на 1 м — проверка единиц и координат
  const rows = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]
  for (const e of Object.values(f.wallGraph.edges)) {
    const a = n[e.a], b = n[e.b]
    rows.push("0", "LINE", "8", "ARCH", "10", String(a.x / 1000), "20", String(a.y / 1000), "11", String(b.x / 1000), "21", String(b.y / 1000))
  }
  // метка ориентации: диагональ из верхнего левого угла внутрь здания (ось Y вверх)
  const mx = Math.min(...Object.values(n).map((p) => p.x)), my = Math.max(...Object.values(n).map((p) => p.y))
  rows.push("0", "LINE", "8", "MARK", "10", String(mx / 1000), "20", String(my / 1000), "11", String((mx + 6000) / 1000), "21", String((my - 6000) / 1000))
  rows.push("0", "ENDSEC", "0", "EOF")
  await page.locator("#builder-underlay-file").setInputFiles({ name: "plan.dxf", mimeType: "application/dxf", buffer: Buffer.from(rows.join("\r\n")) })
  await page.waitForTimeout(1500)
  const u = (await floor()).underlay
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  check("DXF1 подложка создана", !!u)
  if (u) {
    check("DXF2 ширина в мм из метров", Math.abs(u.widthMm - w * 1.02) < w * 0.01 + 5, `${Math.round(u.widthMm)} vs ${w}`)
    check("DXF3 угол на своих координатах", Math.abs(u.x - (Math.min(...xs) - Math.max(w, h) * 0.01 - 1)) < 5 && Math.abs(u.y - (Math.min(...ys) - Math.max(w, h) * 0.01 - 1)) < 5, `${Math.round(u.x)},${Math.round(u.y)}`)
  }
  check("DXF4 сообщение о масштабе", (await page.locator("text=калибровка не нужна").count()) === 1)
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active") })
  await page.waitForTimeout(800)
  await shot("DXF-underlay")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
