import { readdir, readFile, stat } from "fs/promises"
import path from "path"

const ROOT = process.cwd()
const SEARCH_DIRS = ["app", "components", "lib"]
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"])
const EXCLUDED = [
  `${path.sep}generated${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
]
const HEAVY_IMPORTS = [
  "exceljs",
  "docx",
  "docxtemplater",
  "pizzip",
  "pdfjs-dist",
  "qrcode",
  "@anthropic-ai/sdk",
  "cmdk",
]
const CLIENT_FILE_BUDGET = 140 * 1024
const SERVER_FILE_BUDGET = 80 * 1024
const STRICT = process.env.PERF_AUDIT_STRICT !== "0"

const files = []

for (const dir of SEARCH_DIRS) {
  await walk(path.join(ROOT, dir))
}

const enriched = await Promise.all(files.map(async (file) => {
  const content = await readFile(file, "utf8")
  const rel = path.relative(ROOT, file)
  const size = Buffer.byteLength(content)
  const firstLines = content.split(/\r?\n/).slice(0, 5).join("\n")
  const isClient = firstLines.includes('"use client"') || firstLines.includes("'use client'")
  const imports = HEAVY_IMPORTS.filter((name) => importsPackage(content, name))
  const largeTakes = findLargePrismaTakes(content)
  return { rel, size, isClient, imports, largeTakes }
}))

const budgetViolations = enriched.flatMap((file) => {
  if (file.isClient && file.size > CLIENT_FILE_BUDGET) {
    return [`${formatFile(file)} exceeds client budget ${formatKb(CLIENT_FILE_BUDGET)}`]
  }
  if (!file.isClient && file.size > SERVER_FILE_BUDGET) {
    return [`${formatFile(file)} exceeds server budget ${formatKb(SERVER_FILE_BUDGET)}`]
  }
  return []
})

const takeViolations = enriched.flatMap((file) =>
  file.largeTakes.map((take) => `${file.rel}:${take.line} uses take: ${take.value}; paginate or lower the source cap below 150`),
)

printSection(
  "Performance budget",
  budgetViolations.length > 0
    ? budgetViolations
    : [`OK: client <= ${formatKb(CLIENT_FILE_BUDGET)}, server <= ${formatKb(SERVER_FILE_BUDGET)}`],
)

printSection(
  "Largest client files",
  enriched
    .filter((file) => file.isClient)
    .sort((a, b) => b.size - a.size)
    .slice(0, 15)
    .map(formatFile),
)

printSection(
  "Largest app/components/lib files",
  enriched
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
    .map(formatFile),
)

printSection(
  "Heavy imports",
  enriched
    .filter((file) => file.imports.length > 0)
    .sort((a, b) => b.size - a.size)
    .map((file) => `${formatFile(file)} -> ${file.imports.join(", ")}`),
)

printSection(
  "Large Prisma takes",
  takeViolations.length > 0 ? takeViolations : ["OK: no take >= 150 in app/components/lib"],
)

if (STRICT && (budgetViolations.length > 0 || takeViolations.length > 0)) {
  process.exitCode = 1
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (EXCLUDED.some((segment) => fullPath.includes(segment))) continue
    if (entry.isDirectory()) {
      await walk(fullPath)
      continue
    }
    if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) continue
    const info = await stat(fullPath)
    if (info.size === 0) continue
    files.push(fullPath)
  }
}

function formatFile(file) {
  return `${String(Math.round(file.size / 1024)).padStart(4, " ")} KB  ${file.rel}${file.isClient ? "  [client]" : ""}`
}

function formatKb(size) {
  return `${Math.round(size / 1024)} KB`
}

function importsPackage(content, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pkg = `${escaped}(?:/[^'"]*)?`
  return [
    new RegExp(`from\\s+["']${pkg}["']`),
    new RegExp(`import\\s*\\(\\s*["']${pkg}["']\\s*\\)`),
    new RegExp(`require\\s*\\(\\s*["']${pkg}["']\\s*\\)`),
    new RegExp(`^\\s*import\\s+["']${pkg}["']`, "m"),
  ].some((pattern) => pattern.test(content))
}

function findLargePrismaTakes(content) {
  const results = []
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/\btake:\s*(\d+)/)
    if (!match) continue
    const value = Number.parseInt(match[1], 10)
    if (Number.isFinite(value) && value >= 150) {
      results.push({ line: index + 1, value })
    }
  }
  return results
}

function printSection(title, rows) {
  console.log(`\n${title}`)
  console.log("-".repeat(title.length))
  if (rows.length === 0) {
    console.log("No matches.")
    return
  }
  for (const row of rows) console.log(row)
}
