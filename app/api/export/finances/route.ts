import { NextResponse } from "next/server"
import { tenantLinkedToBuildings } from "@/lib/tenant-scope"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireOrgFeature, canPerformCapability } from "@/lib/capabilities"
import { getT } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

// GET /api/export/finances?from=2026-01-01&to=2026-12-31
// Возвращает .xlsx с тремя листами: Начисления / Платежи / Расходы.
// Это таблица для пользователя, а не документ для налоговой, — заголовки
// колонок переводятся (см. docs/i18n-documents-plan.md про документы).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { t, locale } = await getT()
  const { orgId } = await requireOrgAccess()
  if (!(await canPerformCapability(session.user.role, "finance.export", !!session.user.isPlatformOwner, session.user.id))) {
    return NextResponse.json({ error: t("adminDocs.api.export.noFinanceRight") }, { status: 403 })
  }
  try {
    await requireOrgFeature(orgId, "excelExport")
  } catch {
    return NextResponse.json({ error: t("adminDocs.api.export.excelPlan") }, { status: 403 })
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

  // Все 4 пути привязки арендатора к зданию (раньше — только 2).
  const tenantWhere = tenantLinkedToBuildings([buildingId])

  const [charges, payments, expenses, building] = await Promise.all([
    db.charge.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        // deletedAt: null — удалённые строки не должны попадать в выгрузку (аудит 2026-06-10, п.2).
        deletedAt: null,
        tenant: tenantWhere,
      },
      include: { tenant: { select: { companyName: true, bin: true, iin: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.findMany({
      where: {
        paymentDate: { gte: from, lte: to },
        deletedAt: null,
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
  const wsCh = wb.addWorksheet(t("adminDocs.export.finances.sheetCharges"), {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  })
  wsCh.columns = [
    { header: t("adminDocs.export.finances.date"), key: "date", width: 12 },
    { header: t("adminDocs.export.finances.period"), key: "period", width: 10 },
    { header: t("adminDocs.export.finances.tenant"), key: "tenant", width: 30 },
    { header: t("adminDocs.export.finances.taxId"), key: "bin", width: 15 },
    { header: t("adminDocs.export.finances.type"), key: "type", width: 14 },
    { header: t("adminDocs.export.finances.description"), key: "description", width: 50 },
    { header: t("adminDocs.export.finances.amount"), key: "amount", width: 14 },
    { header: t("adminDocs.export.finances.due"), key: "dueDate", width: 12 },
    { header: t("adminDocs.export.finances.paid"), key: "paid", width: 10 },
  ]
  wsCh.getRow(1).font = { bold: true }
  wsCh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  // Вид начисления и способ оплаты — из общего справочника domain, а не кодом
  // enum: в выгрузке их читает бухгалтер, а не программа.
  const chargeTypeLabel = (code: string) => {
    const key = `domain.chargeTypes.${code}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? code : label
  }
  const methodLabel = (code: string) => {
    const key = `domain.paymentMethods.${code}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? code : label
  }
  const yes = t("adminDocs.export.yes")
  const no = t("adminDocs.export.no")

  let totalCharges = 0
  let totalPaid = 0
  for (const c of charges) {
    wsCh.addRow({
      date: c.createdAt,
      period: c.period,
      tenant: c.tenant.companyName,
      bin: c.tenant.bin || c.tenant.iin || "",
      type: chargeTypeLabel(c.type),
      description: c.description ?? "",
      amount: c.amount,
      dueDate: c.dueDate,
      paid: c.isPaid ? yes : no,
    })
    totalCharges += c.amount
    if (c.isPaid) totalPaid += c.amount
  }

  // Итого
  const sumRow = wsCh.addRow({
    tenant: t("adminDocs.export.total"),
    amount: totalCharges,
  })
  sumRow.font = { bold: true }
  sumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }

  wsCh.getColumn("amount").numFmt = "#,##0 ₸"
  wsCh.getColumn("date").numFmt = "dd.mm.yyyy"
  wsCh.getColumn("dueDate").numFmt = "dd.mm.yyyy"

  // ── Sheet 2: Платежи ────────────────────────────────────────
  const wsP = wb.addWorksheet(t("adminDocs.export.finances.sheetPayments"))
  wsP.columns = [
    { header: t("adminDocs.export.finances.date"), key: "date", width: 12 },
    { header: t("adminDocs.export.finances.tenant"), key: "tenant", width: 30 },
    { header: t("adminDocs.export.finances.taxId"), key: "bin", width: 15 },
    { header: t("adminDocs.export.finances.method"), key: "method", width: 12 },
    { header: t("adminDocs.export.finances.amount"), key: "amount", width: 14 },
    { header: t("adminDocs.export.finances.note"), key: "note", width: 40 },
  ]
  wsP.getRow(1).font = { bold: true }
  wsP.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  let totalPayments = 0
  for (const p of payments) {
    wsP.addRow({
      date: p.paymentDate,
      tenant: p.tenant.companyName,
      bin: p.tenant.bin || p.tenant.iin || "",
      method: methodLabel(p.method),
      amount: p.amount,
      note: p.note ?? "",
    })
    totalPayments += p.amount
  }
  const pSumRow = wsP.addRow({ tenant: t("adminDocs.export.total"), amount: totalPayments })
  pSumRow.font = { bold: true }
  pSumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }
  wsP.getColumn("amount").numFmt = "#,##0 ₸"
  wsP.getColumn("date").numFmt = "dd.mm.yyyy"

  // ── Sheet 3: Расходы ────────────────────────────────────────
  const wsE = wb.addWorksheet(t("adminDocs.export.finances.sheetExpenses"))
  wsE.columns = [
    { header: t("adminDocs.export.finances.date"), key: "date", width: 12 },
    { header: t("adminDocs.export.finances.period"), key: "period", width: 10 },
    { header: t("adminDocs.export.finances.category"), key: "category", width: 18 },
    { header: t("adminDocs.export.finances.description"), key: "description", width: 50 },
    { header: t("adminDocs.export.finances.amount"), key: "amount", width: 14 },
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
  const eSumRow = wsE.addRow({ category: t("adminDocs.export.total"), amount: totalExpenses })
  eSumRow.font = { bold: true }
  eSumRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }
  wsE.getColumn("amount").numFmt = "#,##0 ₸"
  wsE.getColumn("date").numFmt = "dd.mm.yyyy"

  // ── Sheet 4: Сводка ─────────────────────────────────────────
  const wsS = wb.addWorksheet(t("adminDocs.export.finances.sheetSummary"))
  wsS.columns = [
    { header: t("adminDocs.export.finances.metric"), key: "label", width: 30 },
    { header: t("adminDocs.export.finances.value"), key: "value", width: 20 },
  ]
  wsS.getRow(1).font = { bold: true }
  wsS.addRow({ label: t("adminDocs.export.finances.building"), value: building?.name ?? "" })
  wsS.addRow({
    label: t("adminDocs.export.finances.period"),
    value: t("adminDocs.export.finances.range", {
      from: formatDateShortL(locale, from),
      to: formatDateShortL(locale, to),
    }),
  })
  wsS.addRow({})
  wsS.addRow({ label: t("adminDocs.export.finances.totalCharged"), value: totalCharges }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: t("adminDocs.export.finances.totalChargePaid"), value: totalPaid }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: t("adminDocs.export.finances.totalPayments"), value: totalPayments }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({ label: t("adminDocs.export.finances.totalExpenses"), value: totalExpenses }).getCell("value").numFmt = "#,##0 ₸"
  wsS.addRow({})
  const profit = totalPayments - totalExpenses
  const profitRow = wsS.addRow({ label: t("adminDocs.export.finances.profit"), value: profit })
  profitRow.font = { bold: true }
  profitRow.getCell("value").numFmt = "#,##0 ₸"

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `${t("adminDocs.export.finances.fileName", {
    building: building?.name ?? t("adminDocs.export.finances.defaultBuilding"),
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  })}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
