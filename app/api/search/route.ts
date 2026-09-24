import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { restrictedBuildingIds, tenantInBuildingIds } from "@/lib/building-access"
import { tenantScope, spaceScope, requestScope, contractScope, userScope } from "@/lib/tenant-scope"
import { safeServerValue } from "@/lib/server-fallback"
import { getT } from "@/lib/i18n/server"

type Tr = Awaited<ReturnType<typeof getT>>["t"]

export const dynamic = "force-dynamic"

// GET /api/search?q=foo
// Возвращает помещения, арендаторов, заявки, лиды, договоры, сотрудников
// по ключу — только в текущей организации.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Подсказки быстрого поиска видит сотрудник в браузере — язык запроса.
  const { t } = await getT()
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/api/search", orgId, userId: session.user.id })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  // Сотрудник с частью зданий ищет только в своих зданиях.
  const bIds = await restrictedBuildingIds(orgId)
  const tIn = bIds ? [tenantInBuildingIds(bIds)] : []
  const docIn = bIds ? [{ OR: [{ tenantId: null }, { tenant: tenantInBuildingIds(bIds) }] }] : []

  const [tenants, spaces, requests, contracts, generated, staff] = await Promise.all([
    safe(
      "api.search.tenants",
      db.tenant.findMany({
        where: {
          AND: [
            tenantScope(orgId),
            ...tIn,
            {
              OR: [
                { companyName: { contains: q, mode: "insensitive" } },
                { bin: { contains: q } },
                { iin: { contains: q } },
                { user: { name: { contains: q, mode: "insensitive" } } },
              ],
            },
          ],
        },
        select: { id: true, companyName: true, user: { select: { name: true } } },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.spaces",
      db.space.findMany({
        where: {
          AND: [
            spaceScope(orgId),
            ...(bIds ? [{ floor: { buildingId: { in: bIds } } }] : []),
            { number: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, number: true,
          floor: { select: { name: true, buildingId: true } },
        },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.requests",
      db.request.findMany({
        where: {
          AND: [
            requestScope(orgId),
            ...(bIds ? [{ tenant: tenantInBuildingIds(bIds) }] : []),
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, status: true },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.contracts",
      db.contract.findMany({
        where: {
          AND: [
            contractScope(orgId),
            ...(bIds ? [{ tenant: tenantInBuildingIds(bIds) }] : []),
            { number: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, number: true,
          tenant: { select: { id: true, companyName: true } },
        },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.generatedDocuments",
      db.generatedDocument.findMany({
        where: {
          organizationId: orgId,
          AND: [
            ...docIn,
            {
              OR: [
                { number: { contains: q, mode: "insensitive" } },
                { tenantName: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          id: true, number: true, documentType: true,
          tenantName: true, tenantId: true,
        },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.staff",
      db.user.findMany({
        where: {
          AND: [
            userScope(orgId),
            { isActive: true, role: { not: "TENANT" } },
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            },
          ],
        },
        select: { id: true, name: true, email: true, role: true },
        take: 5,
      }),
      [],
    ),
  ])

  type Item = { type: string; id: string; title: string; subtitle?: string; href: string }
  const items: Item[] = [
    // Имя `t` занято переводчиком — в лямбде называем запись row.
    ...tenants.map((row) => ({
      type: "tenant",
      id: row.id,
      title: row.companyName,
      subtitle: row.user.name,
      href: `/admin/tenants/${row.id}`,
    })),
    ...spaces.map((s) => ({
      type: "space",
      id: s.id,
      title: t("adminDocs.api.common.room", { number: s.number }),
      subtitle: s.floor.name,
      href: `/admin/spaces`,
    })),
    ...requests.map((r) => ({
      type: "request",
      id: r.id,
      title: r.title,
      subtitle: t("adminDocs.api.search.request", { status: r.status }),
      href: `/admin/requests/${r.id}`,
    })),
    ...contracts.map((c) => ({
      type: "contract",
      id: c.id,
      title: t("adminDocs.api.search.numbered", { type: t("domain.docTypes.CONTRACT"), number: c.number }),
      subtitle: c.tenant.companyName,
      href: `/admin/tenants/${c.tenant.id}`,
    })),
    ...generated.map((g) => ({
      type: "document",
      id: g.id,
      title: t("adminDocs.api.search.numbered", { type: docTypeLabel(g.documentType, t), number: g.number ?? "—" }),
      subtitle: g.tenantName,
      href: g.tenantId ? `/admin/tenants/${g.tenantId}` : "/admin/documents",
    })),
    ...staff.map((s) => ({
      type: "staff",
      id: s.id,
      title: s.name,
      subtitle: s.email
        ? t("adminDocs.api.search.staff", { role: roleLabel(s.role, t), email: s.email })
        : roleLabel(s.role, t),
      href: `/admin/staff`,
    })),
  ]

  return NextResponse.json({ items })
}

// Чистые помощники переводчик сами не добывают — принимают его параметром.
// Неизвестный код возвращаем как есть: это техническое значение из базы.
function docTypeLabel(type: string, t: Tr): string {
  const map: Record<string, string> = {
    INVOICE: t("domain.docTypes.INVOICE"),
    ACT: t("domain.docTypes.ACT"),
    RECONCILIATION: t("domain.docTypes.RECONCILIATION"),
    HANDOVER: t("domain.docTypes.HANDOVER"),
    CONTRACT: t("domain.docTypes.CONTRACT"),
  }
  return map[type] ?? type
}

function roleLabel(role: string, t: Tr): string {
  const key = `domain.roles.${role}` as Parameters<typeof t>[0]
  const label = t(key)
  // Неизвестную роль показываем кодом: это виднее, чем ключ словаря.
  return label === key ? role : label
}
