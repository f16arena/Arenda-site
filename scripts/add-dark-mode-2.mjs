// Второй проход: tonal-цвета (red/amber/emerald/blue/purple/cyan/teal/rose).
// В светлой теме у нас bg-{color}-50/100 + text-{color}-700/900.
// В темной нужно полупрозрачный цветной фон и яркий текст того же тона.
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"

const ROOT = process.cwd()
const TARGET_DIRS = ["app", "components"]

const COLORS = ["red", "amber", "emerald", "blue", "purple", "cyan", "teal", "rose", "green", "indigo", "yellow", "pink", "orange"]

const REPLACEMENTS = []

for (const c of COLORS) {
  // Фоны: bg-{color}-50 → ... dark:bg-{color}-500/10 (тонкий цветной фон)
  REPLACEMENTS.push({ from: `bg-${c}-50`, to: `bg-${c}-50 dark:bg-${c}-500/10` })
  REPLACEMENTS.push({ from: `bg-${c}-100`, to: `bg-${c}-100 dark:bg-${c}-500/20` })
  REPLACEMENTS.push({ from: `bg-${c}-200`, to: `bg-${c}-200 dark:bg-${c}-500/30` })

  // Бордеры
  REPLACEMENTS.push({ from: `border-${c}-200`, to: `border-${c}-200 dark:border-${c}-500/30` })
  REPLACEMENTS.push({ from: `border-${c}-100`, to: `border-${c}-100 dark:border-${c}-500/20` })
  REPLACEMENTS.push({ from: `border-${c}-300`, to: `border-${c}-300 dark:border-${c}-500/40` })

  // Текст
  REPLACEMENTS.push({ from: `text-${c}-900`, to: `text-${c}-900 dark:text-${c}-200` })
  REPLACEMENTS.push({ from: `text-${c}-800`, to: `text-${c}-800 dark:text-${c}-200` })
  REPLACEMENTS.push({ from: `text-${c}-700`, to: `text-${c}-700 dark:text-${c}-300` })
  REPLACEMENTS.push({ from: `text-${c}-600`, to: `text-${c}-600 dark:text-${c}-400` })

  // Hover
  REPLACEMENTS.push({ from: `hover:bg-${c}-50`, to: `hover:bg-${c}-50 dark:hover:bg-${c}-500/10` })
  REPLACEMENTS.push({ from: `hover:bg-${c}-100`, to: `hover:bg-${c}-100 dark:hover:bg-${c}-500/20` })
}

let totalFiles = 0
let totalFilesChanged = 0
let totalReplacements = 0

function listFiles() {
  const out = execSync(`git ls-files ${TARGET_DIRS.map((d) => `"${d}"`).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
  })
  return out.split(/\r?\n/)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => join(ROOT, f))
}

function processFile(path) {
  const content = readFileSync(path, "utf8")
  if (!content.includes("className")) return

  let result = content
  let replaced = 0

  for (const { from, to } of REPLACEMENTS) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\b${escaped}\\b`, "g")

    result = result.replace(re, (match, offset) => {
      const after = result.slice(offset, offset + match.length + 80)
      const expectedDark = to.split(" dark:")[1]
      if (expectedDark && after.includes(`dark:${expectedDark}`)) {
        return match
      }
      replaced++
      return to
    })
  }

  if (replaced > 0) {
    writeFileSync(path, result)
    totalFilesChanged++
    totalReplacements += replaced
    console.log(`  ✓ ${path.replace(ROOT + "\\", "")} — ${replaced}`)
  }
}

const files = listFiles()
console.log(`Проверяю ${files.length} файлов на tonal-цвета...\n`)

for (const f of files) {
  totalFiles++
  try {
    processFile(f)
  } catch (e) {
    console.error(`  ✗ ${f}: ${e.message}`)
  }
}

console.log(`\nИтого: ${totalFiles} файлов проверено, ${totalFilesChanged} изменено, ${totalReplacements} замен`)
