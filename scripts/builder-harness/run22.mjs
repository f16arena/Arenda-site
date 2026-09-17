// Мебель в редакторе плана: постановка из каталога, выбор и перетаскивание.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4843)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4843/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(800)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const floor = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  return d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
})
const objects = async () => (await floor()).objects ?? []

await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForSelector("[data-testid=plan-editor]")
await page.waitForTimeout(700)

// экранная точка по координатам плана (через вид редактора)
const toScreen = (x, y) => page.evaluate(({ x, y }) => {
  const v = window.__planView
  return { x: x * v.k + v.tx, y: -y * v.k + v.ty }
}, { x, y })

// ── F1. объект ставится кликом в плане ──
{
  await page.evaluate(() => {
    const s = window.__stores.useEditorStore.getState()
    s.setTool("object")
    s.armAsset("office_desk")
  })
  const f = await floor()
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x)
  const ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const p = await toScreen(cx, cy)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(500)
  const list = await objects()
  check("F1 мебель ставится из плана", list.length === 1 && list[0].assetId === "office_desk", JSON.stringify(list.map((o) => o.assetId)))
}

// ── F2. клик выбирает объект ──
{
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  const [ob] = await objects()
  const p = await toScreen(ob.position.x, ob.position.z)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(400)
  const sel = await page.evaluate(() => window.__stores.useEditorStore.getState().selection)
  check("F2 объект выбирается кликом в плане", sel.type === "object" && sel.id === ob.id, JSON.stringify(sel))
}

// ── F3. перетаскивание двигает объект ──
{
  const [before] = await objects()
  const a = await toScreen(before.position.x, before.position.z)
  const b = { x: a.x + 90, y: a.y + 40 }
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const [after] = await objects()
  const moved = Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z)
  check("F3 объект двигается мышью", moved > 300, `сдвиг ${Math.round(moved)} мм`)
  await page.screenshot({ path: join(shots, "plan-objects.png") })
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
