import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { LANDLORD } from "@/lib/landlord"

export const dynamic = "force-dynamic"

// GET /api/export/1c?from=2026-01-01&to=2026-12-31
// Возвращает .txt в формате 1C-EnterpriseData (упрощённый формат для импорта банковской выписки)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (!buildingId) return NextResponse.json({ error: "Building not selected" }, { status: 400 })
  await assertBuildingInOrg(buildingId, orgId)

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")
  const today = new Date()
  const from = fromStr ? new Date(fromStr) : new Date(today.getFullYear(), 0, 1)
  const to = toStr ? new Date(toStr) : new Date(today.getFullYear(), 11, 31, 23, 59, 59)

  const floorIds = (await db.floor.findMany({
    where: { buildingId },
    select: { id: true },
  })).map((f) => f.id)

  const payments = await db.payment.findMany({
    where: {
      paymentDate: { gte: from, lte: to },
      tenant: { space: { floorId: { in: floorIds } } },
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
  lines.push(`РасчСчет=${LANDLORD.iik}`)
  lines.push("")

  for (const p of payments) {
    lines.push("СекцияДокумент=Платежное поручение")
    lines.push(`Номер=${p.id.slice(-6)}`)
    lines.push(`Дата=${p.paymentDate.toISOString().slice(0, 10).replace(/-/g, ".")}`)
    lines.push(`Сумма=${p.amount.toFixed(2)}`)
    lines.push(`ПлательщикРасчСчет=...`)
    lines.push(`ПлательщикИНН=${p.tenant.bin || p.tenant.iin || ""}`)
    lines.push(`Плательщик=${p.tenant.companyName}`)
    lines.push(`ПолучательРасчСчет=${LANDLORD.iik}`)
    lines.push(`ПолучательИНН=${LANDLORD.iin}`)
    lines.push(`Получатель=${LANDLORD.fullName}`)
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
