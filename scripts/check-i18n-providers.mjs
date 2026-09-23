import { readFileSync, readdirSync, statSync } from "node:fs"
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
 * Запуск: node scripts/check-i18n-providers.mjs
 */

const ROOT = "app"
const NS_CALL = /\bt\w*\(\s*[`"']([a-zA-Z]+)\./g
const PICK = /pickNamespaces\([^,]+,\s*\[([^\]]*)\]/g

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".tsx")) out.push(p)
  }
  return out
}

function read(p) {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return ""
  }
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
function providedFor(file) {
  const provided = new Set()
  let dir = dirname(file)
  // Страница может обернуть свои клиентские части сама — это тоже провайдер.
  for (const sibling of ["page.tsx", "layout.tsx", "template.tsx"]) {
    for (const ns of namespacesIn(read(join(dir, sibling)))) provided.add(ns)
  }
  while (true) {
    for (const ns of namespacesIn(read(join(dir, "layout.tsx")))) provided.add(ns)
    if (relative(ROOT, dir) === "") break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return provided
}

const problems = new Map()
for (const file of walk(ROOT)) {
  const src = read(file)
  if (!src.includes('"use client"')) continue
  const wanted = new Set()
  for (const [, ns] of src.matchAll(NS_CALL)) wanted.add(ns)
  if (wanted.size === 0) continue
  const provided = providedFor(file)
  const missing = [...wanted].filter((ns) => !provided.has(ns))
  if (missing.length > 0) problems.set(file.split(sep).join("/"), missing)
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
  "\nДобавьте раздел в pickNamespaces ближайшего layout.tsx (образец — app/admin/finances/layout.tsx).",
)
process.exit(1)
