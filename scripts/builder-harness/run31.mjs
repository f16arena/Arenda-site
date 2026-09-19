// Срез ближних стен («как в Симс»): стены между камерой и зданием прячутся,
// поворот камеры возвращает их и убирает следующие; переключатель выключает
// режим и ничего не ломает в других режимах показа.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4864)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4864/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.evaluate(() => { window.__stores.useEditorStore.getState().setDisplayMode("active") })
await page.waitForTimeout(2200)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const stat = () => page.evaluate(() => {
  const scene = window.__engine.scene ?? window.__engine.bundle.scene
  const active = window.__stores.useEditorStore.getState().activeLevelId
  const walls = scene.meshes.filter((m) => m.metadata?.kind === "wall" && m.metadata.floorId === active)
  return { all: walls.length, hidden: walls.filter((m) => m.visibility === 0).length, peek: [...window.__engine.peekHidden.keys()] }
})

// ── W1. часть стен активного этажа спрятана ──
{
  const s = await stat()
  check("W1 ближние стены спрятаны", s.hidden > 0 && s.hidden < s.all, `скрыто ${s.hidden} из ${s.all}`)
  await page.screenshot({ path: join(shots, "peek-on.png") })
}

// ── W2. поворот камеры меняет набор спрятанных стен ──
{
  const before = (await stat()).peek
  await page.mouse.move(700, 400)
  await page.mouse.down()
  await page.mouse.move(180, 400, { steps: 25 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  const after = (await stat()).peek
  const same = before.filter((x) => after.includes(x)).length
  check("W2 после поворота прячутся другие стены", after.length > 0 && same < before.length, `было ${before.length}, стало ${after.length}, совпало ${same}`)
  await page.screenshot({ path: join(shots, "peek-turned.png") })
}

// ── W3. выключатель возвращает все стены ──
{
  await page.evaluate(() => window.__stores.useLabelStore.getState().togglePeekWalls())
  await page.waitForTimeout(900)
  const s = await stat()
  check("W3 выключатель возвращает стены", s.hidden === 0 && s.peek.length === 0, `скрыто ${s.hidden}, в списке ${s.peek.length}`)
}

// ── W4. чужой этаж режим не трогает ──
{
  const other = await page.evaluate(() => {
    const scene = window.__engine.scene ?? window.__engine.bundle.scene
    const active = window.__stores.useEditorStore.getState().activeLevelId
    const walls = scene.meshes.filter((m) => m.metadata?.kind === "wall" && m.metadata.floorId !== active)
    return { all: walls.length, shown: walls.filter((m) => m.visibility > 0).length }
  })
  check("W4 стены других этажей не всплывают", other.all === 0 || other.shown === 0, `видно ${other.shown} из ${other.all}`)
}

// ── W5. в обходе стены на месте ──
{
  await page.evaluate(() => window.__stores.useLabelStore.getState().togglePeekWalls())
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("walk"))
  await page.waitForTimeout(1600)
  const s = await stat()
  check("W5 в обходе стены не прячутся", s.hidden === 0, `скрыто ${s.hidden}`)
  await page.evaluate(() => window.__stores.useEditorStore.getState().setCameraMode("orbit"))
  await page.waitForTimeout(800)
}

check("ошибок в консоли нет", errors.length === 0, errors.slice(0, 3).join(" | "))
console.log(results.join("\n"))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
