import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4834)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4834/")
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





// ── REPLAN. режим перепланировки: демонтаж, новая стена, сводка ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1200)
{
  const f = await floor()
  const n = f.wallGraph.nodes
  const inner = Object.values(f.wallGraph.edges).filter((e) => e.kind !== "exterior").sort((a, b) => Math.hypot(n[b.b].x - n[b.a].x, n[b.b].y - n[b.a].y) - Math.hypot(n[a.b].x - n[a.a].x, n[a.b].y - n[a.a].y))[0]
  await page.getByRole("button", { name: /^Перепланировка/ }).click()
  await page.waitForTimeout(300)
  check("REP0 режим включён", await page.evaluate(() => window.__stores.useEditorStore.getState().replanMode))
  // удалить существующую стену: выбрать кликом и Delete
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  const mid = await toScreen((n[inner.a].x + n[inner.b].x) / 2, (n[inner.a].y + n[inner.b].y) / 2)
  await page.mouse.move(mid.x, mid.y, { steps: 3 }); await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(400)
  await page.keyboard.press("Delete"); await page.waitForTimeout(600)
  let f2 = await floor()
  check("REP1 Delete пометил стену под демонтаж, не удалил", f2.wallGraph.edges[inner.id]?.phase === "demolish", JSON.stringify(f2.wallGraph.edges[inner.id]))
  // новая стена
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 1300, y0 = Math.min(...ys), y1 = Math.max(...ys)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("wall"))
  const A = await toScreen(cx, y0 + 1000), B = await toScreen(cx, y1 - 1000)
  await page.mouse.click(A.x, A.y); await page.waitForTimeout(250)
  await page.mouse.move(B.x, B.y, { steps: 5 }); await page.mouse.click(B.x, B.y); await page.waitForTimeout(250)
  await page.keyboard.press("Escape"); await page.waitForTimeout(500)
  f2 = await floor()
  const created = Object.values(f2.wallGraph.edges).filter((e) => e.phase === "new")
  check("REP2 новая стена помечена «новая»", created.length >= 1, String(created.length))
  const panel = await page.locator("text=Площадь стало").count()
  check("REP3 сводка перепланировки в панели этажа", panel === 1)
  await shot("REPLAN-plan")
  // удаление новой стены — настоящее
  await page.evaluate((id) => { const s = window.__stores.useEditorStore.getState(); s.setTool("select"); s.setSelection({ type: "wall", id, floorId: s.activeLevelId }) }, created[0].id)
  await page.waitForTimeout(200)
  await page.keyboard.press("Delete"); await page.waitForTimeout(500)
  check("REP4 новая стена удаляется совсем", !(await floor()).wallGraph.edges[created[0].id])
  // вернуть демонтируемую стену кнопкой статуса
  // новая стена разрезала помеченную: берём её части
  const demo = Object.values((await floor()).wallGraph.edges).filter((e) => e.phase === "demolish")
  check("REP4b части разрезанной стены сохранили демонтаж", demo.length >= 2, String(demo.length))
  await page.evaluate((id) => { const s = window.__stores.useEditorStore.getState(); s.setSelection({ type: "wall", id, floorId: s.activeLevelId }) }, demo[0].id)
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Существ." }).click()
  await page.waitForTimeout(400)
  check("REP5 кнопка «Существ.» снимает демонтаж", !(await floor()).wallGraph.edges[demo[0].id]?.phase)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.evaluate((id) => { const s = window.__stores.useEditorStore.getState(); s.setSelection({ type: "wall", id, floorId: s.activeLevelId }) }, demo[0].id)
  await page.getByRole("button", { name: "Демонтаж", exact: true }).click()
  await page.evaluate(() => window.__stores.useEditorStore.getState().setSelection({ type: "none" }))
  await page.waitForTimeout(1500)
  await shot("REPLAN-3d")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
