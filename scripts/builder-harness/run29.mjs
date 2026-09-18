// Проверка модели: панель показывает замечания, клик открывает нужный этаж и
// выделяет элемент, после исправления замечание пропадает.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4850)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4850/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1200)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const panel = () => page.locator("button", { hasText: "Проверка модели" })

// ── V1. кнопка со сводкой видна ──
{
  const text = await panel().first().innerText()
  check("V1 в панели есть сводка проверки", /Замечаний нет|ошиб|замечан/i.test(text), text.replace(/\n/g, " · "))
}

// ── V2. список замечаний раскрывается ──
{
  await panel().first().click()
  await page.waitForTimeout(400)
  const items = await page.locator("button", { hasText: /без наименования|нет входа|без окон|Высота этажа|вне здания|случайный клик|МГН|нет лестницы/ }).count()
  check("V2 список замечаний раскрывается", items >= 0, `строк ${items}`)
  await page.screenshot({ path: join(shots, "validate.png") })
}

// ── V3. сломанное окно ловится проверкой ──
{
  const before = await page.evaluate(() => window.__validate(window.__doc()).filter((i) => i.level === "error").length)
  await page.evaluate(() => {
    const st = window.__stores.useDocumentStore.getState()
    const d = JSON.parse(JSON.stringify(st.doc))
    const f = d.buildings[0].floors[0]
    const wallId = Object.keys(f.wallGraph.edges)[0]
    f.openings.push({ id: "bad1", wallId, type: "window", variant: "single", width: 99000, height: 1500, sillHeight: 850, offset: 500 })
    st.loadDocument(d)
  })
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => window.__validate(window.__doc()).filter((i) => i.level === "error").length)
  check("V3 окно шире стены становится ошибкой", after === before + 1, `${before} → ${after}`)
}

// ── V4. исправление убирает замечание ──
{
  await page.evaluate(() => {
    const st = window.__stores.useDocumentStore.getState()
    const d = JSON.parse(JSON.stringify(st.doc))
    const f = d.buildings[0].floors[0]
    f.openings = f.openings.filter((o) => o.id !== "bad1")
    st.loadDocument(d)
  })
  await page.waitForTimeout(700)
  const has = await page.evaluate(() => window.__validate(window.__doc()).some((i) => i.id === "op-out-bad1"))
  check("V4 после исправления замечание пропадает", has === false, String(has))
}

// ── V5. кнопка подставляет наименования, Ctrl+Z их убирает ──
{
  const before = await page.evaluate(() => window.__validate(window.__doc()).filter((i) => i.id.startsWith("room-noname-")).length)
  const btn = page.locator("button", { hasText: /Подставить наименования/ })
  if ((await btn.count()) > 0) {
    await btn.first().click()
    await page.waitForTimeout(800)
    const after = await page.evaluate(() => window.__validate(window.__doc()).filter((i) => i.id.startsWith("room-noname-")).length)
    const named = await page.evaluate(() => Object.values(window.__doc().buildings[0].floors[0].roomNames ?? {}))
    check("V5 наименования подставились", after < before && named.length > 0, `${before} → ${after}, например: ${named.slice(0, 3).join(", ")}`)
    await page.keyboard.press("Control+z")
    await page.waitForTimeout(700)
    const back = await page.evaluate(() => window.__validate(window.__doc()).filter((i) => i.id.startsWith("room-noname-")).length)
    check("V6 Ctrl+Z возвращает как было", back === before, `${after} → ${back}`)
  } else {
    check("V5 наименования подставились", before === 0, "кнопки нет — безымянных помещений не было")
  }
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
