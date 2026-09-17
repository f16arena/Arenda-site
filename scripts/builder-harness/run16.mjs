import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4837)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4837/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1000)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const shot = (n) => page.screenshot({ path: join(shots, n + ".png") })
const floor = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  return d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
})
const sel = () => page.evaluate(() => window.__stores.useEditorStore.getState().selection)
// экранная точка для мм плана на плоскости активного этажа
const toScreen = (x, y) => page.evaluate(({ x, y }) => {
  const eng = window.__engine
  const scene = eng.bundle.scene
  const cam = scene.activeCamera
  const V = cam.position.constructor
  const M = scene.getTransformMatrix().constructor
  const w = eng.bundle.engine.getRenderWidth(), h = eng.bundle.engine.getRenderHeight()
  const p = V.Project(new V(x / 1000, 0, y / 1000), M.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h))
  const ratio = w / window.innerWidth
  return { x: p.x / ratio, y: p.y / ratio }
}, { x, y })
const drag = async (a, b, steps = 12) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); await page.waitForTimeout(600) }
const click = async (p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(400) }





// ── NOTE. размеры и надписи инженера ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1000)
{
  const f = await floor()
  const n = f.wallGraph.nodes
  const ext = Object.values(f.wallGraph.edges).filter((e) => e.kind === "exterior")
  const top = ext.filter((e) => Math.abs(n[e.a].y - n[e.b].y) < 5).sort((a, b) => n[b.a].y - n[a.a].y)[0]
  const A = n[top.a], B = n[top.b]
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("annotate"); s.setAnnotateKind("dim") })
  await page.waitForTimeout(200)
  for (const p of [A, B]) { const q = await toScreen(p.x, p.y); await page.mouse.move(q.x, q.y, { steps: 3 }); await page.mouse.click(q.x, q.y); await page.waitForTimeout(250) }
  const off = await toScreen((A.x + B.x) / 2, A.y - 1500)
  await page.mouse.move(off.x, off.y, { steps: 5 }); await page.waitForTimeout(200)
  await page.mouse.click(off.x, off.y); await page.waitForTimeout(600)
  const dims = ((await floor()).annotations ?? []).filter((x) => x.kind === "dim")
  check("NOTE1 размер поставлен по узлам стены", dims.length === 1 && Math.round(Math.hypot(dims[0].b.x - dims[0].a.x, dims[0].b.y - dims[0].a.y)) === Math.round(Math.hypot(B.x - A.x, B.y - A.y)), JSON.stringify(dims[0]))
  check("NOTE2 вынос в сторону курсора", dims[0] && Math.abs(Math.abs(dims[0].offset) - 1500) < 60, String(dims[0]?.offset))
  const lbl = await page.evaluate(() => window.__stores.useLabelStore.getState().labels.filter((l) => l.kind === "note").map((l) => l.text))
  check("NOTE3 подпись размера на плане", lbl.includes(String(Math.round(Math.hypot(B.x - A.x, B.y - A.y)))), JSON.stringify(lbl))
  // надпись
  await page.evaluate(() => window.__stores.useEditorStore.getState().setAnnotateKind("text"))
  const c = await toScreen((A.x + B.x) / 2, A.y - 3000)
  await page.mouse.click(c.x, c.y); await page.waitForTimeout(600)
  check("NOTE4 надпись выбрана после постановки", (await sel()).type === "annotation")
  await page.locator("#annotation-text").fill("Демонтаж перегородки по согласованию")
  await page.locator("#annotation-text").blur()
  await page.waitForTimeout(500)
  const texts = ((await floor()).annotations ?? []).filter((x) => x.kind === "text")
  check("NOTE5 текст надписи правится", texts[0]?.text === "Демонтаж перегородки по согласованию", JSON.stringify(texts))
  await shot("NOTE-plan")
  // выбор размера кликом по размерной линии и удаление
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  await page.waitForTimeout(200)
  const d0 = dims[0]
  const L = Math.hypot(d0.b.x - d0.a.x, d0.b.y - d0.a.y), nx = -(d0.b.y - d0.a.y) / L, ny = (d0.b.x - d0.a.x) / L
  const onLine = await toScreen((d0.a.x + d0.b.x) / 2 + nx * d0.offset + 500, (d0.a.y + d0.b.y) / 2 + ny * d0.offset)
  await page.mouse.click(onLine.x, onLine.y); await page.waitForTimeout(400)
  check("NOTE6 клик выбирает размер", (await sel()).type === "annotation" && (await sel()).id === d0.id, JSON.stringify(await sel()))
  await page.keyboard.press("Delete"); await page.waitForTimeout(400)
  check("NOTE7 Delete удаляет размер", ((await floor()).annotations ?? []).filter((x) => x.kind === "dim").length === 0)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
