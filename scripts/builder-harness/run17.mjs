import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4838)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4838/")
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





// ── PANEL. щит: разбивка по группам и расчётная таблица ──
{
  const f = await floor()
  const n = f.wallGraph.nodes
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const devices = [
    { id: "pn", system: "power", kind: "panel", at: { x: x0 + 400, y: y0 + 2000 }, height: 1500, rotation: 0, label: "ЩР-1", power: 12000 },
    ...[1, 2, 3].map((i) => ({ id: `s${i}`, system: "power", kind: "socket2", at: { x: x0 + 1000 * i, y: y0 + 600 }, height: 300, rotation: 0, label: "", power: 600 })),
    { id: "l1", system: "lighting", kind: "lamp", at: { x: x0 + 3000, y: y0 + 3000 }, height: 3300, rotation: 0, label: "", power: 36 },
    { id: "k1", system: "power", kind: "socket380", at: { x: x0 + 5000, y: y0 + 600 }, height: 1000, rotation: 0, label: "", power: 5000 },
  ]
  await page.evaluate(({ fid, devices }) => {
    const ds = window.__stores.useDocumentStore.getState()
    const doc = ds.doc
    const next = { ...doc, buildings: doc.buildings.map((b) => ({ ...b, floors: b.floors.map((fl) => (fl.id === fid ? { ...fl, mepDevices: devices } : fl)) })) }
    ds.loadDocument(next)
    const s = window.__stores.useEditorStore.getState()
    s.setMode("mep"); s.setSelection({ type: "mep-device", id: "pn", floorId: fid })
  }, { fid: f.id, devices })
  await page.waitForTimeout(800)
  await page.getByRole("button", { name: "Разбить по группам" }).click()
  await page.waitForTimeout(600)
  const f2 = await floor()
  const g = Object.fromEntries(f2.mepDevices.map((d) => [d.id, d.group]))
  check("PNL1 приборы получили щит и группы", f2.mepDevices.filter((d) => d.kind !== "panel").every((d) => d.panelId === "pn" && d.group > 0), JSON.stringify(g))
  check("PNL2 380 В — отдельная группа", f2.mepDevices.filter((d) => d.group === g.k1).length === 1)
  const table = await page.locator("text=вводной").innerText().catch(() => "")
  check("PNL3 расчётная таблица щита в свойствах", /Руст .* кВт/.test(table), table)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400)
  check("PNL4 разбивка откатывается одним шагом", (await floor()).mepDevices.every((d) => !d.group))
  await shot("PANEL-props")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
