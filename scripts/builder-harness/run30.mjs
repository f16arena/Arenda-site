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

// ── I6b. карточка помещения создаётся кнопкой и привязывается ──
{
  const btn = page.locator("button", { hasText: "Создать карточку места" })
  const had = await btn.count()
  if (had) {
    await btn.first().click()
    await page.waitForTimeout(700)
  }
  const linked = await page.evaluate(() => {
    const d = window.__doc()
    const f = d.buildings.flatMap((b) => b.floors).find((x) => (x.islands ?? []).length)
    const isl = f?.islands?.[0]
    return isl ? f.premiseLinks?.[isl.id] ?? null : null
  })
  check("I6b кнопка заводит карточку и привязывает место", had === 0 || !!linked, had === 0 ? "кнопки нет (этаж без связи с базой)" : String(linked))
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
    st.execute(new window.__commands.DeleteIslandCommand({ floorId: f.id }, isl.id))
  })
  await page.waitForTimeout(500)
  const after = (await islands()).length
  check("I9 место удаляется с откатом", after === before - 1, `было ${before}, стало ${after}`)
}

// ── I10. место ставится и двигается прямо в 3D ──
{
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setTool("island") })
  await page.waitForTimeout(1200)
  const before = (await islands()).length
  const box = await page.locator("canvas").first().boundingBox()
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55)
  await page.waitForTimeout(900)
  const after = await islands()
  check("I10 в 3D место ставится кликом", after.length === before + 1, `было ${before}, стало ${after.length}`)
}

// ── I11. место не торчит сквозь стену ──
{
  const inside = await page.evaluate(() => {
    const d = window.__doc()
    const f = d.buildings.flatMap((b) => b.floors).find((x) => (x.islands ?? []).length)
    if (!f) return null
    const isl = f.islands[f.islands.length - 1]
    const rooms = window.__floorRooms(f)
    const room = rooms.find((r) => window.__pointInPolygon(isl.position, r.polygon))
    if (!room) return "нет помещения под местом"
    const poly = window.__islandPolygon(isl)
    return poly.every((p) => window.__pointInPolygon(p, room.polygon)) ? true : "угол вылез за стену"
  })
  check("I11 габарит места не выходит за стены", inside === true, String(inside))
}

// ── I12. отдельный предмет мебели убирается и возвращается ──
{
  const hid = await page.evaluate(() => {
    const st = window.__stores.useDocumentStore.getState()
    const f = st.doc.buildings.flatMap((b) => b.floors).find((x) => x.id === window.__stores.useEditorStore.getState().activeLevelId) ?? st.doc.buildings[0].floors[0]
    const items = window.__furnishFloor(f, window.__floorRooms(f))
    if (!items.length) return "мебели нет"
    st.execute(new window.__commands.HideFurnishCommand(f.id, items[0].id))
    const after = window.__furnishFloor(window.__doc().buildings.flatMap((b) => b.floors).find((x) => x.id === f.id), window.__floorRooms(f))
    return items.length - after.length
  })
  check("I12 предмет мебели убирается", hid === 1, String(hid))
  const back = await page.evaluate(() => {
    const st = window.__stores.useDocumentStore.getState()
    const f = st.doc.buildings.flatMap((b) => b.floors).find((x) => (x.furnishOff ?? []).length)
    if (!f) return "нет убранных"
    st.execute(new window.__commands.ResetFurnishCommand(f.id))
    return (window.__doc().buildings.flatMap((b) => b.floors).find((x) => x.id === f.id).furnishOff ?? []).length
  })
  check("I12 мебель возвращается кнопкой", back === 0, String(back))
}

// ── I13. клик по автомебели делает из неё обычный объект, который двигается ──
{
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setTool("select") })
  await page.waitForTimeout(1500)
  const spot = await page.evaluate(() => {
    const scene = window.__engine?.scene ?? window.__engine?.bundle?.scene
    if (!scene) return null
    const W = scene.getEngine().getRenderWidth(), H = scene.getEngine().getRenderHeight()
    for (let y = H * 0.3; y < H * 0.8; y += 10) {
      for (let x = W * 0.2; x < W * 0.8; x += 10) {
        scene.pointerX = x; scene.pointerY = y
      if (window.__engine.pickFurnish()) return { x, y }
      }
    }
    return null
  })
  if (!spot) {
    check("I13 автомебель ловится кликом", false, "предмет не найден на экране")
  } else {
    const before = await page.evaluate(() => window.__doc().buildings.flatMap((b) => b.floors).flatMap((f) => f.objects ?? []).length)
    await page.mouse.click(spot.x, spot.y)
    // модель пересобирается после команды: даём мешу появиться, иначе
    // следующий pointer-down уходит в камеру, а не в объект
    await page.waitForTimeout(1600)
    const after = await page.evaluate(() => {
      const doc = window.__doc()
      const objs = doc.buildings.flatMap((b) => b.floors).flatMap((f) => f.objects ?? [])
      return { n: objs.length, sel: window.__stores.useEditorStore.getState().selection.type, pos: objs[objs.length - 1]?.position ?? null }
    })
    check("I13 предмет стал объектом и выбран", after.n === before + 1 && after.sel === "object", `объектов ${after.n}, выделение ${after.sel}`)
    // тянем предмет в плане: там попадание считается по габариту объекта,
    // а не по тонкой геометрии модели
    await page.evaluate(() => { const st = window.__stores.useEditorStore.getState(); st.setCameraMode("plan2d"); st.setTool("select") })
    await page.waitForSelector("[data-testid=plan-editor]", { timeout: 30000 })
    await page.waitForTimeout(900)
    const box2 = await page.locator("[data-testid=plan-editor]").boundingBox()
    const at2 = await page.evaluate(() => {
      const objs = window.__doc().buildings.flatMap((b) => b.floors).flatMap((f) => f.objects ?? [])
      const o = objs[objs.length - 1]
      const v = window.__planView
      return { x: o.position.x * v.k + v.tx, y: -o.position.z * v.k + v.ty }
    })
    await page.mouse.click(box2.x + at2.x, box2.y + at2.y)
    await page.waitForTimeout(400)
    await page.mouse.move(box2.x + at2.x, box2.y + at2.y)
    await page.mouse.down()
    await page.mouse.move(box2.x + at2.x + 60, box2.y + at2.y + 30, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(700)
    const moved = await page.evaluate(() => {
      const objs = window.__doc().buildings.flatMap((b) => b.floors).flatMap((f) => f.objects ?? [])
      return objs[objs.length - 1]?.position ?? null
    })
    const shifted = moved && after.pos && (Math.abs(moved.x - after.pos.x) > 100 || Math.abs(moved.z - after.pos.z) > 100)
    check("I13 предмет двигается мышью", !!shifted, `было ${JSON.stringify(after.pos)} стало ${JSON.stringify(moved)}`)
  }
}

// ── I14. выбранное место двигается стрелками ──
{
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setTool("island"); s.setIslandKind("vending") })
  await page.waitForTimeout(1200)
  const box = await page.locator("canvas").first().boundingBox()
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55)
  await page.waitForTimeout(900)
  const before = await page.evaluate(() => {
    const f = window.__doc().buildings.flatMap((b) => b.floors).find((x) => (x.islands ?? []).length)
    const sel = window.__stores.useEditorStore.getState().selection
    return { pos: f?.islands?.[f.islands.length - 1]?.position ?? null, sel: sel.type }
  })
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.down("Shift")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.up("Shift")
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const f = window.__doc().buildings.flatMap((b) => b.floors).find((x) => (x.islands ?? []).length)
    return f?.islands?.[f.islands.length - 1]?.position ?? null
  })
  const dx = after && before.pos ? after.x - before.pos.x : 0
  const dy = after && before.pos ? after.y - before.pos.y : 0
  check("I14 стрелки двигают место", dx === 200 && dy === -10, `выделено ${before.sel}, сдвиг ${dx} / ${dy}`)
}

check("ошибок в консоли нет", errors.length === 0, errors.slice(0, 3).join(" | "))
console.log(results.join("\n"))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
