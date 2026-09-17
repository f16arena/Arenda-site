import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4819)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4819/")
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

// ── A. ручка: выделить стену, потянуть её угол ──
{
  const f = await floor()
  // внешняя нижняя стена: самая длинная горизонтальная с максимальным y
  const edges = Object.values(f.wallGraph.edges).map((e) => ({ e, a: f.wallGraph.nodes[e.a], b: f.wallGraph.nodes[e.b] }))
  const horiz = edges.filter((x) => Math.abs(x.a.y - x.b.y) < 1)
  const maxY = Math.max(...horiz.map((x) => x.a.y))
  const bottom = horiz.filter((x) => Math.abs(x.a.y - maxY) < 1).sort((p, q) => Math.abs(q.a.x - q.b.x) - Math.abs(p.a.x - p.b.x))[0]
  const mid = await toScreen((bottom.a.x + bottom.b.x) / 2, bottom.a.y)
  await click(mid)
  const s = await sel()
  check("A1 клик по нижней стене выделил её", s.type === "wall" && s.id === bottom.e.id, JSON.stringify(s))
  const grips = await page.evaluate(() => window.__engine.grips.length)
  check("A2 у выделенной стены две ручки", grips === 2, String(grips))
  // тянем узел a на 1 м вниз (наружу)
  const na = bottom.a
  const from = await toScreen(na.x, na.y)
  const to = await toScreen(na.x + 30, na.y + 1000)
  await drag(from, to)
  const f2 = await floor()
  const moved = f2.wallGraph.nodes[na.id]
  check("A3 узел сдвинулся примерно на 1 м вниз", moved && Math.abs(moved.y - (na.y + 1000)) <= 100, JSON.stringify(moved))
  check("A4 узел не ушёл вбок (ось соседа держит x)", moved && Math.abs(moved.x - na.x) < 1, JSON.stringify({ was: na.x, now: moved?.x }))
  await shot("A-grip-drag")
  await page.keyboard.press("Control+z")
  await page.waitForTimeout(500)
  const f3 = await floor()
  check("A5 Ctrl+Z вернул узел", f3.wallGraph.nodes[na.id].y === na.y)
}

// ── B. клик по пустому месту снимает выделение, ручки уходят ──
{
  await click({ x: 1000, y: 820 })
  const s = await sel()
  const grips = await page.evaluate(() => window.__engine.grips.length)
  check("B1 клик мимо снимает выделение", s.type !== "wall", JSON.stringify(s))
  check("B2 ручки исчезли", grips === 0, String(grips))
}

// ── C. нарисовать замкнутую комнату стенами 4×3 м снаружи здания ──
{
  const f = await floor()
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x)
  const ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  const x0 = Math.round(Math.max(...xs) + 3000), y0 = Math.round(Math.min(...ys))
  const roomsBefore = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room").length)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("wall"))
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("plan"))
  await page.waitForTimeout(400)
  // отзумимся, чтобы влезла зона справа
  await page.mouse.move(800, 450); await page.mouse.wheel(0, 1200); await page.waitForTimeout(900)
  const pts = [[x0, y0], [x0 + 4000, y0], [x0 + 4000, y0 + 3000], [x0, y0 + 3000], [x0, y0]]
  for (const [x, y] of pts) {
    const p = await toScreen(x, y)
    await page.mouse.move(p.x - 3, p.y - 3)
    await page.mouse.move(p.x, p.y, { steps: 3 })
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(250)
  }
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)
  const f2 = await floor()
  const added = Object.values(f2.wallGraph.edges).filter((e) => !f.wallGraph.edges[e.id])
  const lens = added.map((e) => Math.round(Math.hypot(f2.wallGraph.nodes[e.a].x - f2.wallGraph.nodes[e.b].x, f2.wallGraph.nodes[e.a].y - f2.wallGraph.nodes[e.b].y))).sort((a, b) => a - b)
  check("C1 четыре стены 3/3/4/4 м", JSON.stringify(lens) === JSON.stringify([3000, 3000, 4000, 4000]), JSON.stringify(lens))
  const roomsAfter = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room").length)
  check("C2 контур замкнулся в комнату", roomsAfter === roomsBefore + 1, `${roomsBefore} → ${roomsAfter}`)
  await shot("C-room-by-walls")
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
}

// ── D. дверь на стену новой комнаты ──
{
  const f = await floor()
  const e = Object.values(f.wallGraph.edges).at(-1)
  const a = f.wallGraph.nodes[e.a], b = f.wallGraph.nodes[e.b]
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("door"))
  await page.waitForTimeout(200)
  const p = await toScreen((a.x + b.x) / 2, (a.y + b.y) / 2)
  await click(p)
  const f2 = await floor()
  check("D1 дверь встала", f2.openings.length === f.openings.length + 1, `${f.openings.length} → ${f2.openings.length}`)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
}

// ── E. Delete удаляет выделенную стену ──
{
  const f = await floor()
  const e = Object.values(f.wallGraph.edges).at(-2)
  const a = f.wallGraph.nodes[e.a], b = f.wallGraph.nodes[e.b]
  await click(await toScreen((a.x + b.x) / 2, (a.y + b.y) / 2))
  const s = await sel()
  await page.keyboard.press("Delete")
  await page.waitForTimeout(500)
  const f2 = await floor()
  check("E1 Delete удалил выделенную стену", s.type === "wall" && !f2.wallGraph.edges[s.id], JSON.stringify(s))
  await page.keyboard.press("Control+z")
  await page.waitForTimeout(500)
  const f3 = await floor()
  check("E2 Ctrl+Z вернул стену", !!f3.wallGraph.edges[s.id])
}


// ── F. длина стены числом в панели ──
{
  const f = await floor()
  const horiz = Object.values(f.wallGraph.edges).map((e) => ({ e, a: f.wallGraph.nodes[e.a], b: f.wallGraph.nodes[e.b] })).filter((x) => Math.abs(x.a.y - x.b.y) < 1 && Math.abs(x.a.x - x.b.x) > 2000)
  const w = horiz[0]
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  await page.evaluate(({ id, floorId }) => window.__stores.useEditorStore.getState().setSelection({ type: "wall", id, floorId }), { id: w.e.id, floorId: f.id })
  await page.waitForTimeout(300)
  const input = page.locator("#builder-wall-length")
  await input.fill("2.5")
  await input.press("Enter")
  await page.waitForTimeout(500)
  const f2 = await floor()
  const e2 = f2.wallGraph.edges[w.e.id]
  const L = Math.round(Math.hypot(f2.wallGraph.nodes[e2.a].x - f2.wallGraph.nodes[e2.b].x, f2.wallGraph.nodes[e2.a].y - f2.wallGraph.nodes[e2.b].y))
  check("F1 длина из панели 2.5 м", L === 2500, String(L))
  check("F2 первый конец остался на месте", f2.wallGraph.nodes[e2.a].x === w.a.x && f2.wallGraph.nodes[e2.a].y === w.a.y)
  await page.keyboard.press("Control+z")
  await page.waitForTimeout(400)
}

// ── G. Esc во время перетаскивания стены ──
{
  const f = await floor()
  const s = await sel()
  const e = f.wallGraph.edges[s.id]
  const a = f.wallGraph.nodes[e.a], b = f.wallGraph.nodes[e.b]
  const mid = await toScreen((a.x + b.x) / 2, (a.y + b.y) / 2)
  await page.mouse.move(mid.x, mid.y)
  await page.mouse.down()
  await page.mouse.move(mid.x + 10, mid.y + 60, { steps: 8 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await page.waitForTimeout(500)
  const f2 = await floor()
  check("G1 Esc отменил перетаскивание", JSON.stringify(f2.wallGraph) === JSON.stringify(f.wallGraph))
  const s2 = await sel()
  check("G2 после Esc стена всё ещё выделена", s2.type === "wall" && s2.id === s.id)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
