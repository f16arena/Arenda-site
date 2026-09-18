// Автомебель в 3D: появляется по назначению помещений, выключается кнопкой,
// не пишется в документ и не мешает выбирать стены.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4847)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4847/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1500)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const furnish = () => page.evaluate(() => {
  const sc = window.__engine.bundle.scene
  const list = sc.meshes.filter((m) => m.metadata?.kind === "furnish")
  return { count: list.length, pickable: list.filter((m) => m.isPickable).length, verts: list.reduce((s, m) => s + m.getTotalVertices(), 0) }
})
const docState = () => page.evaluate(() => {
  const d = window.__doc()
  return { objects: d.buildings[0].floors.reduce((s, f) => s + f.objects.length, 0), site: d.site.objects.length }
})

await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setDisplayMode("all") })
await page.waitForTimeout(1500)

// ── M1. мебель построена ──
{
  const f = await furnish()
  check("M1 мебель и светильники построены", f.count > 0, JSON.stringify(f))
  await page.screenshot({ path: join(shots, "furnish-on.png") })
}

// ── M2. мебель не перехватывает клики ──
{
  const f = await furnish()
  check("M2 мебель не мешает выбирать стены", f.pickable === 0, `кликабельных ${f.pickable}`)
}

// ── M3. мебели нет в документе ──
{
  const d = await docState()
  check("M3 автомебель не пишется в документ", d.objects === 0 && d.site === 0, JSON.stringify(d))
}

// ── M4. мебель стоит внутри здания ──
{
  const out = await page.evaluate(() => {
    const sc = window.__engine.bundle.scene
    const walls = sc.meshes.filter((m) => m.metadata?.kind === "wall")
    if (!walls.length) return { bad: -1 }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const w of walls) {
      const bb = w.getBoundingInfo().boundingBox
      minX = Math.min(minX, bb.minimumWorld.x); maxX = Math.max(maxX, bb.maximumWorld.x)
      minZ = Math.min(minZ, bb.minimumWorld.z); maxZ = Math.max(maxZ, bb.maximumWorld.z)
    }
    const bad = []
    for (const m of sc.meshes) {
      if (m.metadata?.kind !== "furnish") continue
      const bb = m.getBoundingInfo().boundingBox
      if (bb.minimumWorld.x < minX - 0.3 || bb.maximumWorld.x > maxX + 0.3 || bb.minimumWorld.z < minZ - 0.3 || bb.maximumWorld.z > maxZ + 0.3) bad.push(m.name)
    }
    return { bad: bad.length, names: bad.slice(0, 3) }
  })
  check("M4 мебель не вылезает за здание", out.bad === 0, JSON.stringify(out))
}

// ── M5. кнопка выключает мебель ──
{
  await page.evaluate(() => window.__stores.useLabelStore.getState().toggleFurniture())
  await page.waitForTimeout(1800)
  const f = await furnish()
  check("M5 кнопка «Мебель» убирает мебель", f.count === 0, JSON.stringify(f))
  await page.screenshot({ path: join(shots, "furnish-off.png") })
  await page.evaluate(() => window.__stores.useLabelStore.getState().toggleFurniture())
  await page.waitForTimeout(1800)
  const back = await furnish()
  check("M6 кнопка возвращает мебель", back.count > 0, JSON.stringify(back))
}

// ── M7. в лёгком режиме мебели нет (экономия на слабых картах) ──
{
  await page.evaluate(() => window.__engine.setTurbo(true))
  await page.waitForTimeout(1800)
  const f = await furnish()
  check("M7 лёгкий режим без мебели", f.count === 0, JSON.stringify(f))
  await page.evaluate(() => window.__engine.setTurbo(false))
  await page.waitForTimeout(1800)
}

// ── M8. вид изнутри: обстановка видна в режиме Walk ──
{
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("walk"))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(shots, "furnish-walk.png") })
  const seen = await page.evaluate(() => window.__engine.bundle.scene.meshes.filter((m) => m.metadata?.kind === "furnish").length)
  check("M8 обстановка на месте в режиме Walk", seen > 0, `мешей ${seen}`)
  const col = await page.evaluate(() => {
    const list = window.__engine.bundle.scene.meshes.filter((m) => m.metadata?.kind === "furnish-collider")
    return { count: list.length, collide: list.filter((m) => m.checkCollisions).length, visible: list.filter((m) => m.isVisible).length }
  })
  check("M9 мебель — преграда в обходе, но невидимая", col.count > 0 && col.collide === col.count && col.visible === 0, JSON.stringify(col))
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
