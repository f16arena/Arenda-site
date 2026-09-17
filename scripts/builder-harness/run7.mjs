import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4827)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4827/")
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


// ── R. рамка и групповое удаление ──
{
  const f = await floor()
  const total = Object.keys(f.wallGraph.edges).length
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x), ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  const tl = await toScreen(Math.min(...xs) - 1500, Math.max(...ys) + 1500)
  const br = await toScreen(Math.max(...xs) + 1500, Math.min(...ys) - 1500)
  const multi = () => page.evaluate(() => window.__stores.useEditorStore.getState().multi)
  // слева направо вокруг всего этажа
  await page.mouse.move(tl.x, tl.y); await page.mouse.down()
  await page.mouse.move((tl.x + br.x) / 2, (tl.y + br.y) / 2, { steps: 5 })
  const boxVisible = await page.evaluate(() => [...document.querySelectorAll("div")].some((d) => d.style.border.includes("solid") && d.style.border.includes("1.5px")))
  await page.mouse.move(br.x, br.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400)
  const m1 = await multi()
  check("R1 рамка видна во время протяжки", boxVisible)
  check("R2 рамка вокруг этажа выбрала все стены", m1.length === total, `${m1.length} из ${total}`)
  await page.keyboard.press("Delete"); await page.waitForTimeout(500)
  check("R3 Delete удалил все выбранные стены", Object.keys((await floor()).wallGraph.edges).length === 0)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500)
  check("R4 один Ctrl+Z вернул все стены", Object.keys((await floor()).wallGraph.edges).length === total)
  await shot("R-box")

  // справа налево маленькой рамкой через одну внутреннюю стену: «задетые»
  const f2 = await floor()
  const inner = Object.values(f2.wallGraph.edges).map((e) => ({ e, a: f2.wallGraph.nodes[e.a], b: f2.wallGraph.nodes[e.b] }))
    .filter((x) => Math.abs(x.a.x - x.b.x) < 1 && x.a.x > Math.min(...xs) + 100 && x.a.x < Math.max(...xs) - 100)[0]
  const mid = await toScreen(inner.a.x, (inner.a.y + inner.b.y) / 2)
  await page.mouse.move(mid.x + 25, mid.y - 10); await page.mouse.down()
  await page.mouse.move(mid.x - 25, mid.y + 10, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(400)
  const s2 = await sel(); const m2 = await multi()
  const picked = m2.length ? m2 : s2.id ? [s2.id] : []
  check("R5 рамка справа налево взяла задетую стену", picked.includes(inner.e.id), JSON.stringify({ m2, s2 }))

  // клик без протяжки по помещению по-прежнему выбирает помещение
  const rooms = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room"))
  await page.mouse.click(rooms[0].x, rooms[0].y); await page.waitForTimeout(400)
  check("R6 клик по помещению выбирает его", (await sel()).type === "room", JSON.stringify(await sel()))

  // Shift+клик: две стены в наборе
  const e2 = Object.values(f2.wallGraph.edges).slice(0, 2).map((e) => ({ a: f2.wallGraph.nodes[e.a], b: f2.wallGraph.nodes[e.b], id: e.id }))
  const p1 = await toScreen((e2[0].a.x + e2[0].b.x) / 2, (e2[0].a.y + e2[0].b.y) / 2)
  const p2 = await toScreen((e2[1].a.x + e2[1].b.x) / 2, (e2[1].a.y + e2[1].b.y) / 2)
  await page.mouse.click(p1.x, p1.y); await page.waitForTimeout(300)
  await page.keyboard.down("Shift"); await page.mouse.click(p2.x, p2.y); await page.keyboard.up("Shift"); await page.waitForTimeout(300)
  const m3 = await multi()
  check("R7 Shift+клик собрал две стены", m3.length === 2 && m3.includes(e2[0].id) && m3.includes(e2[1].id), JSON.stringify(m3))
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
