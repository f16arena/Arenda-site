import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope, spaceScope, requestScope, leadScope, contractScope, userScope } from "@/lib/tenant-scope"
import { safeServerValue } from "@/lib/server-fallback"

export const dynamic = "force-dynamic"

// GET /api/search?q=foo
// Возвращает помещения, арендаторов, заявки, лиды, договоры, сотрудников
// по ключу — только в текущей организации.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/api/search", orgId, userId: session.user.id })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  const [tenants, spaces, requests, leads, contracts, generated, staff] = await Promise.all([
    safe(
      "api.search.tenants",
      db.tenant.findMany({
        where: {
          AND: [
            tenantScope(orgId),
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
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, status: true },
        take: 5,
      }),
      [],
    ),
    safe(
      "api.search.leads",
      db.lead.findMany({
        where: {
          AND: [
            leadScope(orgId),
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { contact: { contains: q } },
                { companyName: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: { id: true, name: true, companyName: true },
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
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { tenantName: { contains: q, mode: "insensitive" } },
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
    ...tenants.map((t) => ({
      type: "tenant",
      id: t.id,
      title: t.companyName,
      subtitle: t.user.name,
      href: `/admin/tenants/${t.id}`,
    })),
    ...spaces.map((s) => ({
      type: "space",
      id: s.id,
      title: `Каб. ${s.number}`,
      subtitle: s.floor.name,
      href: `/admin/spaces`,
    })),
    ...requests.map((r) => ({
      type: "request",
      id: r.id,
      title: r.title,
      subtitle: `Заявка · ${r.status}`,
      href: `/admin/requests/${r.id}`,
    })),
    ...leads.map((l) => ({
      type: "lead",
      id: l.id,
      title: l.name,
      subtitle: l.companyName ?? "Лид",
      href: `/admin/leads`,
    })),
    ...contracts.map((c) => ({
      type: "contract",
      id: c.id,
      title: `Договор № ${c.number}`,
      subtitle: c.tenant.companyName,
      href: `/admin/tenants/${c.tenant.id}`,
    })),
    ...generated.map((g) => ({
      type: "document",
      id: g.id,
      title: `${docTypeLabel(g.documentType)} № ${g.number ?? "—"}`,
      subtitle: g.tenantName,
      href: g.tenantId ? `/admin/tenants/${g.tenantId}` : "/admin/documents",
    })),
    ...staff.map((s) => ({
      type: "staff",
      id: s.id,
      title: s.name,
      subtitle: `${roleLabel(s.role)}${s.email ? ` · ${s.email}` : ""}`,
      href: `/admin/staff`,
    })),
  ]

  return NextResponse.json({ items })
}

function docTypeLabel(type: string): string {
  const map: Record<string, string> = {
    INVOICE: "Счёт",
    ACT: "Акт услуг",
    RECONCILIATION: "Акт сверки",
    HANDOVER: "Передача",
    CONTRACT: "Договор",
  }
  return map[type] ?? type
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    OWNER: "Владелец",
    ADMIN: "Администратор",
    ACCOUNTANT: "Бухгалтер",
    FACILITY_MANAGER: "Управляющий",
    EMPLOYEE: "Сотрудник",
  }
  return map[role] ?? role
}
