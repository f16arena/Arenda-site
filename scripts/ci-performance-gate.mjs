import { appendFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const isWindows = process.platform === "win32"
const npm = "npm"
const npx = "npx"

const DEFAULT_ENV = {
  PERF_AUDIT_STRICT: "1",
  PERF_AUDIT_FAIL_SILENT_FALLBACKS: "1",
  PERF_AUDIT_CLIENT_KB: "140",
  PERF_AUDIT_SERVER_KB: "80",
  PERF_AUDIT_TAKE_LIMIT: "150",
}

const checks = [
  {
    name: "Prisma schema",
    command: npx,
    args: ["prisma", "validate"],
    reason: "schema.prisma должен быть валидным до build/deploy.",
  },
  {
    name: "TypeScript",
    command: npx,
    args: ["tsc", "--noEmit", "--pretty", "false"],
    reason: "Типы должны ловить несовпадение Prisma select, server actions и React props.",
  },
  {
    name: "Performance audit",
    command: npm,
    args: ["run", "perf:audit"],
    env: DEFAULT_ENV,
    reason: "Блокирует тяжелые client/server файлы, большие Prisma take, silent fallbacks и страницы без server timing.",
  },
  {
    name: "Security audit",
    command: npm,
    args: ["run", "security:audit"],
    reason: "Проверяет критичные guardrails: cron auth, tenant isolation, RLS и опасные обходы.",
  },
]

const rows = []
let failed = false

for (const check of checks) {
  const startedAt = Date.now()
  console.log(`\n[ci-performance-gate] ${check.name}`)
  console.log(`[ci-performance-gate] ${check.reason}`)

  const command = isWindows ? "cmd.exe" : check.command
  const args = isWindows ? ["/d", "/s", "/c", windowsCommand(check.command, check.args)] : check.args
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(check.env ?? {}),
    },
    stdio: "inherit",
  })
  const durationMs = Date.now() - startedAt
  const ok = result.status === 0 && !result.error
  if (!ok) failed = true

  rows.push({
    name: check.name,
    status: ok ? "✅ OK" : "❌ Failed",
    durationMs,
    reason: check.reason,
    error: result.error ? String(result.error.message ?? result.error) : "",
  })

  if (!ok) {
    console.error(`[ci-performance-gate] ${check.name} failed with status ${result.status ?? "unknown"}.`)
    if (result.error) {
      console.error(`[ci-performance-gate] ${check.name} error: ${result.error.message}`)
    }
  }
}

writeGithubSummary(rows)

if (failed) {
  console.error("\n[ci-performance-gate] Gate failed. Исправьте ошибки выше перед deploy.")
  process.exit(1)
}

console.log("\n[ci-performance-gate] All checks passed.")

function writeGithubSummary(items) {
  const target = process.env.GITHUB_STEP_SUMMARY
  if (!target) return

  const totalMs = items.reduce((sum, item) => sum + item.durationMs, 0)
  const lines = [
    "## CI Performance Gate",
    "",
    `Total time: ${formatDuration(totalMs)}`,
    "",
    "| Check | Status | Time | Why it matters |",
    "| --- | --- | ---: | --- |",
    ...items.map((item) => `| ${escapeMd(item.name)} | ${item.status} | ${formatDuration(item.durationMs)} | ${escapeMd(item.reason)} |`),
    "",
    "Budgets:",
    "",
    `- Client file: ${DEFAULT_ENV.PERF_AUDIT_CLIENT_KB} KB`,
    `- Server file: ${DEFAULT_ENV.PERF_AUDIT_SERVER_KB} KB`,
    `- Prisma take limit: ${DEFAULT_ENV.PERF_AUDIT_TAKE_LIMIT}`,
    "- Watched heavy files: floor editor, FAQ, tenant detail, admin dashboard, spaces, performance dashboard",
    "- Silent `catch(() => [])`: forbidden",
    "- Key heavy routes must use `measureServerRoute` and `measureServerStep`",
    "",
  ]

  appendFileSync(target, `${lines.join("\n")}\n`, "utf8")
}

function formatDuration(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`
  return `${ms}ms`
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ")
}

function windowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(" ")
}

function quoteWindowsArg(value) {
  if (/^[a-zA-Z0-9_./:=\\-]+$/.test(value)) return value
  return `"${String(value).replaceAll('"', '\\"')}"`
}
