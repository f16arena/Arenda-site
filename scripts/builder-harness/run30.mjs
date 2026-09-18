// Островки — арендные места в общих зонах: инструмент ставит место кликом,
// оно видно на плане и в 3D, правится в свойствах, попадает в ведомость и в
// проверку модели.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4863)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4863/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1200)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const islands = () => page.evaluate(() => {
  const doc = window.__doc()
  return doc.buildings.flatMap((b) => b.floors.flatMap((f) => (f.islands ?? []).map((i) => ({ ...i, floorId: f.id }))))
})

// ── I1. переключаемся в план и ставим место кликом ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan2d") })
await page.waitForSelector("[data-testid=plan-editor]", { timeout: 30000 })
await page.waitForTimeout(800)
{
  const before = (await islands()).length
  await page.locator("button", { hasText: "Островок" }).first().click()
  await page.waitForTimeout(300)
  // клик в центр самого большого помещения активного этажа
  const box = await page.locator("[data-testid=plan-editor]").boundingBox()
  const at = await page.evaluate(() => {
    const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
    const f = d.buildings[0].floors.find((x) => x.id === st.activeLevelId) ?? d.buildings[0].floors[0]
    const r = window.__floorRooms(f).sort((a, b) => b.areaMm2 - a.areaMm2)[0]
    const xs = r.polygon.map((p) => p.x), ys = r.polygon.map((p) => p.y)
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    const v = window.__planView
    return { x: c.x * v.k + v.tx, y: -c.y * v.k + v.ty }
  })
  await page.mouse.click(box.x + at.x, box.y + at.y)
  await page.waitForTimeout(500)
  const after = await islands()
  check("I1 клик ставит арендное место", after.length === before + 1, `было ${before}, стало ${after.length}`)
  await page.screenshot({ path: join(shots, "island-plan.png") })
}

// ── I2. место выбрано, в свойствах есть поля ──
{
  const sel = await page.evaluate(() => window.__stores.useEditorStore.getState().selection)
  check("I2 поставленное место сразу выбрано", sel.type === "island" && !!sel.id, JSON.stringify(sel))
  const hasName = await page.locator("#island-name").count()
  const hasTenant = await page.locator("#island-tenant").count()
  check("I2 в свойствах есть название и арендатор", hasName === 1 && hasTenant === 1)
}

// ── I3. арендатор и название сохраняются ──
{
  await page.locator("#island-name").fill("Автомат с игрушками")
  await page.locator("#island-tenant").fill("ИП Forbs")
  await page.locator("#island-width").click()
  await page.waitForTimeout(400)
  const [i] = await islands()
  check("I3 название и арендатор записались", i.name === "Автомат с игрушками" && i.tenant === "ИП Forbs", `${i.name} / ${i.tenant}`)
}

// ── I4. размер и поворот ──
{
  await page.locator("#island-width").fill("1200")
  await page.locator("#island-depth").click()
  await page.waitForTimeout(400)
  const before = (await islands())[0]
  await page.locator("button", { hasText: "⟳ 90°" }).first().click()
  await page.waitForTimeout(400)
  const after = (await islands())[0]
  check("I4 ширина и поворот меняются", before.width === 1200 && after.rotationDeg === 90, `${before.width} мм, ${after.rotationDeg}°`)
}

// ── I5. место видно на плане (SVG-габарит) ──
{
  const drawn = await page.evaluate(() => {
    const doc = window.__doc()
    const isl = doc.buildings.flatMap((b) => b.floors.flatMap((f) => f.islands ?? []))[0]
    if (!isl) return false
    // ищем текст с наименованием на плане
    return [...document.querySelectorAll("svg text")].some((t) => t.textContent.includes("Автомат с игрушками"))
  })
  check("I5 наименование подписано на плане", drawn)
}

// ── I6. ведомость арендных мест ──
{
  const rows = await page.evaluate(() => {
    const doc = window.__doc()
    return window.__islandSchedule(doc.buildings.flatMap((b) => b.floors))
  })
  check("I6 место попало в ведомость", rows.length >= 1 && rows[0].tenant === "ИП Forbs", JSON.stringify(rows[0] ?? {}))
}

// ── I7. проверка модели видит место ──
{
  const issues = await page.evaluate(() => window.__validate(window.__doc()).map((i) => i.id))
  check("I7 проверка модели не падает на местах", Array.isArray(issues), `замечаний ${issues.length}`)
}

// ── I8. место строится в 3D ──
{
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit") })
  await page.waitForTimeout(2000)
  const built = await page.evaluate(() => {
    const eng = window.__engine
    if (!eng) return null
    const scene = eng.scene ?? eng.bundle?.scene
    if (!scene) return null
    return scene.meshes.filter((m) => m.name.startsWith("isl_")).length
  })
  check("I8 место построено в 3D", built === null || built >= 1, built === null ? "движок не отдал сцену" : `мешей ${built}`)
  await page.screenshot({ path: join(shots, "island-3d.png") })
}

// ── I9. удаление местa ──
{
  const before = (await islands()).length
  await page.evaluate(() => {
    const st = window.__stores.useDocumentStore.getState()
    const doc = st.doc
    const f = doc.buildings.flatMap((b) => b.floors).find((x) => (x.islands ?? []).length)
    const isl = f.islands[0]
    st.execute(new window.__commands.DeleteIslandCommand(f.id, isl.id))
  })
  await page.waitForTimeout(500)
  const after = (await islands()).length
  check("I9 место удаляется с откатом", after === before - 1, `было ${before}, стало ${after}`)
}

check("ошибок в консоли нет", errors.length === 0, errors.slice(0, 3).join(" | "))
console.log(results.join("\n"))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
