// Физика обхода: не проходим сквозь стены, поднимаемся по лестнице, не падаем
// сквозь пол, мышь смотрит без зажатой кнопки (захват указателя).
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4844)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4844/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(800)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const cam = () => page.evaluate(() => {
  const c = window.__engine.bundle.scene.activeCamera
  return { x: c.position.x, y: c.position.y, z: c.position.z, name: c.name }
})
const walkTo = async (x, y, z, rotY, rotX = 0) => page.evaluate(({ x, y, z, rotY, rotX }) => {
  const c = window.__engine.bundle.scene.activeCamera
  c.position.set(x, y, z)
  c.rotation.set(rotX, rotY, 0)
  c.cameraDirection.setAll(0)
}, { x, y, z, rotY, rotX })
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(300) }

// сцена: прямоугольная комната 12×8 м со стенами и прямой лестницей у дальней стены
await page.evaluate(() => {
  const d = window.__stores.useDocumentStore.getState()
  const doc = d.doc
  const f = doc.buildings[0].floors[0]
  const up = doc.buildings[0].floors[1]
  const stairs = [{ id: "st_walk", shape: "straight", fromFloorId: f.id, toFloorId: up?.id ?? f.id, position: { x: 9000, y: -2000 }, rotationDeg: 0, width: 1400, railing: true }]
  const floors = doc.buildings[0].floors.map((fl) => (fl.id === f.id ? { ...fl, stairs } : fl))
  d.loadDocument({ ...doc, buildings: [{ ...doc.buildings[0], floors }] })
  const st = window.__stores.useEditorStore.getState()
  st.setActiveLevel(f.id)
  st.setDisplayMode("all")
  st.setCameraMode("walk")
})
await page.waitForTimeout(1500)
await page.mouse.click(640, 360)
await page.waitForTimeout(300)

// ── K1. стоим на полу активного этажа ──
{
  const p = await cam()
  check("K1 обход включён и человек стоит на полу", p.name === "walk" && p.y > 1.4 && p.y < 2.4, `y=${p.y.toFixed(2)}`)
}

// ── K2. сквозь стену не проходим ──
{
  const floor = await page.evaluate(() => {
    const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
    const f = d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
    const ns = Object.values(f.wallGraph.nodes)
    return { minX: Math.min(...ns.map((n) => n.x)), maxX: Math.max(...ns.map((n) => n.x)), minY: Math.min(...ns.map((n) => n.y)), maxY: Math.max(...ns.map((n) => n.y)) }
  })
  // встаём в метре от левой стены и идём прямо в неё
  const x = floor.minX / 1000 + 1.2
  const z = (floor.minY + floor.maxY) / 2000
  await walkTo(x, 1.78, z, -Math.PI / 2)
  await page.waitForTimeout(400)
  const before = await cam()
  await hold("w", 1800)
  const after = await cam()
  const wallX = floor.minX / 1000
  check("K2 стена не пропускает сквозь себя", after.x > wallX - 0.1, `x: ${before.x.toFixed(2)} → ${after.x.toFixed(2)}, стена ${wallX.toFixed(2)}`)
}

// ── K3. по лестнице поднимаемся ──
{
  // встаём перед нижней ступенью и идём вперёд
  await walkTo(9.7, 1.78, -3.8, 0)
  await page.waitForTimeout(400)
  const before = await cam()
  await hold("w", 2600)
  const after = await cam()
  check("K3 по лестнице можно подняться", after.y > before.y + 0.4, `y: ${before.y.toFixed(2)} → ${after.y.toFixed(2)}, z: ${before.z.toFixed(2)} → ${after.z.toFixed(2)}`)
  await page.screenshot({ path: join(shots, "walk-stairs.png") })
}

// ── K4. сквозь пол не проваливаемся ──
{
  const p = await cam()
  check("K4 не проваливаемся сквозь пол", p.y > 0.5, `y=${p.y.toFixed(2)}`)
}

// ── K6. скорость шага человеческая (не улитка и не ракета) ──
{
  // открытое место снаружи здания, чтобы ничто не мешало
  await walkTo(0, 1.78, 40, 0)
  await page.waitForTimeout(400)
  const before = await cam()
  const t0 = Date.now()
  await hold("w", 2000)
  const dt = (Date.now() - t0) / 1000
  const after = await cam()
  const dist = Math.hypot(after.x - before.x, after.z - before.z)
  const v = dist / dt
  const fps = await page.evaluate(() => Math.round(window.__engine.getFps()))
  check("K6 скорость шага 0,8–3 м/с", v > 0.8 && v < 3, `${v.toFixed(2)} м/с при ${fps} к/с`)
}

// ── K5. мышь смотрит без зажатой кнопки (захват указателя) ──
{
  const locked = await page.evaluate(() => ({
    requested: !!window.__engine.pointerLockRequested,
    element: !!document.pointerLockElement,
  }))
  check("K5 включается захват указателя для обзора мышью", locked.requested, JSON.stringify(locked))
}

// ── K7. на верхнем этаже тоже не проходим сквозь стены и не проваливаемся ──
{
  await page.evaluate(() => {
    const d = window.__doc()
    const st = window.__stores.useEditorStore.getState()
    const upper = d.buildings[0].floors[1]
    st.setActiveLevel(upper.id)
    st.setCameraMode("orbit")
  })
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("walk"))
  await page.waitForTimeout(1400)
  const f = await page.evaluate(() => {
    const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
    const fl = d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
    const ns = Object.values(fl.wallGraph.nodes)
    return { elev: fl.elevation, minX: Math.min(...ns.map((n) => n.x)), minY: Math.min(...ns.map((n) => n.y)), maxY: Math.max(...ns.map((n) => n.y)) }
  })
  const start = await cam()
  check("K7a на 2 этаже человек стоит на его полу", Math.abs(start.y - (f.elev / 1000 + 1.78)) < 0.5, `y=${start.y.toFixed(2)}, отметка ${f.elev}`)
  await walkTo(f.minX / 1000 + 1.2, f.elev / 1000 + 1.78, (f.minY + f.maxY) / 2000, -Math.PI / 2)
  await page.waitForTimeout(400)
  await page.mouse.click(640, 360)
  await hold("w", 1800)
  const after = await cam()
  check("K7b стена держит и на 2 этаже", after.x > f.minX / 1000 - 0.1, `x=${after.x.toFixed(2)}, стена ${(f.minX / 1000).toFixed(2)}`)
  check("K7c не провалился на этаж ниже", after.y > f.elev / 1000 + 0.9, `y=${after.y.toFixed(2)}`)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
