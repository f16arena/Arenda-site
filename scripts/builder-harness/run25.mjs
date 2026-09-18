// Режим «Участок»: видно всё здание и можно править элементы любого этажа,
// не переключая уровень.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4846)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4846/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1200)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)

// орбита + уровень «Участок»
await page.evaluate(() => {
  const s = window.__stores.useEditorStore.getState()
  s.setCameraMode("orbit")
  s.setDisplayMode("active")
  s.setActiveLevel("site")
})
await page.waitForTimeout(1200)
await page.evaluate(() => window.__engine.frameAll())
// камера доезжает по инерции: считать экранные координаты можно только после
await page.waitForTimeout(2200)

const topId = await page.evaluate(() => {
  const b = window.__doc().buildings[0]
  return b.floors[b.floors.length - 1].id
})

// ── S1. на участке видны все этажи ──
{
  const vis = await page.evaluate(() => {
    const scene = window.__engine.bundle.scene
    const byFloor = {}
    for (const m of scene.meshes) {
      const fid = m.metadata?.floorId
      if (!fid) continue
      byFloor[fid] = byFloor[fid] || { shown: 0, total: 0 }
      byFloor[fid].total++
      if (m.isEnabled() && m.visibility > 0.05) byFloor[fid].shown++
    }
    return byFloor
  })
  const floors = Object.keys(vis)
  const all = floors.length >= 2 && floors.every((f) => vis[f].shown > 0)
  check("S1 на участке видны все этажи", all, JSON.stringify(vis))
}

// экранная точка, где кликом попадаем в стену верхнего этажа
const spot = await page.evaluate((topId) => {
  const eng = window.__engine
  const scene = eng.bundle.scene
  const cam = scene.activeCamera
  const engine = eng.bundle.engine
  const W = engine.getRenderWidth(), H = engine.getRenderHeight()
  const canvas = engine.getRenderingCanvas()
  const scale = canvas && canvas.clientWidth > 0 ? canvas.clientWidth / W : 1
  const vp = cam.viewport.toGlobal(W, H)
  const tm = scene.getTransformMatrix()
  const Matrix = tm.constructor
  for (const m of scene.meshes) {
    if (m.metadata?.kind !== "wall" || m.metadata?.floorId !== topId) continue
    const c = m.getBoundingInfo().boundingSphere.centerWorld
    const V = c.constructor
    const p = V.Project(c, Matrix.Identity(), tm, vp)
    // точка должна лежать на холсте, а не под панелями редактора
    if (!(p.x > 300 * (W / 1600) && p.y > 170 * (H / 900) && p.x < W - 290 * (W / 1600) && p.y < H - 120 * (H / 900))) continue
    const hit = scene.pick(p.x, p.y)
    const md = hit?.pickedMesh?.metadata
    if (hit?.hit && md?.floorId === topId && md?.kind === "wall" && md?.entityId) return { x: p.x * scale, y: p.y * scale, meta: { ...md } }
  }
  return null
}, topId)
check("S0 нашли точку на стене верхнего этажа", !!spot, spot ? `${Math.round(spot.x)},${Math.round(spot.y)} ${JSON.stringify(spot.meta)}` : "нет")

// ── S2. клик по чужому этажу не переключает уровень ──
if (spot) {
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  await page.mouse.click(spot.x, spot.y)
  await page.waitForTimeout(600)
  const st = await page.evaluate(() => {
    const s = window.__stores.useEditorStore.getState()
    return { active: s.activeLevelId, site: s.siteFloorId, sel: s.selection }
  })
  check("S2 уровень остаётся «Участок», правка по этажу элемента",
    st.active === "site" && st.site === topId && st.sel.floorId === topId,
    JSON.stringify(st))
}

// ── S3. окно ставится на выбранный этаж без переключения уровня ──
if (spot) {
  const count = () => page.evaluate((id) => {
    const b = window.__doc().buildings[0]
    return b.floors.find((f) => f.id === id).openings.length
  }, topId)
  const before = await count()
  await page.evaluate(() => {
    const s = window.__stores.useEditorStore.getState()
    s.setTool("window")
    s.setOpeningType("window")
  })
  await page.mouse.click(spot.x, spot.y)
  await page.waitForTimeout(700)
  const after = await count()
  const st = await page.evaluate(() => window.__stores.useEditorStore.getState().activeLevelId)
  check("S3 окно ставится на этаж элемента, уровень не менялся", after === before + 1 && st === "site", `было ${before}, стало ${after}, уровень ${st}`)
  await page.screenshot({ path: join(shots, "site-edit.png") })
}

// ── S4. мебель на участке всё ещё кладётся на участок, а не на этаж ──
{
  const siteBefore = await page.evaluate(() => window.__doc().site.objects.length)
  await page.evaluate(() => {
    const s = window.__stores.useEditorStore.getState()
    s.setTool("object")
    s.armAsset("tree_pine")
  })
  await page.mouse.click(400, 700)
  await page.waitForTimeout(600)
  const res = await page.evaluate((id) => {
    const d = window.__doc()
    const f = d.buildings[0].floors.find((x) => x.id === id)
    return { site: d.site.objects.length, floor: f.objects.length }
  }, topId)
  check("S4 дерево на участке не уходит на этаж", res.site === siteBefore + 1, JSON.stringify(res))
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
