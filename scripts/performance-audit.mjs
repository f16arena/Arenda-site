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
const CLIENT_FILE_BUDGET = readKbEnv("PERF_AUDIT_CLIENT_KB", 140) * 1024
const SERVER_FILE_BUDGET = readKbEnv("PERF_AUDIT_SERVER_KB", 80) * 1024
const PRISMA_TAKE_LIMIT = readNumberEnv("PERF_AUDIT_TAKE_LIMIT", 150)
const STRICT = process.env.PERF_AUDIT_STRICT !== "0"
const FAIL_SILENT_FALLBACKS = process.env.PERF_AUDIT_FAIL_SILENT_FALLBACKS === "1"
const ROUTE_TIMING_CHECKS = [
  {
    file: "app/admin/layout.tsx",
    routeToken: 'measureServerRoute("/admin/layout"',
    stepToken: "measureServerStep",
  },
  {
    file: "app/admin/page.tsx",
    routeToken: 'measureServerRoute("/admin"',
    stepToken: "measureServerStep",
  },
  {
    file: "app/admin/spaces/page.tsx",
    routeToken: 'measureServerRoute("/admin/spaces"',
    stepToken: "measureServerStep",
  },
  {
    file: "app/admin/tenants/[id]/page.tsx",
    routeToken: 'measureServerRoute("/admin/tenants/[id]"',
    stepToken: "measureServerStep",
  },
  {
    file: "app/cabinet/page.tsx",
    routeToken: 'measureServerRoute("/cabinet"',
    stepToken: "measureServerStep",
  },
]

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
  const silentFallbacks = findSilentFallbacks(content)
  return { rel, size, isClient, imports, largeTakes, silentFallbacks }
}))

const budgetViolations = enriched.flatMap((file) => {
  if (file.isClient && file.size > CLIENT_FILE_BUDGET) {
    return [{
      file: file.rel,
      message: `${formatFile(file)} exceeds client budget ${formatKb(CLIENT_FILE_BUDGET)}`,
    }]
  }
  if (!file.isClient && file.size > SERVER_FILE_BUDGET) {
    return [{
      file: file.rel,
      message: `${formatFile(file)} exceeds server budget ${formatKb(SERVER_FILE_BUDGET)}`,
    }]
  }
  return []
})

const takeViolations = enriched.flatMap((file) =>
  file.largeTakes.map((take) => ({
    file: file.rel,
    line: take.line,
    message: `${file.rel}:${take.line} uses take: ${take.value}; paginate or lower the source cap below ${PRISMA_TAKE_LIMIT}`,
  })),
)

const silentFallbackMatches = enriched.flatMap((file) =>
  file.silentFallbacks.map((line) => ({
    file: file.rel,
    line,
    message: `${file.rel}:${line} uses catch(() => []); use safeServerValue/logged fallback so support can see the real error`,
  })),
)
const routeTimingViolations = await findRouteTimingViolations()

printSection(
  "Performance budget",
  budgetViolations.length > 0
    ? budgetViolations.map((violation) => violation.message)
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
  takeViolations.length > 0
    ? takeViolations.map((violation) => violation.message)
    : [`OK: no take >= ${PRISMA_TAKE_LIMIT} in app/components/lib`],
)

printSection(
  "Silent empty fallbacks",
  silentFallbackMatches.length > 0
    ? silentFallbackMatches.slice(0, 25).map((violation) => violation.message)
    : ["OK: no catch(() => []) fallbacks in app/components/lib"],
)

printSection(
  "Route timing coverage",
  routeTimingViolations.length > 0
    ? routeTimingViolations.map((violation) => violation.message)
    : ["OK: key admin/cabinet pages have route and step timing"],
)

if (silentFallbackMatches.length > 25) {
  console.log(`...and ${silentFallbackMatches.length - 25} more silent fallbacks.`)
}

if (STRICT && (
  budgetViolations.length > 0
  || takeViolations.length > 0
  || routeTimingViolations.length > 0
  || (FAIL_SILENT_FALLBACKS && silentFallbackMatches.length > 0)
)) {
  for (const violation of [
    ...budgetViolations,
    ...takeViolations,
    ...routeTimingViolations,
    ...(FAIL_SILENT_FALLBACKS ? silentFallbackMatches : []),
  ]) {
    emitGithubError(violation)
  }
  process.exitCode = 1
}

async function findRouteTimingViolations() {
  const violations = []
  for (const check of ROUTE_TIMING_CHECKS) {
    const fullPath = path.join(ROOT, check.file)
    const content = await readFile(fullPath, "utf8").catch(() => "")
    if (!content.includes(check.routeToken)) {
      violations.push({
        file: check.file,
        message: `${check.file} does not use ${check.routeToken}; wrap the route in measureServerRoute`,
      })
    }
    if (!content.includes(check.stepToken)) {
      violations.push({
        file: check.file,
        message: `${check.file} does not use measureServerStep; split expensive query groups into measured steps`,
      })
    }
  }
  return violations
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
    if (Number.isFinite(value) && value >= PRISMA_TAKE_LIMIT) {
      results.push({ line: index + 1, value })
    }
  }
  return results
}

function findSilentFallbacks(content) {
  const results = []
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    if (/\.catch\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/.test(lines[index])) {
      results.push(index + 1)
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

function readKbEnv(name, fallback) {
  return readNumberEnv(name, fallback)
}

function readNumberEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function emitGithubError({ file, line, message }) {
  if (!process.env.GITHUB_ACTIONS) return
  const location = [`file=${file.replaceAll(path.sep, "/")}`]
  if (line) location.push(`line=${line}`)
  console.log(`::error ${location.join(",")}::${message}`)
}
