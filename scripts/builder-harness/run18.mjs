import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4839)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4839/")
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





// ── PLAN2D. редактор плана: тот же проект, что и 3D ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForTimeout(900)
{
  check("P2D0 редактор плана открыт", (await page.locator("[data-testid=plan-editor]").count()) === 1)
  // экранные координаты точки плана — из того же вида, что у редактора: ищем по стене
  const box = await page.locator("[data-testid=plan-editor]").boundingBox()
  const f = await floor()
  const n = f.wallGraph.nodes
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const pv = () => page.evaluate(() => window.__planView)
  let V = await pv()
  const S = (x, y) => ({ x: box.x + x * V.k + V.tx, y: box.y - y * V.k + V.ty })

  // 1. стена цепочкой: две стены справа от здания, вторая — длиной из клавиатуры
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("wall"))
  const x0 = maxX + 3000, y0 = cy
  const before = Object.keys(f.wallGraph.edges).length
  let p = S(x0, y0); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150)
  p = S(x0 + 4000, y0); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250)
  p = S(x0 + 4000, y0 + 2000); await page.mouse.move(p.x, p.y, { steps: 4 })
  await page.keyboard.type("3,5"); await page.keyboard.press("Enter"); await page.waitForTimeout(300)
  await page.mouse.click(p.x, p.y, { button: "right" }); await page.waitForTimeout(300)
  const f1 = await floor()
  const added = Object.values(f1.wallGraph.edges).filter((e) => !f.wallGraph.edges[e.id])
  const lens = added.map((e) => Math.round(Math.hypot(f1.wallGraph.nodes[e.b].x - f1.wallGraph.nodes[e.a].x, f1.wallGraph.nodes[e.b].y - f1.wallGraph.nodes[e.a].y))).sort((a, b) => a - b)
  check("P2D1 две стены цепочкой, вторая — 3,5 м с клавиатуры", added.length === 2 && lens[0] === 3500 && Math.abs(lens[1] - 4000) <= 50, `${before} → ${Object.keys(f1.wallGraph.edges).length} ${JSON.stringify(lens)}`)

  // 2. выбор стены кликом и перетаскивание поперёк
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  const first = added.find((e) => Math.abs(f1.wallGraph.nodes[e.a].y - f1.wallGraph.nodes[e.b].y) < 5)
  const midX = (f1.wallGraph.nodes[first.a].x + f1.wallGraph.nodes[first.b].x) / 2
  p = S(midX, y0); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250)
  check("P2D2 клик выбирает стену", (await sel()).type === "wall" && (await sel()).id === first.id, JSON.stringify(await sel()))
  await page.mouse.down(); const q = S(midX, y0 - 1000); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300)
  const f2 = await floor()
  const ya = f2.wallGraph.nodes[first.a].y
  check("P2D3 стена сдвинута на 1 м вниз одним жестом", Math.abs(ya - (y0 - 1000)) <= 50, String(ya - y0))
  await page.keyboard.press("Control+z"); await page.waitForTimeout(300)
  check("P2D4 Ctrl+Z возвращает сдвиг целиком", Math.abs((await floor()).wallGraph.nodes[first.a].y - y0) <= 1)

  // 3. дверь на стене и отметка эвакуационного выхода
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("door") })
  p = S(midX, y0); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300)
  const door = (await floor()).openings.find((o) => o.wallId === first.id)
  check("P2D5 дверь поставлена на стену в плане", !!door)
  await page.evaluate((id) => { const s = window.__stores.useEditorStore.getState(); s.setTool("select"); s.setSelection({ type: "opening", id, floorId: s.activeLevelId }) }, door?.id)
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Эвак. выход" }).click()
  await page.waitForTimeout(300)
  check("P2D6 дверь — эвакуационный выход", (await floor()).openings.find((o) => o.id === door?.id)?.exit === "emergency")
  check("P2D7 на плане надпись «ВЫХОД»", (await page.locator("[data-testid=plan-editor] text", { hasText: "ВЫХОД" }).count()) >= 1)

  // 4. лифт
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("stair"); s.setStairShape("elevator") })
  p = S(minX + 3000, cy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300)
  const lift = (await floor()).stairs.find((st) => st.shape === "elevator")
  check("P2D8 лифт поставлен", !!lift && lift.width === 2000)
  check("P2D9 на плане подпись «ЛИФТ»", (await page.locator("[data-testid=plan-editor] text", { hasText: "ЛИФТ" }).count()) >= 1)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setSelection({ type: "none" }))
  await page.waitForTimeout(300)
  await shot("PLAN2D-editor")

  // 5. тот же проект в 3D
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.waitForTimeout(1500)
  check("P2D10 в 3D редактор плана скрыт", (await page.locator("[data-testid=plan-editor]").count()) === 0)
  const meshes = await page.evaluate((id) => window.__engine.bundle.scene.meshes.filter((m) => m.name.startsWith("step_" + id)).length, lift?.id)
  check("P2D11 лифт построен в 3D из плана", meshes >= 5, String(meshes))
  await shot("PLAN2D-3d")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
