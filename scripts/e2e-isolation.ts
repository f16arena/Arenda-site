import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

const RUN_FLAG = "RUN_E2E_ISOLATION"
const WRITE_FLAG = "E2E_ALLOW_DB_WRITE"
const URL_ENV = "E2E_DATABASE_URL"

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertSafeDatabaseUrl(e2eDatabaseUrl: string) {
  if (process.env[WRITE_FLAG] !== "1") {
    throw new Error(`${WRITE_FLAG}=1 is required because this test writes and cleans up records`)
  }

  const applicationUrl = process.env.DATABASE_URL
  if (
    applicationUrl &&
    e2eDatabaseUrl === applicationUrl &&
    process.env.E2E_ALLOW_PRODUCTION_URL !== "1"
  ) {
    throw new Error(
      `${URL_ENV} matches DATABASE_URL. Use a staging/test database, or set E2E_ALLOW_PRODUCTION_URL=1 intentionally.`,
    )
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function visibleIds(items: Array<{ id: string }>) {
  return new Set(items.map((item) => item.id))
}

async function main() {
  if (process.env[RUN_FLAG] !== "1") {
    console.log(`[e2e-isolation] skipped: set ${RUN_FLAG}=1 to run against a staging database`)
    return
  }

  const databaseUrl = requireEnv(URL_ENV)
  assertSafeDatabaseUrl(databaseUrl)
  process.env.DATABASE_URL = databaseUrl

  const [{ db }, { getAccessibleBuildingsForUser }, { tenantScope }] = await Promise.all([
    import("../lib/db"),
    import("../lib/building-access"),
    import("../lib/tenant-scope"),
  ])

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ids: Record<string, string | undefined> = {}

  try {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({ data: { name: `E2E Isolation Org A ${stamp}`, slug: `e2e-iso-a-${stamp}` } }),
      db.organization.create({ data: { name: `E2E Isolation Org B ${stamp}`, slug: `e2e-iso-b-${stamp}` } }),
    ])
    ids.orgA = orgA.id
    ids.orgB = orgB.id

    const [ownerA, adminA, tenantUserA, ownerB, tenantUserB] = await Promise.all([
      db.user.create({
        data: {
          name: "E2E Owner A",
          email: `owner-a-${stamp}@example.test`,
          phone: `+7702${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "OWNER",
          organizationId: orgA.id,
        },
      }),
      db.user.create({
        data: {
          name: "E2E Admin A",
          email: `admin-a-${stamp}@example.test`,
          phone: `+7703${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "ADMIN",
          organizationId: orgA.id,
        },
      }),
      db.user.create({
        data: {
          name: "E2E Tenant A",
          email: `tenant-a-${stamp}@example.test`,
          phone: `+7704${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "TENANT",
          organizationId: orgA.id,
        },
      }),
      db.user.create({
        data: {
          name: "E2E Owner B",
          email: `owner-b-${stamp}@example.test`,
          phone: `+7705${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "OWNER",
          organizationId: orgB.id,
        },
      }),
      db.user.create({
        data: {
          name: "E2E Tenant B",
          email: `tenant-b-${stamp}@example.test`,
          phone: `+7706${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "TENANT",
          organizationId: orgB.id,
        },
      }),
    ])
    ids.ownerA = ownerA.id
    ids.adminA = adminA.id
    ids.tenantUserA = tenantUserA.id
    ids.ownerB = ownerB.id
    ids.tenantUserB = tenantUserB.id

    const [buildingA1, buildingA2, buildingB1] = await Promise.all([
      db.building.create({ data: { organizationId: orgA.id, name: "E2E A1", address: "KZ, A1" } }),
      db.building.create({ data: { organizationId: orgA.id, name: "E2E A2", address: "KZ, A2" } }),
      db.building.create({ data: { organizationId: orgB.id, name: "E2E B1", address: "KZ, B1" } }),
    ])
    ids.buildingA1 = buildingA1.id
    ids.buildingA2 = buildingA2.id
    ids.buildingB1 = buildingB1.id

    const access = await db.userBuildingAccess.create({
      data: { userId: adminA.id, buildingId: buildingA1.id },
    })
    ids.access = access.id

    const [floorA1, floorA2, floorB1] = await Promise.all([
      db.floor.create({ data: { buildingId: buildingA1.id, number: 1, name: "A1 floor", ratePerSqm: 2500 } }),
      db.floor.create({ data: { buildingId: buildingA2.id, number: 1, name: "A2 floor", ratePerSqm: 2500 } }),
      db.floor.create({ data: { buildingId: buildingB1.id, number: 1, name: "B1 floor", ratePerSqm: 2500 } }),
    ])
    ids.floorA1 = floorA1.id
    ids.floorA2 = floorA2.id
    ids.floorB1 = floorB1.id

    const [spaceA1, spaceA2, spaceB1] = await Promise.all([
      db.space.create({ data: { floorId: floorA1.id, number: "101", area: 50, status: "OCCUPIED" } }),
      db.space.create({ data: { floorId: floorA2.id, number: "201", area: 60, status: "VACANT" } }),
      db.space.create({ data: { floorId: floorB1.id, number: "301", area: 70, status: "OCCUPIED" } }),
    ])
    ids.spaceA1 = spaceA1.id
    ids.spaceA2 = spaceA2.id
    ids.spaceB1 = spaceB1.id

    const [tenantA, tenantB] = await Promise.all([
      db.tenant.create({
        data: {
          userId: tenantUserA.id,
          spaceId: spaceA1.id,
          companyName: "E2E Tenant A LLP",
          legalType: "TOO",
          bin: "000000000001",
          fixedMonthlyRent: 100000,
        },
      }),
      db.tenant.create({
        data: {
          userId: tenantUserB.id,
          spaceId: spaceB1.id,
          companyName: "E2E Tenant B LLP",
          legalType: "TOO",
          bin: "000000000002",
          fixedMonthlyRent: 200000,
        },
      }),
    ])
    ids.tenantA = tenantA.id
    ids.tenantB = tenantB.id

    const ownerAVisible = visibleIds(await getAccessibleBuildingsForUser({
      userId: ownerA.id,
      orgId: orgA.id,
      role: "OWNER",
      isPlatformOwner: false,
    }))
    expect(ownerAVisible.has(buildingA1.id), "Owner A cannot see own building A1")
    expect(ownerAVisible.has(buildingA2.id), "Owner A cannot see own building A2")
    expect(!ownerAVisible.has(buildingB1.id), "Owner A can see Org B building")

    const adminAVisible = visibleIds(await getAccessibleBuildingsForUser({
      userId: adminA.id,
      orgId: orgA.id,
      role: "ADMIN",
      isPlatformOwner: false,
    }))
    expect(adminAVisible.has(buildingA1.id), "Admin A cannot see explicitly assigned building")
    expect(!adminAVisible.has(buildingA2.id), "Admin A can see unassigned building in same org")
    expect(!adminAVisible.has(buildingB1.id), "Admin A can see foreign org building")

    const adminAInOrgB = await getAccessibleBuildingsForUser({
      userId: adminA.id,
      orgId: orgB.id,
      role: "ADMIN",
      isPlatformOwner: false,
    })
    expect(adminAInOrgB.length === 0, "Admin A got access when evaluated under Org B")

    const tenantAOnly = await db.tenant.findMany({
      where: tenantScope(orgA.id),
      select: { id: true },
    })
    const tenantAIds = visibleIds(tenantAOnly)
    expect(tenantAIds.has(tenantA.id), "tenantScope(orgA) does not include Org A tenant")
    expect(!tenantAIds.has(tenantB.id), "tenantScope(orgA) leaks Org B tenant")

    const tenantBOnly = await db.tenant.findMany({
      where: tenantScope(orgB.id),
      select: { id: true },
    })
    const tenantBIds = visibleIds(tenantBOnly)
    expect(tenantBIds.has(tenantB.id), "tenantScope(orgB) does not include Org B tenant")
    expect(!tenantBIds.has(tenantA.id), "tenantScope(orgB) leaks Org A tenant")

    const neverTenantCount = await db.tenant.count({ where: tenantScope(null) })
    expect(neverTenantCount === 0, "tenantScope(null) returned tenant records")

    const tenantCabinetLookup = await db.tenant.findUnique({
      where: { userId: tenantUserA.id },
      select: {
        id: true,
        user: { select: { organizationId: true } },
      },
    })
    expect(tenantCabinetLookup?.id === tenantA.id, "Tenant cabinet lookup by userId returned wrong tenant")
    expect(tenantCabinetLookup.user.organizationId === orgA.id, "Tenant cabinet lookup crossed organization")

    const migrationRls = await db.$queryRaw<Array<{ relrowsecurity: boolean; policy_count: number }>>`
      SELECT
        c.relrowsecurity,
        count(p.*)::int AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname = '_prisma_migrations'
      GROUP BY c.relrowsecurity
    `
    if (migrationRls.length > 0) {
      expect(migrationRls[0].relrowsecurity === true, "_prisma_migrations RLS is not enabled")
      expect(migrationRls[0].policy_count > 0, "_prisma_migrations has RLS enabled but no policy")
    }

    console.log("[e2e-isolation] passed")
  } finally {
    await db.tenant.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB].filter(Boolean) as string[] } } })
    await db.space.deleteMany({ where: { id: { in: [ids.spaceA1, ids.spaceA2, ids.spaceB1].filter(Boolean) as string[] } } })
    await db.floor.deleteMany({ where: { id: { in: [ids.floorA1, ids.floorA2, ids.floorB1].filter(Boolean) as string[] } } })
    await db.userBuildingAccess.deleteMany({ where: { id: { in: [ids.access].filter(Boolean) as string[] } } })
    await db.building.deleteMany({ where: { id: { in: [ids.buildingA1, ids.buildingA2, ids.buildingB1].filter(Boolean) as string[] } } })
    await db.user.deleteMany({
      where: {
        id: {
          in: [ids.ownerA, ids.adminA, ids.tenantUserA, ids.ownerB, ids.tenantUserB].filter(Boolean) as string[],
        },
      },
    })
    await db.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB].filter(Boolean) as string[] } } })
    await db.$disconnect()
  }
}

function digits(source: string, length: number) {
  return source.replace(/\D/g, "").slice(-length).padStart(length, "0")
}

main().catch((error) => {
  console.error("[e2e-isolation] failed")
  console.error(error)
  process.exit(1)
})
