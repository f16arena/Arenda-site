import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4828)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4828/")
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


// ── D2. удаление помещения и скана в конструкторе ──
{
  const f = await floor()
  const roomsBefore = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room"))
  // самое маленькое помещение
  const r = roomsBefore.sort((a, b) => a.areaMm2 - b.areaMm2)[0]
  await page.mouse.click(r.x, r.y); await page.waitForTimeout(400)
  check("D2-1 помещение выбрано", (await sel()).type === "room")
  await page.locator("button", { hasText: "Удалить помещение" }).click(); await page.waitForTimeout(600)
  const roomsAfter = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room").length)
  check("D2-2 помещение исчезло, соседние остались", roomsAfter === roomsBefore.length - 1, `${roomsBefore.length} → ${roomsAfter}`)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(600)
  const back = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "room").length)
  check("D2-3 Ctrl+Z вернул помещение", back === roomsBefore.length)

  // скан: положить и удалить с подтверждением
  await page.evaluate(() => {
    const d = window.__stores.useDocumentStore.getState()
    const st = window.__stores.useEditorStore.getState()
    const c = document.createElement("canvas"); c.width = 40; c.height = 30
    const url = c.toDataURL()
    const doc = d.doc
    d.loadDocument({ ...doc, buildings: doc.buildings.map((b) => ({ ...b, floors: b.floors.map((fl) => fl.id === st.activeLevelId ? { ...fl, underlay: { url, widthMm: 10000, aspect: 4 / 3, x: 0, y: 0, rotationDeg: 0, opacity: 0.6 } } : fl) })) })
  })
  await page.waitForTimeout(500)
  await page.locator("button", { hasText: "Удалить скан" }).click()
  await page.waitForTimeout(200)
  check("D2-4 скан не удалён без подтверждения", !!(await floor()).underlay)
  await page.locator("button", { hasText: "Да, удалить" }).click(); await page.waitForTimeout(400)
  check("D2-5 скан удалён после подтверждения", !(await floor()).underlay)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
