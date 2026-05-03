// Удаляет дубликаты dark:-классов в одной className-строке.
// Например: "text-slate-400 dark:text-slate-500 dark:text-slate-500" → одно вхождение
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"

const ROOT = process.cwd()
const TARGET_DIRS = ["app", "components"]

let totalReplacements = 0
let totalFilesChanged = 0

function listFiles() {
  const out = execSync(`git ls-files ${TARGET_DIRS.map((d) => `"${d}"`).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
  })
  return out.split(/\r?\n/)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => join(ROOT, f))
}

// Дедуп: ищем повторяющиеся "dark:..." токены в строках с className.
// Простая стратегия: разбиваем по пробелам, оставляем уникальные.
function dedupClassesInString(str) {
  const tokens = str.split(/\s+/).filter(Boolean)
  const seen = new Set()
  const result = []
  let changed = false
  for (const t of tokens) {
    // Только для dark:-токенов делаем дедуп
    if (t.startsWith("dark:")) {
      if (seen.has(t)) {
        changed = true
        continue
      }
      seen.add(t)
    }
    result.push(t)
  }
  return { result: result.join(" "), changed }
}

function processFile(path) {
  const content = readFileSync(path, "utf8")
  if (!content.includes("dark:")) return

  let changed = false
  let count = 0

  // Регэксп для className="..." и className={`...`}
  const result = content.replace(
    /(className=)("([^"]*)"|`([^`]*)`|{`([^`]*)`}|{cn\([^)]*\)})/g,
    (match, attr, _full, dq, btq) => {
      // dq — обычные кавычки, btq — обратные кавычки. cn() пропускаем.
      const classes = dq ?? btq
      if (!classes) return match
      const dedup = dedupClassesInString(classes)
      if (!dedup.changed) return match
      changed = true
      count++
      // Восстанавливаем формат
      if (dq) return `${attr}"${dedup.result}"`
      if (btq) return `${attr}\`${dedup.result}\``
      return match
    }
  )

  // Также обрабатываем строковые литералы внутри cn(...) и conditional className
  const result2 = result.replace(/"([^"]+)"/g, (match, content) => {
    if (!content.includes("dark:")) return match
    const dedup = dedupClassesInString(content)
    if (!dedup.changed) return match
    changed = true
    count++
    return `"${dedup.result}"`
  })

  if (changed) {
    writeFileSync(path, result2)
    totalFilesChanged++
    totalReplacements += count
    console.log(`  ✓ ${path.replace(ROOT + "\\", "")} — ${count} замен`)
  }
}

const files = listFiles()
console.log(`Проверяю ${files.length} файлов на дубликаты dark:-классов...\n`)

for (const f of files) {
  try {
    processFile(f)
  } catch (e) {
    console.error(`✗ ${f}: ${e.message}`)
  }
}

console.log(`\nИтого: ${totalFilesChanged} файлов изменено, ${totalReplacements} строк`)
