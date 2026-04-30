// Mass-add dark: классы к основным Tailwind паттернам в .tsx файлах.
// Идемпотентно: пропускает места, где уже есть dark: для нужного класса.
//
// Запуск: node scripts/add-dark-mode.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"

const ROOT = process.cwd()
const TARGET_DIRS = ["app", "components"]

// Соответствия "светлый класс → как должен выглядеть в темной"
// Подбираем максимально читаемые цвета.
const REPLACEMENTS = [
  // Фоны
  { from: "bg-white", to: "bg-white dark:bg-slate-900" },
  { from: "bg-slate-50", to: "bg-slate-50 dark:bg-slate-800/50" },
  { from: "bg-slate-100", to: "bg-slate-100 dark:bg-slate-800" },

  // Бордеры
  { from: "border-slate-200", to: "border-slate-200 dark:border-slate-800" },
  { from: "border-slate-100", to: "border-slate-100 dark:border-slate-800" },

  // Текст
  { from: "text-slate-900", to: "text-slate-900 dark:text-slate-100" },
  { from: "text-slate-800", to: "text-slate-800 dark:text-slate-200" },
  { from: "text-slate-700", to: "text-slate-700 dark:text-slate-300" },
  { from: "text-slate-600", to: "text-slate-600 dark:text-slate-400" },
  { from: "text-slate-500", to: "text-slate-500 dark:text-slate-400" },
  { from: "text-slate-400", to: "text-slate-400 dark:text-slate-500" },

  // Hover
  { from: "hover:bg-slate-50", to: "hover:bg-slate-50 dark:hover:bg-slate-800/50" },
  { from: "hover:bg-slate-100", to: "hover:bg-slate-100 dark:hover:bg-slate-800" },
]

// Шаблоны fixed-цветовых акцентов которые в темной нужно немного приглушить.
// (Оставляем как есть — они хорошо смотрятся и в темной)

let totalFiles = 0
let totalFilesChanged = 0
let totalReplacements = 0

function listFiles() {
  const out = execSync(`git ls-files ${TARGET_DIRS.map((d) => `"${d}"`).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
  })
  return out
    .split(/\r?\n/)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .filter((f) => !f.includes("node_modules"))
    .map((f) => join(ROOT, f))
}

function processFile(path) {
  const content = readFileSync(path, "utf8")
  if (!content.includes("className")) return

  let result = content
  let replaced = 0

  for (const { from, to } of REPLACEMENTS) {
    // Регэксп: ищем `from` как слово внутри className-строк, и не трогаем
    // если рядом уже есть нужный dark: вариант.
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\b${escaped}\\b`, "g")

    result = result.replace(re, (match, offset) => {
      // Контекст: соседний кусок до 60 символов после, чтобы понять,
      // не идёт ли уже dark: вариант для этого же класса.
      const after = result.slice(offset, offset + match.length + 60)
      const expectedDark = to.split(" dark:")[1]
      if (expectedDark && after.includes(`dark:${expectedDark}`)) {
        return match  // уже есть — не дублируем
      }
      replaced++
      return to
    })
  }

  if (replaced > 0) {
    writeFileSync(path, result)
    totalFilesChanged++
    totalReplacements += replaced
    console.log(`  ✓ ${path.replace(ROOT + "\\", "")} — ${replaced} замен`)
  }
}

const files = listFiles()
console.log(`Найдено ${files.length} файлов для обработки\n`)

for (const f of files) {
  totalFiles++
  try {
    processFile(f)
  } catch (e) {
    console.error(`  ✗ ${f}: ${e.message}`)
  }
}

console.log(`\nИтого: ${totalFiles} файлов проверено, ${totalFilesChanged} изменено, ${totalReplacements} замен`)
