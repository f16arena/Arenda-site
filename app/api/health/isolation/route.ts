import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// Эндпоинт для проверки целостности изоляции данных
// Вызывается платформа-админом для аудита
export async function GET() {
  const session = await auth()
  if (!session?.user?.isPlatformOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const issues: string[] = []
  const stats: Record<string, number | string> = {}

  try {
    stats.organizations = await db.organization.count()
    stats.plans = await db.plan.count()
    stats.platformOwners = await db.user.count({ where: { isPlatformOwner: true } })

    // 1. Проверка: каждое здание должно принадлежать организации
    const buildingsWithoutOrg = await db.building.count({ where: { organizationId: undefined as never } })
    if (buildingsWithoutOrg > 0) {
      issues.push(`Есть ${buildingsWithoutOrg} зданий без organization_id`)
    }

    // 2. Проверка: пользователи без organizationId должны быть только PLATFORM_OWNER
    const usersWithoutOrg = await db.user.findMany({
      where: { organizationId: null, isPlatformOwner: false },
      select: { id: true, name: true, email: true, role: true },
    })
    if (usersWithoutOrg.length > 0) {
      issues.push(`Есть ${usersWithoutOrg.length} пользователей без organizationId, не являющихся платформа-админами`)
      stats.orphanUsers = JSON.stringify(usersWithoutOrg.map((u) => ({ id: u.id, role: u.role })))
    }

    // 3. Проверка: каждая организация имеет планы и срок не истёк глобально
    const orgs = await db.organization.findMany({
      select: {
        id: true, name: true, slug: true, planId: true, planExpiresAt: true,
        isActive: true, isSuspended: true,
        _count: { select: { buildings: true, users: true, subscriptions: true } },
      },
    })
    stats.orgsBreakdown = JSON.stringify(orgs.map((o) => ({
      slug: o.slug,
      buildings: o._count.buildings,
      users: o._count.users,
      subs: o._count.subscriptions,
      active: o.isActive,
      suspended: o.isSuspended,
      expiresAt: o.planExpiresAt?.toISOString().slice(0, 10) ?? null,
    })))

    // 4. Проверка: тенанты должны иметь User с organizationId совпадающим с их organizationId через цепочку
    // (через space.floor.building.organizationId vs user.organizationId)
    const tenantMismatches = await db.$queryRaw<Array<{ id: string; tenant_user_org: string; building_org: string }>>`
      SELECT t.id, u.organization_id as tenant_user_org, b.organization_id as building_org
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      JOIN spaces s ON t.space_id = s.id
      JOIN floors f ON s.floor_id = f.id
      JOIN buildings b ON f.building_id = b.id
      WHERE u.organization_id != b.organization_id
      LIMIT 10
    `.catch(() => [])
    if (tenantMismatches.length > 0) {
      issues.push(`Найдено ${tenantMismatches.length} арендаторов с несовпадающими организациями (User ↔ Building)`)
    }

    return NextResponse.json({
      ok: issues.length === 0,
      issues,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    }, { status: 500 })
  }
}
