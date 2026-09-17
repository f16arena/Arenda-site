import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4832)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4832/")
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



// ── MEP. сети: трасса, приборы, выбор, удаление, спецификация ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan"); s.setMode("mep") })
await page.waitForTimeout(1200)
{
  const f = await floor()
  const nodes = f.wallGraph.nodes
  const ext = Object.values(f.wallGraph.edges).filter((e) => e.kind === "exterior")
  const xs = Object.values(nodes).map((n) => n.x), ys = Object.values(nodes).map((n) => n.y)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  // нижняя наружная горизонтальная стена
  const wall = ext.filter((e) => Math.abs(nodes[e.a].y - nodes[e.b].y) < 5).sort((a, b) => nodes[a.a].y - nodes[b.a].y)[0]
  const wy = nodes[wall.a].y
  check("MEP0 режим «Сети» включил трассу", (await page.evaluate(() => window.__stores.useEditorStore.getState().activeTool)) === "mep-run")
  const pts = [[minX + 1500, wy + 1500], [minX + 5530, wy + 1480], [minX + 5500, wy + 4000]]
  for (const [x, y] of pts) { const p = await toScreen(x, y); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250) }
  await shot("MEP-run-preview")
  const last = await toScreen(pts[2][0], pts[2][1])
  await page.mouse.click(last.x, last.y); await page.waitForTimeout(700)
  let f2 = await floor()
  check("MEP1 трасса создана", f2.mepRuns.length === 1, String(f2.mepRuns.length))
  const run = f2.mepRuns[0]
  if (run) {
    check("MEP2 угол 45° выпрямил участки", run.points[1].y === run.points[0].y && run.points[2].x === run.points[1].x, JSON.stringify(run.points))
    check("MEP3 система и высота", run.system === "power" && run.height === 2800, `${run.system} ${run.height}`)
  }
  // прибор: розетка у стены
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("mep-device"); s.setMepDeviceKind("socket") })
  await page.waitForTimeout(200)
  const sp = await toScreen(minX + 3000, wy + 350)
  await page.mouse.move(sp.x, sp.y, { steps: 3 }); await page.mouse.click(sp.x, sp.y); await page.waitForTimeout(600)
  f2 = await floor()
  const sock = f2.mepDevices.find((d) => d.kind === "socket")
  check("MEP4 розетка на грани стены", !!sock && Math.abs(sock.at.y - (wy + wall.thickness / 2 + 20)) <= 1 && sock.height === 300, JSON.stringify(sock))
  // светильник: система меняется автоматически
  await page.evaluate(() => useEditorStore_setKind("lamp")).catch(async () => { await page.evaluate(() => window.__stores.useEditorStore.getState().setMepDeviceKind("lamp")) })
  const lp = await toScreen(minX + 3000, wy + 3000)
  await page.mouse.click(lp.x, lp.y); await page.waitForTimeout(600)
  f2 = await floor()
  const lamp = f2.mepDevices.find((d) => d.kind === "lamp")
  check("MEP5 светильник под потолком, система — освещение", !!lamp && lamp.system === "lighting" && lamp.height === f2.height - 130, JSON.stringify(lamp))
  const panelText = await page.locator("[data-testid=mep-panel]").innerText()
  check("MEP6 спецификация", panelText.includes("Розетка") && panelText.includes("Светильник потолочный") && panelText.includes("ВВГнг"), panelText.slice(0, 200))
  // выбор трассы кликом рядом с линией и удаление
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  await page.waitForTimeout(200)
  const onRun = await toScreen(minX + 3500, wy + 1500 + 40)
  await page.mouse.move(onRun.x, onRun.y, { steps: 3 }); await page.mouse.click(onRun.x, onRun.y); await page.waitForTimeout(500)
  const s1 = await sel()
  check("MEP7 клик выбирает трассу", s1.type === "mep-run", JSON.stringify(s1))
  await shot("MEP-selected")
  await page.keyboard.press("Delete"); await page.waitForTimeout(500)
  check("MEP8 Delete удаляет трассу", (await floor()).mepRuns.length === 0)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500)
  check("MEP9 Ctrl+Z возвращает", (await floor()).mepRuns.length === 1)
  // слой выключен — трасса не выбирается
  await page.evaluate(() => window.__stores.useEditorStore.getState().toggleMepLayer("power"))
  await page.waitForTimeout(600)
  await page.mouse.click(onRun.x, onRun.y); await page.waitForTimeout(400)
  check("MEP10 скрытый слой не выбирается", (await sel()).type !== "mep-run", JSON.stringify(await sel()))
  await page.evaluate(() => window.__stores.useEditorStore.getState().toggleMepLayer("power"))
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setSelection({ type: "none" }); s.setCameraMode("orbit") })
  await page.waitForTimeout(1500)
  await shot("MEP-3d")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
