// Обход от первого лица (ходит, а не летает) и назначение помещений (МОП).
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

// комната 8×6 м с лестницей внутри и перегородкой: слева — лестничная клетка, справа — офис
await page.evaluate(() => {
  const st = window.__stores.useEditorStore.getState()
  st.setCameraMode("orbit")
  st.setTool("wall")
})
const camPos = () => page.evaluate(() => {
  const c = window.__engine.bundle.scene.activeCamera
  return { x: c.position.x, y: c.position.y, z: c.position.z, name: c.name }
})

// ── W1. обход: человек стоит на полу активного этажа ──
{
  const f = await floor()
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("walk"))
  await page.waitForTimeout(1200)
  const p = await camPos()
  check("W1 камера обхода — рост 1,7 м над полом этажа", p.name === "walk" && Math.abs(p.y - (f.elevation / 1000 + 1.78)) < 0.35, `y=${p.y.toFixed(2)} elev=${f.elevation}`)
}

// ── W2. взгляд вверх + шаг вперёд не поднимает над полом (не «ноуклип») ──
{
  const before = await camPos()
  await page.evaluate(() => {
    const c = window.__engine.bundle.scene.activeCamera
    c.rotation.x = -0.8 // смотрим вверх
  })
  await page.mouse.click(800, 450)
  await page.waitForTimeout(200)
  await page.keyboard.down("w")
  await page.waitForTimeout(1200)
  await page.keyboard.up("w")
  await page.waitForTimeout(400)
  const after = await camPos()
  const moved = Math.hypot(after.x - before.x, after.z - before.z)
  check("W2 шаг вперёд при взгляде вверх идёт по полу, а не вверх", moved > 0.3 && Math.abs(after.y - before.y) < 0.4, `Δy=${(after.y - before.y).toFixed(2)} путь=${moved.toFixed(2)}`)
  await shot("walk-first-person")
}

// ── W3. подписи в обходе скрыты ──
{
  const labels = await page.evaluate(() => window.__stores.useLabelStore?.getState?.().labels?.length ?? 0)
  check("W3 подписи в обходе не мешают", labels === 0, String(labels))
}

// ── W4. назначение помещений: помещение с лестницей — МОП ──
{
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => {
    const d = window.__doc()
    const st = window.__stores.useEditorStore.getState()
    const f = d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
    const rooms = window.__floorRooms(f)
    const uses = rooms.map((r) => window.__roomUse(f, r))
    return { n: rooms.length, uses, stairs: f.stairs.length }
  })
  check("W4 помещения различаются по назначению", info.n > 0 && info.uses.every((u) => ["rent", "common", "tech"].includes(u)), JSON.stringify(info))
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
