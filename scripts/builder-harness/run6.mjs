import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4826)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4826/")
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


// ── Q. медленный сервер: автосейвы не должны давать конфликт одному пользователю ──
{
  const status = () => page.evaluate(() => window.__stores.useSyncStore.getState().status)
  const bump = (n) => page.evaluate((n) => {
    const d = window.__stores.useDocumentStore.getState()
    const st = window.__stores.useEditorStore.getState()
    const f = d.doc.buildings[0].floors.find((x) => x.id === st.activeLevelId)
    const e = Object.values(f.wallGraph.edges)[0]
    const hh = 3000 + n * 10
    // правка через стор документа — как из панели свойств
    d.execute({ kind: "t", label: "t", apply: (doc) => ({ ...doc, buildings: doc.buildings.map((b) => ({ ...b, floors: b.floors.map((fl) => fl.id !== f.id ? fl : ({ ...fl, wallGraph: { ...fl.wallGraph, edges: { ...fl.wallGraph.edges, [e.id]: { ...e, height: hh } } } })) })) }), revert: (doc) => doc })
  }, n)
  // первое сохранение создаёт проект
  await bump(1)
  await page.waitForFunction(() => window.__stores.useSyncStore.getState().status === "saved", null, { timeout: 15000 })
  await page.evaluate(() => { window.__saveDelay = 5000 })
  await bump(2)
  await page.waitForTimeout(4300) // автосейв №1 ушёл и висит 5 с
  await bump(3)
  await page.waitForTimeout(4300) // автосейв №2 стартует, пока №1 в пути
  await bump(4)
  await page.waitForFunction(() => { const s = window.__stores.useSyncStore.getState(); return s.status === "saved" && window.__stores.useDocumentStore.getState().rev === s.lastSavedRev }, null, { timeout: 40000 }).catch(() => {})
  const conflicts = await page.evaluate(() => window.__conflicts)
  const st = await status()
  check("Q1 перекрывающиеся автосейвы без конфликта", conflicts === 0, `конфликтов ${conflicts}`)
  check("Q2 в итоге всё сохранено", st === "saved", st)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
