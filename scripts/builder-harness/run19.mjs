import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4840)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4840/")
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






// ── PLAN2D-B. рамка, группа, рулетка, разрез, сети — всё в редакторе плана ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForTimeout(900)
{
  const box = await page.locator("[data-testid=plan-editor]").boundingBox()
  const V = await page.evaluate(() => window.__planView)
  const S = (x, y) => ({ x: box.x + x * V.k + V.tx, y: box.y - y * V.k + V.ty })
  const f = await floor()
  const n = f.wallGraph.nodes
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const midX = (minX + maxX) / 2

  // 1. рамка слева направо вокруг правой половины: только стены целиком внутри
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  let a = S(midX + 500, maxY + 800), b = S(maxX + 800, minY - 800)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(300)
  const inside = await page.evaluate(() => window.__stores.useEditorStore.getState().multi)
  const expectInside = Object.values(f.wallGraph.edges).filter((e) => n[e.a].x >= midX + 500 && n[e.b].x >= midX + 500).length
  check("B1 рамка «окно» берёт стены внутри", inside.length === expectInside && inside.length > 0, `${inside.length} vs ${expectInside}`)
  // справа налево — «секущая», задевает больше
  a = S(maxX + 800, maxY + 800); b = S(midX + 500, minY - 800)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(300)
  const crossing = await page.evaluate(() => window.__stores.useEditorStore.getState().multi)
  check("B2 рамка «секущая» берёт и задетые", crossing.length > inside.length, `${crossing.length} > ${inside.length}`)
  // 2. копия группы из редактора плана
  await page.locator("#group-dx").fill("0")
  await page.locator("#group-dy").fill("-15")
  await page.getByRole("button", { name: "Копия", exact: true }).click()
  await page.waitForTimeout(500)
  const f2 = await floor()
  check("B3 копия группы видна в плане и в модели", Object.keys(f2.wallGraph.edges).length >= Object.keys(f.wallGraph.edges).length + crossing.length - 2)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(300)
  await page.keyboard.press("Escape")
  await page.evaluate(() => window.__stores.useEditorStore.getState().clearMulti())

  // 3. Shift+клик набирает стены
  const walls = Object.values(f.wallGraph.edges).filter((e) => e.kind !== "exterior" && !f.openings.some((o) => o.wallId === e.id)).slice(0, 2)
  for (const w of walls) {
    const c = S(n[w.a].x * 0.75 + n[w.b].x * 0.25, n[w.a].y * 0.75 + n[w.b].y * 0.25)
    await page.keyboard.down("Shift"); await page.mouse.click(c.x, c.y); await page.keyboard.up("Shift"); await page.waitForTimeout(150)
  }
  check("B4 Shift+клик набирает две стены", (await page.evaluate(() => window.__stores.useEditorStore.getState().multi.length)) === 2)
  await page.evaluate(() => window.__stores.useEditorStore.getState().clearMulti())

  // 4. рулетка по узлам
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("measure"))
  const c1 = S(minX, minY), c2 = S(maxX, minY)
  await page.mouse.click(c1.x + 3, c1.y - 3); await page.waitForTimeout(150); await page.mouse.move(c2.x, c2.y, { steps: 5 }); await page.mouse.click(c2.x - 3, c2.y + 3); await page.waitForTimeout(250)
  const hint = await page.locator("text=Рулетка:").innerText()
  check("B5 рулетка по узлам даёт точный габарит", hint.includes(`${Math.round(maxX - minX)} мм`), hint)

  // 5. разрез двумя кликами
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("section"))
  const s1 = S(minX - 2000, (minY + maxY) / 2), s2 = S(maxX + 2000, (minY + maxY) / 2 + 150)
  await page.mouse.click(s1.x, s1.y); await page.waitForTimeout(150); await page.mouse.click(s2.x, s2.y); await page.waitForTimeout(300)
  const secs = await page.evaluate(() => window.__doc().buildings[0].sections ?? [])
  check("B6 разрез добавлен из плана, выпрямлен", secs.length === 1 && Math.abs(secs[0].a.y - secs[0].b.y) < 1, JSON.stringify(secs[0]))

  // 6. трасса сети и розетка
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setMepSystem("power"); s.setTool("mep-run") })
  for (const [x, y] of [[minX + 1000, minY + 1000], [minX + 5000, minY + 1000], [minX + 5000, minY + 3000]]) { const q = S(x, y); await page.mouse.click(q.x, q.y); await page.waitForTimeout(120) }
  const lastQ = S(minX + 5000, minY + 3000)
  await page.mouse.click(lastQ.x, lastQ.y, { button: "right" }); await page.waitForTimeout(300)
  const runs = (await floor()).mepRuns
  check("B7 трасса из трёх точек", runs.length === 1 && runs[0].points.length === 3, JSON.stringify(runs.map((r) => r.points.length)))
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setMepDeviceKind("socket"); s.setTool("mep-device") })
  const sq = S(minX + 2500, minY + 300)
  await page.mouse.click(sq.x, sq.y); await page.waitForTimeout(300)
  const sock = (await floor()).mepDevices.find((d) => d.kind === "socket")
  check("B8 розетка прижата к стене", !!sock && sock.rotation !== undefined && Math.abs(sock.at.y - minY) < 400, JSON.stringify(sock))
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  const hov = S(midX, maxY)
  await page.mouse.move(hov.x, hov.y); await page.waitForTimeout(200)
  await shot("PLAN2D-B")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
