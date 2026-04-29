import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

// GET /api/export/finances?from=2026-01-01&to=2026-12-31
// Возвращает .xlsx с тремя листами: Начисления / Платежи / Расходы
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

  const tenantWhere = {
    OR: [
      { space: { floorId: { in: floorIds } } },
      { fullFloors: { some: { id: { in: floorIds } } } },
    ],
  }

  const [charges, payments, expenses, building] = await Promise.all([
    db.charge.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        tenant: tenantWhere,
      },
      include: { tenant: { select: { companyName: true, bin: true, iin: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.findMany({
      where: {
        paymentDate: { gte: from, lte: to },
        tenant: tenantWhere,
      },
      include: { tenant: { select: { companyName: true, bin: true, iin: true } } },
      orderBy: { paymentDate: "asc" },
    }),
    db.expense.findMany({
      where: { date: { gte: from, lte: to }, buildingId },
      orderBy: { date: "asc" },
    }),
    db.building.findUnique({
      where: { id: buildingId },
      select: { name: true },
    }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = "Commrent"
  wb.created = new Date()

  // ── Sheet 1: Начисления ─────────────────────────────────────
  const wsCh = wb.addWorksheet("Начисления", {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  })
  wsCh.columns = [
    { header: "Дата", key: "date", width: 12 },
    { header: "Период", key: "period", width: 10 },
    { header: "Арендатор", key: "tenant", width: 30 },
    { header: "БИН/ИИН", key: "bin", width: 15 },
    { header: "Тип", key: "type", width: 14 },
    { header: "Описание", key: "description", width: 50 },
    { header: "Сумма ₸", key: "amount", width: 14 },
    { header: "Срок", key: "dueDate", width: 12 },
    { header: "Оплачено", key: "paid", width: 10 },
  ]
  wsCh.getRow(1).font = { bold: true }
  wsCh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  let totalCharges = 0
  let totalPaid = 0
  for (const c of charges) {
    wsCh.addRow({
      date: c.createdAt,
      period: c.period,
      tenant: c.tenant.companyName,
      bin: c.tenant.bin || c.tenant.iin || "",
      type: c.type,
      description: c.description ?? "",
      amount: c.amount,
      dueDate: c.dueDate,
      paid: c.isPaid ? "Да" : "Нет",
    })
    totalCharges += c.amount
    if (c.isPaid) totalPaid += c.amount
  }

  // Итого
  const sumRow = wsCh.addRow({
    tenant: "ИТОГО",
    amount: totalCharges,
  })
  sumRow.font = { bold: true }
  sumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }

  wsCh.getColumn("amount").numFmt = "#,##0 ₸"
  wsCh.getColumn("date").numFmt = "dd.mm.yyyy"
  wsCh.getColumn("dueDate").numFmt = "dd.mm.yyyy"

  // ── Sheet 2: Платежи ────────────────────────────────────────
  const wsP = wb.addWorksheet("Платежи")
  wsP.columns = [
    { header: "Дата", key: "date", width: 12 },
    { header: "Арендатор", key: "tenant", width: 30 },
    { header: "БИН/ИИН", key: "bin", width: 15 },
    { header: "Метод", key: "method", width: 12 },
    { header: "Сумма ₸", key: "amount", width: 14 },
    { header: "Примечание", key: "note", width: 40 },
  ]
  wsP.getRow(1).font = { bold: true }
  wsP.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  let totalPayments = 0
  for (const p of payments) {
    wsP.addRow({
      date: p.paymentDate,
      tenant: p.tenant.companyName,
      bin: p.tenant.bin || p.tenant.iin || "",
      method: p.method,
      amount: p.amount,
      note: p.note ?? "",
    })
    totalPayments += p.amount
  }
  const pSumRow = wsP.addRow({ tenant: "ИТОГО", amount: totalPayments })
  pSumRow.font = { bold: true }
  pSumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }
  wsP.getColumn("amount").numFmt = "#,##0 ₸"
  wsP.getColumn("date").numFmt = "dd.mm.yyyy"

  // ── Sheet 3: Расходы ────────────────────────────────────────
  const wsE = wb.addWorksheet("Расходы")
  wsE.columns = [
    { header: "Дата", key: "date", width: 12 },
    { header: "Период", key: "period", width: 10 },
    { header: "Категория", key: "category", width: 18 },
    { header: "Описание", key: "description", width: 50 },
    { header: "Сумма ₸", key: "amount", width: 14 },
  ]
  wsE.getRow(1).font = { bold: true }
  wsE.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  let totalExpenses = 0
  for (const e of expenses) {
    wsE.addRow({
      date: e.date,
      period: e.period,
      category: e.category,
      description: e.description ?? "",
      amount: e.amount,
    })
    totalExpenses += e.amount
  }
  const eSumRow = wsE.addRow({ category: "ИТОГО", amount: totalExpenses })
  eSumRow.font = { bold: true }
  eSumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }
  wsE.getColumn("amount").numFmt = "#,##0 ₸"
  wsE.getColumn("date").numFmt = "dd.mm.yyyy"

  // ── Sheet 4: Сводка ─────────────────────────────────────────
  const wsS = wb.addWorksheet("Сводка")
  wsS.columns = [
    { header: "Показатель", key: "label", width: 30 },
    { header: "Значение", key: "value", width: 20 },
  ]
  wsS.getRow(1).font = { bold: true }
  wsS.addRow({ label: "Здание", value: building?.name ?? "" })
  wsS.addRow({ label: "Период", value: `${from.toLocaleDateString("ru-RU")} — ${to.toLocaleDateString("ru-RU")}` })
  wsS.addRow({})
  wsS.addRow({ label: "Начислено всего", value: totalCharges }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: "Оплачено по начислениям", value: totalPaid }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: "Поступило платежей", value: totalPayments }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: "Расходы", value: totalExpenses }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({})
  const profit = totalPayments - totalExpenses
  const profitRow = wsS.addRow({ label: "Прибыль", value: profit })
  profitRow.font = { bold: true }
  profitRow.getCell("value").numFmt = "#,##0 ₸"

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `Финансы_${building?.name ?? "БЦ"}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
