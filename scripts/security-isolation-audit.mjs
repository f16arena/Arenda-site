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
  {
    file: "lib/building-access.ts",
    tokens: ["db.userBuildingAccess.findMany", "administratorUserId: userId"],
    forbidden: ["administratorUserId: null", "return db.building.findMany({\n    where: { organizationId: orgId"],
    message: "staff building access must be explicit and must not fall back to all org buildings",
  },
  {
    file: "app/superadmin/layout.tsx",
    tokens: ["isPlatformOwner", "redirect(\"/admin\")"],
    message: "superadmin support mode must be limited to platform owner",
  },
  {
    file: "app/cabinet/page.tsx",
    tokens: ["where: { userId: session!.user.id }", "getOrganizationRequisites"],
    forbidden: ["ownerUser", "ownerUserId"],
    message: "tenant cabinet must not query owner user data and must load tenant by authenticated user",
  },
  {
    file: "app/admin/storage/page.tsx",
    tokens: ["organizationId: orgId", "restrictByBuildings", "getAccessibleBuildingIdsForSession"],
    message: "storage page must be org-scoped and building-scoped for staff",
  },
  {
    file: "app/api/storage/[id]/route.ts",
    tokens: ["user.organizationId !== file.organizationId", "TENANT_VISIBLE", "tenant: { userId"],
    message: "storage download route must enforce org and tenant visibility",
  },
  {
    file: "prisma/migrations/20260506060000_harden_prisma_migrations_rls/migration.sql",
    tokens: ["ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY", "prisma_migrations_no_client_access", "REVOKE ALL"],
    message: "Prisma migration metadata must be protected from Supabase public roles",
  },
  {
    file: "scripts/deploy-migrations.mjs",
    tokens: ["hardenPrismaMigrationsTable", "prisma_migrations_no_client_access"],
    message: "deploy baseline must harden Prisma migration metadata after bootstrap",
  },
  {
    file: "scripts/e2e-isolation.ts",
    tokens: ["RUN_E2E_ISOLATION", "getAccessibleBuildingsForUser", "tenantScope(orgA.id)", "_prisma_migrations"],
    message: "SaaS isolation E2E must cover building access, tenant scope and RLS metadata",
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

  const forbidden = (check.forbidden ?? []).filter((token) => content.includes(token))
  if (forbidden.length > 0) {
    failures.push({
      file: check.file,
      message: `${check.message}; forbidden tokens present: ${forbidden.join(", ")}`,
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
