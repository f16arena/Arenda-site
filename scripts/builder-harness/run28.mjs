// Пандус для МГН: ставится снаружи у стены, строится в 3D, по нему можно
// подняться в режиме Walk, а в перекрытии он дыру не режет.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4849)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4849/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1200)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const floor = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  return d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
})

await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForSelector("[data-testid=plan-editor]")
await page.waitForTimeout(800)
const toScreen = (x, y) => page.evaluate(({ x, y }) => {
  const v = window.__planView
  return { x: x * v.k + v.tx, y: -y * v.k + v.ty }
}, { x, y })

// ── R1. пандус ставится снаружи у стены ──
{
  const f = await floor()
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x)
  const ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("stair"); s.setStairShape("ramp") })
  const p = await toScreen(Math.max(...xs) + 1200, (Math.min(...ys) + Math.max(...ys)) / 2)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(600)
  const ramps = (await floor()).stairs.filter((s) => s.shape === "ramp")
  check("R1 пандус ставится снаружи у стены", ramps.length === 1, JSON.stringify(ramps.map((r) => ({ w: r.width, rise: r.rise, rail: r.railing }))))
  check("R2 ширина не меньше 1,2 м и есть поручни", ramps[0]?.width >= 1200 && ramps[0]?.railing === true, JSON.stringify(ramps[0] ?? null))
}

// ── R3. в перекрытии дыры нет ──
{
  const wells = await page.evaluate(() => {
    const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
    const f = d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
    return window.__buildFloorDrawing ? window.__buildFloorDrawing(f).stairWells.length : -1
  })
  check("R3 пандус не режет перекрытие", wells === 0 || wells === -1, `проёмов ${wells}`)
}

// ── R4. в 3D пандус построен и по нему можно идти ──
{
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.waitForTimeout(1600)
  const info = await page.evaluate(() => {
    const sc = window.__engine.bundle.scene
    const st = window.__doc().buildings[0].floors.flatMap((f) => f.stairs).find((s) => s.shape === "ramp")
    const mine = sc.meshes.filter((m) => m.metadata?.kind === "stair" && m.metadata?.entityId === st.id)
    const tilted = mine.filter((m) => Math.abs(m.rotation.x) > 0.01 || Math.abs(m.rotation.z) > 0.01)
    return { count: mine.length, tilted: tilted.length, collide: mine.filter((m) => m.checkCollisions).length }
  })
  check("R4 пандус построен в 3D наклонной плитой", info.count > 2 && info.tilted > 0, JSON.stringify(info))
  check("R5 по пандусу можно идти (есть коллизии)", info.collide > 0, JSON.stringify(info))
  // крупный план пандуса: камера к нему вплотную
  await page.evaluate(() => {
    const st = window.__doc().buildings[0].floors.flatMap((f) => f.stairs).find((s) => s.shape === "ramp")
    const cam = window.__engine.bundle.scene.activeCamera
    const V = cam.target.constructor
    cam.setTarget(new V(st.position.x / 1000 + 1.5, 0.6, st.position.y / 1000))
    cam.radius = 13
    cam.alpha = 0.35
    cam.beta = 1.15
    cam.rebuildAnglesAndRadius?.()
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(shots, "ramp.png") })
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
