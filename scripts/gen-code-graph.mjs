#!/usr/bin/env node
/**
 * Генерирует Mermaid-граф зависимостей через madge → markdown с диаграммой.
 * Использование:
 *   node scripts/gen-code-graph.mjs <target-folder> <output.md> <title>
 * Пример:
 *   node scripts/gen-code-graph.mjs "app/admin/tenants/[id]" docs/code-graphs/tenants.md "Карточка арендатора"
 *
 * Подключается через npx --yes madge — без зависимости от установки.
 */

import { execSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, basename } from "node:path"

const [, , target, outputPath, title] = process.argv

if (!target || !outputPath) {
  console.error("Usage: node gen-code-graph.mjs <folder> <output.md> [title]")
  process.exit(1)
}

console.log(`Running madge on ${target}...`)
const json = execSync(
  `npx --yes madge --json --extensions ts,tsx "${target}"`,
  { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
)
const deps = JSON.parse(json)
const files = Object.keys(deps)

console.log(`Found ${files.length} files`)

// Конвертация имени файла в безопасный mermaid-id (без точек, скобок, слешей)
function nodeId(file) {
  return file
    .replace(/^\.\.\//g, "ext__")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .replace(/_+/g, "_")
}

// Короткое читаемое имя для label
function nodeLabel(file) {
  const base = basename(file)
  // если внешняя зависимость (../) — отмечаем
  if (file.startsWith("../")) return `📦 ${base}`
  return base
}

// Mermaid graph TD: A[label] --> B[label]
const lines = ["graph LR"]
const declared = new Set()

function declare(file) {
  if (declared.has(file)) return
  declared.add(file)
  const id = nodeId(file)
  const label = nodeLabel(file).replace(/"/g, '\\"')
  // Цветовой класс: ext (внешняя) / page (page.tsx) / form (*-form.tsx) / lazy / default
  let cls = ""
  if (file.startsWith("../")) cls = ":::external"
  else if (file === "page.tsx") cls = ":::page"
  else if (file.endsWith("-form.tsx")) cls = ":::form"
  else if (file.includes("lazy")) cls = ":::lazy"
  else if (file.endsWith(".ts")) cls = ":::lib"
  lines.push(`  ${id}["${label}"]${cls}`)
}

for (const file of files) {
  declare(file)
  for (const dep of deps[file] ?? []) {
    declare(dep)
    lines.push(`  ${nodeId(file)} --> ${nodeId(dep)}`)
  }
}

// Стили для классов
lines.push("")
lines.push("  classDef page    fill:#1e40af,color:#fff,stroke:#1e3a8a,stroke-width:2px")
lines.push("  classDef form    fill:#059669,color:#fff,stroke:#047857")
lines.push("  classDef lazy    fill:#d97706,color:#fff,stroke:#b45309")
lines.push("  classDef lib     fill:#6b7280,color:#fff,stroke:#4b5563")
lines.push("  classDef external fill:#e5e7eb,color:#374151,stroke:#9ca3af,stroke-dasharray:3 3")

const mermaid = lines.join("\n")

// Markdown-обёртка с описанием
const md = `# ${title ?? basename(target)}

> Граф зависимостей модулей (импорты TypeScript/React) — автогенерация через \`madge\` + Mermaid.
> **Источник:** \`${target}\`
> **Всего файлов:** ${files.length}
> **Обновить:** \`node scripts/gen-code-graph.mjs "${target}" ${outputPath} "${title ?? ""}"\`

## Легенда

- 🔵 **Синий** — \`page.tsx\` (точка входа страницы)
- 🟢 **Зелёный** — формы (\`*-form.tsx\`)
- 🟠 **Оранжевый** — lazy-секции (динамический импорт)
- ⚫ **Серый** — библиотеки (\`lib/\`, \`.ts\`)
- ⚪ **Бледный пунктир** — внешние зависимости (вне таргет-папки)

## Граф

\`\`\`mermaid
${mermaid}
\`\`\`

---

*Сгенерировано ${new Date().toISOString().slice(0, 10)}. Если граф слишком плотный — открой в Obsidian и используй колесо мыши для zoom (правый клик → Zoom in / Zoom out).*
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, md)
console.log(`Written: ${outputPath}`)
