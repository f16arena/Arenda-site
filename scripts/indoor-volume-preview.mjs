// Оффлайн-превью объёмного режима indoor-карты.
//
//   node scripts/indoor-volume-preview.mjs [out.html]
//
// Плоский план рендерится сервером (см. indoor-map-preview.tsx), а объёму нужен
// живой WebGL, поэтому здесь собирается настоящий бандл через esbuild и кладётся
// в одну HTML-страницу. Открывается в браузере или снимается headless-Chrome
// с программным рендером (--enable-unsafe-swiftshader).

import { rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = process.argv[2] ?? "indoor-volume-preview.html"

const entrySource = `
import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { VolumeView } from "@/components/indoor-map/volume-view"
import { layoutBox } from "@/lib/indoor-map/geometry"
import { demoFloor } from "@/lib/indoor-map/demo-floor"
import { buildFloorView } from "@/lib/indoor-map/model"

// Четыре этажа одного здания: заполняемость разная, чтобы стопка читалась
const FLOORS = [
  { number: 0, name: "Цоколь", vacate: ["203", "213", "231", "205"] },
  { number: 1, name: "1 этаж", vacate: [] },
  { number: 2, name: "2 этаж", vacate: ["203", "213"] },
  { number: 3, name: "3 этаж", vacate: ["201", "202", "204", "211", "212", "221", "222"] },
]

const floors = FLOORS.map((floor, index) => {
  const { layout, spaces } = demoFloor()
  const patched = spaces.map((space) =>
    floor.vacate.includes(space.number)
      ? { ...space, status: "VACANT", tenantName: null, tenantId: null, contractEnd: null }
      : space,
  )
  return {
    id: "floor-" + index,
    number: floor.number,
    name: floor.name,
    box: layoutBox(layout),
    rooms: buildFloorView(layout, patched).rooms,
  }
})

const root = createRoot(document.getElementById("stage"))
root.render(
  createElement(VolumeView, {
    floors,
    activeFloorId: null, // здание целиком, как при открытии объёма
    onPickFloor: (id) => console.log("floor", id),
    onPickRoom: (id, room) => console.log("room", id, room.title),
  }),
)
`

// Точка входа пишется внутрь проекта: из системного temp не резолвится node_modules
const entryPath = path.join(root, ".indoor-volume-entry.tsx")
writeFileSync(entryPath, entrySource, "utf8")

const result = await build({
  entryPoints: [entryPath],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  alias: { "@": root },
  absWorkingDir: root,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
})

rmSync(entryPath, { force: true })
const bundle = result.outputFiles[0].text

writeFileSync(
  out,
  `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Indoor Map — объём</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { margin: 0; font-family: 'Onest', system-ui, sans-serif; background: #eef1f6; }
  #stage { width: 1100px; height: 720px; margin: 20px auto; }
</style>
</head>
<body>
<div id="stage"></div>
<script>${bundle}</script>
</body>
</html>
`,
  "utf8",
)

console.log(`Записано: ${out} (бандл ${(bundle.length / 1024).toFixed(0)} КБ)`)
