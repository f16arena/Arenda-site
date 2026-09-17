import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4841)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4841/")
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






// ── DIMS. размеры выделенного элемента прямо на плане ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForTimeout(900)
{
  const f = await floor()
  const n = f.wallGraph.nodes
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const minX = Math.min(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const edit = async (key, value) => {
    await page.locator(`[data-testid^="dim-${key}"]`).first().click()
    const input = page.locator(`[data-testid^="edit-${key}"]`).first()
    await input.fill(String(value)); await input.press("Enter"); await page.waitForTimeout(350)
  }
  // лестница: прямой марш и колонна кладём командами, выбираем в плане
  await page.evaluate((fid) => {
    const ds = window.__stores.useDocumentStore.getState()
    const doc = ds.doc
    const add = (st) => doc.buildings[0].floors.find((x) => x.id === fid).stairs.push(st)
    add({ id: "stT", shape: "straight", fromFloorId: fid, toFloorId: fid, position: { x: 0, y: 0 }, rotationDeg: 0, width: 1100, railing: true })
    add({ id: "colT", shape: "column", fromFloorId: fid, toFloorId: fid, position: { x: 3000, y: 3000 }, rotationDeg: 0, width: 500, depth: 500, railing: false })
    ds.loadDocument({ ...doc })
    window.__stores.useEditorStore.getState().setSelection({ type: "stair", id: "stT", floorId: fid })
  }, f.id)
  await page.waitForTimeout(500)
  check("D0 у лестницы три размера", (await page.locator('[data-testid^="dim-s"]').count()) === 3)
  await edit("sl", 4200)
  let st = (await floor()).stairs.find((x) => x.id === "stT")
  // 21 подступенок при 3500 → длина 4200 / 21 = 200 → ограничение 220 мм
  check("D1 длина марша меняет проступь (с ограничением 220–450)", st.tread === 220, String(st.tread))
  await edit("sh", 3000)
  st = (await floor()).stairs.find((x) => x.id === "stT")
  check("D2 высота подъёма лестницы", st.rise === 3000, String(st.rise))
  await edit("sw", 1400)
  check("D3 ширина марша", (await floor()).stairs.find((x) => x.id === "stT").width === 1400)
  // колонна
  await page.evaluate((fid) => window.__stores.useEditorStore.getState().setSelection({ type: "stair", id: "colT", floorId: fid }), f.id)
  await page.waitForTimeout(300)
  await edit("cd", 700)
  check("D4 глубина колонны", (await floor()).stairs.find((x) => x.id === "colT").depth === 700)
  // стена: длина и толщина
  const wall = Object.values(f.wallGraph.edges).find((e) => e.kind === "exterior" && !f.openings.some((o) => o.wallId === e.id)) ?? Object.values(f.wallGraph.edges)[0]
  await page.evaluate(({ fid, id }) => window.__stores.useEditorStore.getState().setSelection({ type: "wall", id, floorId: fid }), { fid: f.id, id: wall.id })
  await page.waitForTimeout(300)
  await edit("wt", 450)
  check("D5 толщина стены", (await floor()).wallGraph.edges[wall.id].thickness === 450)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(300)
  check("D6 Ctrl+Z откатывает толщину", (await floor()).wallGraph.edges[wall.id].thickness === wall.thickness)
  // дверь
  const door = f.openings.find((o) => o.type === "door")
  await page.evaluate(({ fid, id }) => window.__stores.useEditorStore.getState().setSelection({ type: "opening", id, floorId: fid }), { fid: f.id, id: door.id })
  await page.waitForTimeout(300)
  await edit("ow", 1000)
  check("D7 ширина двери", (await floor()).openings.find((o) => o.id === door.id).width === 1000)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setSelection({ type: "stair", id: "stT", floorId: window.__stores.useEditorStore.getState().activeLevelId }))
  await page.waitForTimeout(400)
  await shot("DIMS-plan")

  // привязка «по линии»: стена от точки рядом с X угла здания встаёт ровно в X узла
  const box = await page.locator("[data-testid=plan-editor]").boundingBox()
  const V = await page.evaluate(() => window.__planView)
  const S = (x, y) => ({ x: box.x + x * V.k + V.tx, y: box.y - y * V.k + V.ty })
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setSelection({ type: "none" }); s.setTool("wall") })
  const tolMm = 10 / V.k
  const p1 = S(minX + tolMm * 0.5, maxY + 4000), p2 = S(minX + tolMm * 0.5, maxY + 8000)
  const before = Object.keys((await floor()).wallGraph.edges)
  await page.mouse.move(p1.x, p1.y); await page.mouse.click(p1.x, p1.y); await page.waitForTimeout(150)
  await page.mouse.move(p2.x, p2.y, { steps: 3 }); await page.mouse.click(p2.x, p2.y); await page.waitForTimeout(250)
  await page.mouse.click(p2.x, p2.y, { button: "right" }); await page.waitForTimeout(300)
  const f3 = await floor()
  const nw = Object.values(f3.wallGraph.edges).find((e) => !before.includes(e.id))
  const xa = nw && f3.wallGraph.nodes[nw.a].x, xb = nw && f3.wallGraph.nodes[nw.b].x
  check("D8 стена выровнена по X угла здания", !!nw && xa === minX && xb === minX, `${xa} ${xb} vs ${minX}`)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
