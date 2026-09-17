import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript" }
const server = http.createServer((req, res) => {
  const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0])
  try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) }
  catch { res.writeHead(404); res.end() }
}).listen(4817)

const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4817/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1500)

const results = []
const check = (name, ok, extra = "") => { results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }
const graph = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  const f = d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
  return JSON.stringify(f.wallGraph)
})
const sel = () => page.evaluate(() => window.__stores.useEditorStore.getState().selection)
const labels = () => page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "wall"))
const shot = (n) => page.screenshot({ path: join(shots, n + ".png") })

// план: камера сверху, активный этаж отдельно
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find((x)=>x.textContent.trim()==="1 этаж"); b?.click() })
await page.waitForTimeout(300)
await page.evaluate(() => { window.__stores.useEditorStore.getState().setDisplayMode?.("active") })
await page.mouse.move(800, 450)
await page.keyboard.press("3")
await page.waitForTimeout(1200)
await shot("01-plan")

let walls = await labels()
check("подписи стен есть", walls.length > 0, `стен ${walls.length}`)
const w0 = walls.sort((a, b) => b.lengthMm - a.lengthMm)[0]
const before = await graph()
const skew0 = (() => { const g = JSON.parse(before); return Object.values(g.edges).filter((ed) => { const a = g.nodes[ed.a], b = g.nodes[ed.b]; return Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5 }).length })()
check("исходно косых стен", true, String(skew0))

// 1. клик по невыделенной стене с дрожанием 3px — выделение, геометрия та же
await page.mouse.move(w0.x, w0.y)
await page.mouse.down()
await page.mouse.move(w0.x + 3, w0.y + 2, { steps: 3 })
await page.mouse.up()
await page.waitForTimeout(400)
check("клик с дрожанием не двигает стену", (await graph()) === before)
const s1 = await sel()
check("клик выделяет стену", s1.type === "wall", JSON.stringify(s1))

// 2. повторный клик по выделенной стене с дрожанием 3px — тоже ничего
await page.mouse.move(w0.x, w0.y)
await page.mouse.down()
await page.mouse.move(w0.x + 2, w0.y + 3, { steps: 3 })
await page.mouse.up()
await page.waitForTimeout(400)
check("клик по выделенной стене с дрожанием не двигает", (await graph()) === before)

// 3. правая кнопка: панорама со стены — геометрия та же
await page.mouse.move(w0.x, w0.y)
await page.mouse.down({ button: "right" })
await page.mouse.move(w0.x + 120, w0.y + 80, { steps: 10 })
await page.mouse.up({ button: "right" })
await page.waitForTimeout(600)
check("панорама правой кнопкой со стены не двигает стену", (await graph()) === before)
await shot("02-after-pan")

// вернуть камеру
await page.keyboard.press("3")
await page.waitForTimeout(1200)
walls = await labels()
const w1 = walls.find((l) => l.id === w0.id)

// 4. тянуть выделенную стену по диагонали: двигается только перпендикулярно
await page.mouse.move(w1.x, w1.y)
await page.mouse.down()
await page.mouse.move(w1.x + 90, w1.y + 90, { steps: 15 })
await page.waitForTimeout(200)
await shot("03-drag-wall")
await page.mouse.up()
await page.waitForTimeout(700)
const afterPush = JSON.parse(await graph())
const b0 = JSON.parse(before)
const e = b0.edges[w0.id]
const na0 = b0.nodes[e.a], nb0 = b0.nodes[e.b]
const e1 = afterPush.edges[w0.id]
const na1 = e1 ? afterPush.nodes[e1.a] : null, nb1 = e1 ? afterPush.nodes[e1.b] : null
const horizontal = na0.y === nb0.y
const moved = na1 && (horizontal ? na1.y !== na0.y : na1.x !== na0.x)
const along = na1 && (horizontal ? na1.x !== na0.x || nb1.x !== nb0.x : na1.y !== na0.y || nb1.y !== nb0.y)
check("выделенная стена сдвинулась", !!moved, JSON.stringify({ na0, na1 }))
check("стена не уехала вдоль своей оси", !along)
const skew = Object.values(afterPush.edges).filter((ed) => { const a = afterPush.nodes[ed.a], b = afterPush.nodes[ed.b]; return Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5 })
check("после сдвига нет косых стен", skew.length === 0, `косых ${skew.length}`)
await shot("04-after-push")

// 5. Ctrl+Z возвращает
await page.keyboard.press("Control+z")
await page.waitForTimeout(700)
check("Ctrl+Z возвращает сдвиг", (await graph()) === before)

// 6. ручки: у выделенной стены две, тянем одну
const s6 = await sel()
check("после отмены стена всё ещё выделена", s6.type === "wall", JSON.stringify(s6))


// 8. рисование стены с вводом длины «5.25»
{
  const g0 = JSON.parse(await graph())
  await page.keyboard.press("Escape")
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("wall"))
  await page.waitForTimeout(300)
  await page.mouse.click(700, 250)
  await page.mouse.move(760, 250, { steps: 6 })
  await page.waitForTimeout(200)
  await page.keyboard.type("5.25")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(700)
  const g1 = JSON.parse(await graph())
  const added = Object.values(g1.edges).filter((e) => !g0.edges[e.id])
  const lens = added.map((e) => Math.round(Math.hypot(g1.nodes[e.a].x - g1.nodes[e.b].x, g1.nodes[e.a].y - g1.nodes[e.b].y)))
  check("стена по введённой длине 5.25 м", lens.includes(5250), JSON.stringify(lens))
  await shot("05-typed-wall")
  await page.keyboard.press("Escape")
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
}

// 9. «План» наводит на этаж, колесо зумит
{
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("plan"))
  await page.waitForTimeout(800)
  await shot("06-plan-framed")
  const before9 = (await labels()).map((l) => [Math.round(l.x), Math.round(l.y)])
  await page.mouse.move(800, 450)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(1500)
  const after9 = (await labels()).map((l) => [Math.round(l.x), Math.round(l.y)])
  check("колесо в плане зумит", JSON.stringify(before9) !== JSON.stringify(after9))
  await shot("07-plan-zoomed")
}

// 10. кнопка «Выбор» видна и кликабельна
{
  const vis = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Выбор")
    if (!b) return "нет кнопки"
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return b.contains(top) ? "ok" : "перекрыта: " + (top?.textContent ?? "").slice(0, 30)
  })
  check("кнопка «Выбор» не перекрыта", vis === "ok", vis)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
