import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, dirname, relative, sep } from "node:path"

/**
 * Ищет клиентские компоненты, которым не передали нужный раздел словаря.
 *
 * Клиентский компонент берёт словарь из ближайшего I18nProvider вверх по дереву.
 * Если раздела там нет, useT() возвращает сам ключ — пользователь видит
 * «cabinetPayDocs.title» вместо заголовка.
 *
 * Компилятор это не ловит: ключ существует в типе Messages, его просто нет в
 * наборе, который отдали в браузер. Тесты тоже — они не рендерят дерево целиком.
 * Поэтому отдельная проверка: один раз так уехали четыре раздела кабинета.
 *
 * Проверяются два случая:
 *  1. Компонент внутри app/ — провайдеры ищем по дереву папок вверх.
 *  2. Компонент в components/ — у него дерева папок нет, поэтому идём по
 *     импортам: кто его рендерит и что этот файл (или его дерево) отдаёт. Так
 *     нашлась реальная дыра: admin-select-org рендерился из раннего return в
 *     app/admin/layout.tsx, то есть ДО собственного I18nProvider этого layout'а.
 *
 * Запуск: node scripts/check-i18n-providers.mjs
 */

const APP = "app"
const COMPONENTS = "components"
const NS_CALL = /\bt\w*\(\s*[`"']([a-zA-Z]+)\./g
const PICK = /pickNamespaces\([^,]+,\s*\[([^\]]*)\]/g

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p)
  }
  return out
}

const sources = new Map()
function read(p) {
  if (sources.has(p)) return sources.get(p)
  let src = ""
  try {
    src = readFileSync(p, "utf8")
  } catch {
    src = ""
  }
  sources.set(p, src)
  return src
}

/** Разделы, перечисленные в pickNamespaces этого файла. */
function namespacesIn(src) {
  const found = new Set()
  if (!src.includes("I18nProvider")) return found
  for (const [, group] of src.matchAll(PICK)) {
    for (const raw of group.split(",")) {
      const value = raw.trim().replace(/^["'`]|["'`]$/g, "")
      if (value) found.add(value)
    }
  }
  return found
}

/** Провайдеры вверх по дереву: layout.tsx папок и page.tsx самой папки. */
function providedForAppFile(file) {
  const provided = new Set()
  let dir = dirname(file)
  // Страница может обернуть свои клиентские части сама — это тоже провайдер.
  for (const sibling of ["page.tsx", "layout.tsx", "template.tsx"]) {
    for (const ns of namespacesIn(read(join(dir, sibling)))) provided.add(ns)
  }
  while (true) {
    for (const ns of namespacesIn(read(join(dir, "layout.tsx")))) provided.add(ns)
    if (relative(APP, dir) === "") break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return provided
}

// ── Импорты: кто рендерит файл из components/ ───────────────────────────────

const allFiles = [...walk(APP), ...walk(COMPONENTS)]
const posix = (p) => p.split(sep).join("/")

/** Пути, по которым на этот файл можно сослаться в импорте. */
function importAliases(file) {
  const noExt = posix(file).replace(/\.tsx?$/, "")
  const aliases = new Set([`@/${noExt}`])
  if (noExt.endsWith("/index")) aliases.add(`@/${noExt.slice(0, -"/index".length)}`)
  return aliases
}

/**
 * Импортирует ли файл что-то, похожее на компонент (имя с большой буквы).
 * Файл может брать из модуля только помощника — например app/layout.tsx берёт
 * из components/theme-toggle.tsx один themeInitScript и ничего не отрисовывает.
 * Такой импорт местом отрисовки не является, и провайдер там не нужен.
 */
function importsComponentFrom(src, specifierPattern) {
  const named = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*${specifierPattern}`, "g")
  for (const [, group] of src.matchAll(named)) {
    const names = group.split(",").map((raw) => raw.trim().split(/\s+as\s+/).pop().trim())
    if (names.some((name) => /^[A-Z]/.test(name))) return true
  }
  // import Default from "…", import * as NS from "…", await import("…")
  const other = new RegExp(
    `import\\s+(?:[A-Z]\\w*|\\*\\s+as\\s+\\w+)\\s+from\\s*${specifierPattern}|import\\(\\s*${specifierPattern}\\s*\\)`,
  )
  return other.test(src)
}

/** Файлы, которые РЕНДЕРЯТ target (по алиасу @/… или относительным путём). */
function importersOf(target) {
  const aliases = importAliases(target)
  const base = posix(target).replace(/\.tsx?$/, "").split("/").pop()
  const out = []
  for (const file of allFiles) {
    if (file === target) continue
    const src = read(file)
    for (const alias of aliases) {
      const pattern = `["']${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`
      if (new RegExp(pattern).test(src) && importsComponentFrom(src, pattern)) {
        out.push(file)
        break
      }
    }
    if (out[out.length - 1] === file) continue
    // Относительный импорт из той же папки: "./admin-select-org-view".
    if (base && dirname(posix(file)) === dirname(posix(target))) {
      const pattern = `["'][.][^"']*/${base}["']`
      if (new RegExp(pattern).test(src) && importsComponentFrom(src, pattern)) out.push(file)
    }
  }
  return out
}

/**
 * Наборы разделов, доступные компоненту на каждом пути отрисовки. Каждый
 * элемент — отдельное место в приложении: если хотя бы в одном раздела нет,
 * там пользователь увидит ключ.
 */
function contextsFor(file, seen = new Set()) {
  if (seen.has(file)) return []
  seen.add(file)
  const own = namespacesIn(read(file))
  if (posix(file).startsWith(`${APP}/`)) {
    const provided = providedForAppFile(file)
    for (const ns of own) provided.add(ns)
    return [provided]
  }
  const importers = importersOf(file)
  if (importers.length === 0) return [] // никем не используется — проверять нечего
  const out = []
  for (const importer of importers) {
    for (const context of contextsFor(importer, seen)) {
      const merged = new Set(context)
      for (const ns of own) merged.add(ns)
      out.push(merged)
    }
  }
  return out
}

// ── Сама проверка ──────────────────────────────────────────────────────────

const problems = new Map()
for (const file of allFiles) {
  if (!file.endsWith(".tsx")) continue
  const src = read(file)
  if (!src.includes('"use client"')) continue
  const wanted = new Set()
  for (const [, ns] of src.matchAll(NS_CALL)) wanted.add(ns)
  if (wanted.size === 0) continue

  const contexts = contextsFor(file)
  if (contexts.length === 0) continue
  const missing = [...wanted].filter((ns) => contexts.some((context) => !context.has(ns)))
  if (missing.length > 0) problems.set(posix(file), missing)
}

if (problems.size === 0) {
  console.log("i18n-провайдеры: все клиентские компоненты получают свои разделы словаря.")
  process.exit(0)
}

console.error("i18n-провайдеры: клиентские компоненты покажут ключи вместо текста.\n")
for (const [file, missing] of problems) {
  console.error(`  ${file}`)
  console.error(`    не передан раздел: ${missing.join(", ")}`)
}
console.error(
  "\nДобавьте раздел в pickNamespaces ближайшего layout.tsx (образец — app/admin/finances/layout.tsx).\n" +
    "Компонент из components/, который рендерят вне провайдера, можно обернуть самому:\n" +
    "образец — components/superadmin/admin-select-org.tsx.",
)
process.exit(1)
