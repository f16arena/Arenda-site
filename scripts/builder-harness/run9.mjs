import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4829)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4829/")
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


// ── P. цоколь: отметка пола и стопка этажей ──
{
  const levels = () => page.evaluate(() => window.__doc().buildings[0].floors.map((f) => ({ name: f.name, level: f.level, el: f.elevation, h: f.height })))
  // сделать нижний этаж цокольным (уровень 0), как у F16
  await page.evaluate(() => {
    const d = window.__stores.useDocumentStore.getState()
    const doc = d.doc
    const floors = doc.buildings[0].floors.map((f, i) => ({ ...f, level: i, name: i === 0 ? "0 этаж" : `${i} этаж`, elevation: i * 3500 }))
    d.loadDocument({ ...doc, buildings: [{ ...doc.buildings[0], floors }] })
    window.__stores.useEditorStore.getState().setActiveLevel(floors[0].id)
  })
  await page.waitForTimeout(600)
  await page.locator("button", { hasText: "Цоколь в землю" }).click()
  await page.waitForTimeout(600)
  const l1 = await levels()
  check("P1 цоколь в земле", l1[0].el === -l1[0].h, JSON.stringify(l1))
  check("P2 этаж выше опустился вместе с ним", l1[1].el === l1[0].el + l1[0].h, JSON.stringify(l1))
  // ручной ввод отметки на верхнем этаже
  await page.evaluate((id) => window.__stores.useEditorStore.getState().setActiveLevel(id), (await page.evaluate(() => window.__doc().buildings[0].floors[1].id)))
  await page.waitForTimeout(400)
  await page.locator("#builder-floor-elevation").fill("2")
  await page.locator("#builder-floor-elevation").press("Enter")
  await page.waitForTimeout(400)
  const l2 = await levels()
  check("P3 отметка из поля применилась", l2[1].el === 2000, JSON.stringify(l2))
  check("P4 нижний этаж не тронут", l2[0].el === l1[0].el)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(300)
  check("P5 Ctrl+Z вернул отметку", (await levels())[1].el === l1[1].el)
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("all"); s.setCameraMode("plan"); s.setCameraMode("orbit") })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__engine.orbitTo(-Math.PI / 2, Math.PI / 2.2))
  await page.evaluate(() => window.__engine.frameAll())
  await page.waitForTimeout(1200)
  await shot("P-plinth-side")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
