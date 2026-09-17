import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4823)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4823/")
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

await page.evaluate(() => {
  const s = window.__stores.useEditorStore.getState()
  s.setDisplayMode("active")
  s.setCameraMode("plan")
})
await page.waitForTimeout(1200)


// ── S. привязки инструмента стены ──
{
  const f = await floor()
  const edges = Object.values(f.wallGraph.edges).map((e) => ({ e, a: f.wallGraph.nodes[e.a], b: f.wallGraph.nodes[e.b] }))
  const horiz = edges.filter((x) => Math.abs(x.a.y - x.b.y) < 1)
  const maxY = Math.max(...horiz.map((x) => x.a.y))
  const top = horiz.filter((x) => Math.abs(x.a.y - maxY) < 1).sort((p, q) => Math.abs(q.a.x - q.b.x) - Math.abs(p.a.x - p.b.x))[0]
  const corner = top.a.x < top.b.x ? top.a : top.b
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("wall"))
  await page.waitForTimeout(300)
  // старт рядом с углом (≈6 px мимо) — должен встать ровно в угол
  const c = await toScreen(corner.x, corner.y)
  await page.mouse.move(c.x + 5, c.y - 4, { steps: 4 })
  await page.waitForTimeout(150)
  const marker = await page.evaluate(() => ({ on: window.__engine.snapMarker?.isEnabled() ?? false, kind: window.__engine.snapMarkerKind }))
  check("S1 у угла маркер привязки «узел»", marker.on && marker.kind === "node", JSON.stringify(marker))
  await page.mouse.click(c.x + 5, c.y - 4)
  await page.waitForTimeout(200)
  // конец — у середины нижней внешней стены с промахом ~5 px: Т-примыкание
  const minY = Math.min(...horiz.map((x) => x.a.y))
  const bottom = horiz.filter((x) => Math.abs(x.a.y - minY) < 1).sort((p, q) => Math.abs(q.a.x - q.b.x) - Math.abs(p.a.x - p.b.x))[0]
  const midX = (bottom.a.x + bottom.b.x) / 2
  const m = await toScreen(midX, bottom.a.y)
  await page.mouse.move(m.x + 3, m.y + 5, { steps: 6 })
  await page.waitForTimeout(150)
  const marker2 = await page.evaluate(() => ({ on: window.__engine.snapMarker?.isEnabled() ?? false, kind: window.__engine.snapMarkerKind }))
  check("S2 у стены маркер «на стене»", marker2.on && marker2.kind === "edge", JSON.stringify(marker2))
  await page.mouse.click(m.x + 3, m.y + 5)
  await page.waitForTimeout(300)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)
  const f2 = await floor()
  const added = Object.values(f2.wallGraph.edges).filter((e) => !f.wallGraph.edges[e.id])
  const pts = added.flatMap((e) => [f2.wallGraph.nodes[e.a], f2.wallGraph.nodes[e.b]])
  const startOk = pts.some((n) => Math.abs(n.x - corner.x) < 1 && Math.abs(n.y - corner.y) < 1)
  const endOnWall = pts.some((n) => Math.abs(n.y - bottom.a.y) < 1 && n.x > Math.min(bottom.a.x, bottom.b.x) && n.x < Math.max(bottom.a.x, bottom.b.x))
  check("S3 начало встало ровно в угол", startOk, JSON.stringify({ corner, pts }))
  check("S4 конец встал на стену (Т-примыкание)", endOnWall)
  await shot("S-snaps")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
