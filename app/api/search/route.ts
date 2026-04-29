import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope, spaceScope, requestScope, leadScope } from "@/lib/tenant-scope"

export const dynamic = "force-dynamic"

// GET /api/search?q=foo
// Возвращает помещения, арендаторов, заявки, лиды по ключу — только в текущей организации.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  const [tenants, spaces, requests, leads] = await Promise.all([
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
    }).catch(() => []),
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
    }).catch(() => []),
    db.request.findMany({
      where: {
        AND: [
          requestScope(orgId),
          { title: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, status: true },
      take: 5,
    }).catch(() => []),
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
    }).catch(() => []),
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
  ]

  return NextResponse.json({ items })
}
