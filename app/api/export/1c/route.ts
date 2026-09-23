import { NextResponse } from "next/server"
import { tenantLinkedToBuildings } from "@/lib/tenant-scope"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { requireOrgFeature, canPerformCapability } from "@/lib/capabilities"
import { getT } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

// GET /api/export/1c?from=2026-01-01&to=2026-12-31
// Возвращает .txt в формате 1C-EnterpriseData (упрощённый формат для импорта банковской выписки).
//
// Служебные слова формата («СекцияДокумент=», «ВерсияФормата=», «Плательщик=»)
// НЕ переводятся: их разбирает 1С по точному совпадению, а не человек.
// Переведены только сообщения об ошибках доступа.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { t } = await getT()
  const { orgId } = await requireOrgAccess()
  if (!(await canPerformCapability(session.user.role, "finance.export1c", !!session.user.isPlatformOwner, session.user.id))) {
    return NextResponse.json({ error: t("adminDocs.api.export.no1cRight") }, { status: 403 })
  }
  try {
    await requireOrgFeature(orgId, "export1c")
  } catch {
    return NextResponse.json({ error: t("adminDocs.api.export.export1cPlan") }, { status: 403 })
  }
  const buildingId = await getCurrentBuildingId()
  if (!buildingId) return NextResponse.json({ error: "Building not selected" }, { status: 400 })
  await assertBuildingInOrg(buildingId, orgId)

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")
  const today = new Date()
  const from = fromStr ? new Date(fromStr) : new Date(today.getFullYear(), 0, 1)
  const to = toStr ? new Date(toStr) : new Date(today.getFullYear(), 11, 31, 23, 59, 59)
  const landlord = await getOrganizationRequisites(orgId)

  const payments = await db.payment.findMany({
    where: {
      paymentDate: { gte: from, lte: to },
      // deletedAt: null — удалённые платежи не должны попадать в 1С (аудит 2026-06-10, п.2).
      deletedAt: null,
      // Все 4 пути привязки: раньше только основное помещение — оплаты киоска,
      // антенн, нескольких помещений и этажа целиком в 1С не попадали.
      tenant: tenantLinkedToBuildings([buildingId]),
    },
    include: { tenant: { select: { companyName: true, bin: true, iin: true } } },
    orderBy: { paymentDate: "asc" },
  })

  // Формат 1C-Enterprise Data Export (упрощённый, текстовый)
  const lines: string[] = []
  lines.push("1CClientBankExchange")
  lines.push("ВерсияФормата=1.02")
  lines.push("Кодировка=UTF-8")
  lines.push(`Отправитель=Commrent`)
  lines.push(`ДатаСоздания=${today.toISOString().slice(0, 10).replace(/-/g, ".")}`)
  lines.push(`ВремяСоздания=${today.toTimeString().slice(0, 5)}`)
  lines.push(`ДатаНачала=${from.toISOString().slice(0, 10).replace(/-/g, ".")}`)
  lines.push(`ДатаКонца=${to.toISOString().slice(0, 10).replace(/-/g, ".")}`)
  lines.push(`РасчСчет=${landlord.iik}`)
  lines.push("")

  for (const p of payments) {
    lines.push("СекцияДокумент=Платежное поручение")
    lines.push(`Номер=${p.id.slice(-6)}`)
    lines.push(`Дата=${p.paymentDate.toISOString().slice(0, 10).replace(/-/g, ".")}`)
    lines.push(`Сумма=${p.amount.toFixed(2)}`)
    lines.push(`ПлательщикРасчСчет=...`)
    lines.push(`ПлательщикИНН=${p.tenant.bin || p.tenant.iin || ""}`)
    lines.push(`Плательщик=${p.tenant.companyName}`)
    lines.push(`ПолучательРасчСчет=${landlord.iik}`)
    lines.push(`ПолучательИНН=${landlord.taxId}`)
    lines.push(`Получатель=${landlord.fullName}`)
    lines.push(`НазначениеПлатежа=${p.note || `Аренда от ${p.paymentDate.toISOString().slice(0, 10)}`}`)
    lines.push("КонецДокумента")
    lines.push("")
  }

  lines.push("КонецФайла")
  const content = lines.join("\r\n")

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="1c_export_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.txt"`,
    },
  })
}
