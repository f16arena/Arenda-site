import { readFile } from "fs/promises"
import path from "path"

const ROOT = process.cwd()

const checks = [
  {
    file: "app/api/cron/check-deadlines/route.ts",
    tokens: ["authorizeCronRequest"],
    message: "cron endpoint must use authorizeCronRequest",
  },
  {
    file: "app/api/cron/monthly-invoices/route.ts",
    tokens: ["authorizeCronRequest"],
    message: "monthly invoice cron must use authorizeCronRequest",
  },
  {
    file: "app/api/cron/check-subscriptions/route.ts",
    tokens: ["authorizeCronRequest"],
    message: "subscription cron must use authorizeCronRequest",
  },
  {
    file: "app/actions/finance.ts",
    tokens: ["requireSection(\"finances\", \"edit\")", "assertTenantInOrg", "assertTenantBuildingAccess"],
    message: "finance mutations must be role-protected and tenant/building scoped",
  },
  {
    file: "app/actions/tenant.ts",
    tokens: ["assertTenantInOrg", "assertTenantBuildingAccess"],
    message: "tenant mutations must keep org and building isolation",
  },
  {
    file: "app/admin/spaces/page.tsx",
    tokens: ["calculateTenantMonthlyRent", "getAccessibleBuildingIdsForSession"],
    message: "spaces page must use shared rent helper and building access scope",
  },
  {
    file: "app/admin/tenants/[id]/page.tsx",
    tokens: ["assertTenantInOrg", "assertBuildingInOrg"],
    message: "tenant detail page must assert tenant and building scope",
  },
  {
    file: "app/cabinet/page.tsx",
    tokens: ["where: { userId: session!.user.id }"],
    message: "tenant cabinet must load data by the authenticated tenant user",
  },
  {
    file: "lib/faq-db.ts",
    tokens: ["createMissingFaqDefaults", "skipDuplicates: true"],
    message: "FAQ defaults must sync safely without overwriting custom articles",
  },
]

const failures = []

for (const check of checks) {
  const fullPath = path.join(ROOT, check.file)
  const content = await readFile(fullPath, "utf8").catch((error) => {
    failures.push({ file: check.file, message: `cannot read file: ${error.message}` })
    return ""
  })
  if (!content) continue

  const missing = check.tokens.filter((token) => !content.includes(token))
  if (missing.length > 0) {
    failures.push({
      file: check.file,
      message: `${check.message}; missing: ${missing.join(", ")}`,
    })
  }
}

if (failures.length > 0) {
  console.log("\nSecurity / isolation audit")
  console.log("--------------------------")
  for (const failure of failures) {
    console.log(`${failure.file}: ${failure.message}`)
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error file=${failure.file.replaceAll(path.sep, "/")}::${failure.message}`)
    }
  }
  process.exitCode = 1
} else {
  console.log("Security / isolation audit")
  console.log("--------------------------")
  console.log("OK: critical guardrails are present.")
}
