// Оффлайн-превью indoor-карты: рендерит настоящий компонент FloorMap в HTML,
// чтобы смотреть визуальную систему без базы и без dev-сервера.
//
//   npx tsx scripts/indoor-map-preview.tsx [out.html]
//
// Дальше файл открывается в браузере или снимается headless-Chrome.

import { writeFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FloorMap } from "../components/indoor-map/floor-map"
import { classifyCategory } from "../lib/indoor-map/category"
import { DEMO_ACTIVITY, demoFloor } from "../lib/indoor-map/demo-floor"
import { buildFloorView } from "../lib/indoor-map/model"

const { layout, spaces } = demoFloor()
const withCategories = spaces.map((space) => ({
  ...space,
  category: classifyCategory(DEMO_ACTIVITY[space.id]),
}))
const view = buildFloorView(layout, withCategories)

const markup = renderToStaticMarkup(
  createElement(FloorMap, {
    layout,
    view,
    filter: "all" as const,
    selectedRoomId: null,
    onSelect: () => {},
  }),
)

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Indoor Map — превью</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { margin: 0; font-family: 'Onest', system-ui, sans-serif; background: #eef1f6; }
  .stage { width: 900px; height: 600px; margin: 24px auto; }
</style>
</head>
<body>
<div class="stage">${markup}</div>
</body>
</html>
`

const out = process.argv[2] ?? "indoor-map-preview.html"
writeFileSync(out, html, "utf8")
console.log(`Записано: ${out} — помещений ${view.rooms.length}, свободно ${view.vacantArea.toFixed(0)} м²`)
