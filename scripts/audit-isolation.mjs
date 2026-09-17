// Аудит изоляции данных между организациями и зданиями.
//
// Правило: любая серверная функция (server action или обработчик маршрута),
// которая читает или меняет данные организации, обязана ограничить выборку —
// либо фильтром (organizationId / building.organizationId), либо проверкой
// принадлежности (assert…InOrg из lib/scope-guards), либо тем, что данные
// выбираются по текущему пользователю (сессия) или по токену доступа.
//
// Скрипт разбирает файлы по функциям и печатает те, где ни одного признака нет.
// Запуск: node scripts/audit-isolation.mjs [--json]

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const DIRS = ["app", "lib"]
// модели организации: напрямую или по цепочке здание → этаж → помещение → арендатор
const MODELS = new Set([
  "building", "floor", "space", "tenant", "contract", "charge", "payment", "meter",
  "meterReading", "request", "requestComment", "task", "expense", "recurringExpense",
  "tenantSpace", "tenantDocument", "tenantBankAccount", "message", "emergencyContact",
  "staff", "salaryPayment", "debtInstallmentPlan", "debtInstallment", "paymentReport",
  "complaint", "lead", "builderProject", "builderShare", "storedFile", "documentTemplate",
  "generatedDocument", "documentSignature", "documentSignatureRequest", "contractDraft",
  "listingDraft", "apiKey", "cashAccount", "cashTransaction", "buildingNotice",
  "buildingDecor", "userBuildingAccess", "orgEsfConfig", "tariff", "marketRentStat",
])
const OPS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "update", "updateMany", "delete", "deleteMany", "upsert", "count", "aggregate", "groupBy", "create", "createMany"])
// признаки ограничения внутри функции
const SCOPE_MARKS = [
  "organizationId", "orgId", "assertBuildingInOrg", "assertTenantInOrg", "assertFloorInOrg",
  "assertSpaceInOrg", "assertChargeInOrg", "assertPaymentInOrg", "assertContractInOrg",
  "assertRequestInOrg", "assertTaskInOrg", "assertLeadInOrg", "assertExpenseInOrg",
  "assertRecurringExpenseInOrg", "assertMeterInOrg", "assertStaffInOrg",
  "assertTenantDocumentInOrg", "assertUserInOrg", "requireOrgAccess", "requirePlatformOwner",
  "getCurrentBuildingId", "buildingScope", "scopeWhere", "session.user.id", "userId: session",
  "tenantId: session", "requireTenantSession", "requireMobileSession", "shareToken", "token",
  "apiKey", "requireApiKey", "getOrgIdBySlug", "currentBuildingId", "accessibleBuildingIds",
  // мобильное приложение: сессия сотрудника (со списком зданий) и сессия арендатора
  "getMobileStaffRequest", "getMobileTenantRequest", "getMobileContext", "mobileError",
  "buildingIds", "tenant.id", "session.tenantId",
]
// файлы, где изоляция по смыслу не нужна
const SKIP = [
  "app/actions/demo.ts", "lib/db.ts", "prisma/", "app/superadmin/", "app/actions/superadmin",
  "scripts/", "lib/mail", "lib/audit.ts",
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (["node_modules", ".next", "generated"].includes(name)) continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

/** Разбор файла на функции верхнего уровня: имя, тело, строка начала. */
function functions(src) {
  const out = []
  const re = /(export\s+)?(async\s+)?function\s+(\w+)\s*\(|export\s+const\s+(\w+)\s*=\s*(async\s*)?\(/g
  let m
  const starts = []
  while ((m = re.exec(src))) starts.push({ index: m.index, name: m[3] ?? m[4] })
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index
    const to = i + 1 < starts.length ? starts[i + 1].index : src.length
    out.push({ name: starts[i].name, body: src.slice(from, to), line: src.slice(0, from).split("\n").length })
  }
  if (!out.length) out.push({ name: "<module>", body: src, line: 1 })
  return out
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) => {
  const rel = relative(ROOT, f).replaceAll("\\", "/")
  return !SKIP.some((s) => rel.startsWith(s))
})

const findings = []
for (const file of files) {
  const rel = relative(ROOT, file).replaceAll("\\", "/")
  const src = readFileSync(file, "utf8")
  if (!/\b(db|prisma|tx)\.\w+\.\w+\(/.test(src)) continue
  const fileScoped = SCOPE_MARKS.some((k) => src.includes(k))
  for (const fn of functions(src)) {
    const calls = [...fn.body.matchAll(/\b(?:db|prisma|tx)\.(\w+)\.(\w+)\(/g)]
      .filter(([, model, op]) => MODELS.has(model) && OPS.has(op))
    if (!calls.length) continue
    const scoped = SCOPE_MARKS.some((k) => fn.body.includes(k))
    if (scoped) continue
    // функция без признаков ограничения — но, возможно, весь файл ограничен выше
    findings.push({ file: rel, line: fn.line, fn: fn.name, fileScoped, models: [...new Set(calls.map(([, m]) => m))] })
  }
}

const hard = findings.filter((f) => !f.fileScoped)
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ findings, hard }, null, 2))
} else {
  console.log("── функции без ограничения по организации (файл тоже без признаков) ──")
  for (const f of hard) console.log(`  ${f.file}:${f.line} ${f.fn}() — ${f.models.join(", ")}`)
  console.log(`\nвсего: ${hard.length} жёстких, ${findings.length - hard.length} мягких (ограничение выше по файлу)`)
}
process.exit(hard.length ? 1 : 0)
