import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { auth } from "@/auth"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { db } from "@/lib/db"
import { getOwnerBuildingMetrics } from "@/lib/owner-dashboard"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  const buildingIds = buildingId ? [buildingId] : await getAccessibleBuildingIdsForSession(orgId)
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format") ?? "xlsx"
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [org, metrics] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    getOwnerBuildingMetrics({ buildingIds, from, to }),
  ])

  if (format === "html") {
    return new NextResponse(renderHtmlReport(org?.name ?? "Commrent", metrics, from), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = "Commrent"
  wb.created = new Date()
  const ws = wb.addWorksheet("Сводка по зданиям")

  ws.columns = [
    { header: "Здание", key: "name", width: 28 },
    { header: "Адрес", key: "address", width: 36 },
    { header: "Доход", key: "income", width: 14 },
    { header: "Расход", key: "expenses", width: 14 },
    { header: "Прибыль", key: "profit", width: 14 },
    { header: "Долг", key: "debt", width: 14 },
    { header: "Долгов, шт", key: "debtCount", width: 12 },
    { header: "Арендаторов", key: "tenantCount", width: 12 },
    { header: "Свободно, м²", key: "vacantArea", width: 14 },
    { header: "Всего, м²", key: "totalArea", width: 14 },
    { header: "Заполняемость, %", key: "occupancyPercent", width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }

  for (const metric of metrics) {
    ws.addRow({
      name: metric.name,
      address: metric.address,
      income: metric.income,
      expenses: metric.expenses,
      profit: metric.profit,
      debt: metric.debt,
      debtCount: metric.debtCount,
      tenantCount: metric.tenantCount,
      vacantArea: metric.vacantArea,
      totalArea: metric.totalArea,
      occupancyPercent: metric.occupancyPercent ?? 0,
    })
  }

  const total = metrics.reduce((acc, metric) => ({
    income: acc.income + metric.income,
    expenses: acc.expenses + metric.expenses,
    profit: acc.profit + metric.profit,
    debt: acc.debt + metric.debt,
    debtCount: acc.debtCount + metric.debtCount,
    tenantCount: acc.tenantCount + metric.tenantCount,
    vacantArea: acc.vacantArea + metric.vacantArea,
    totalArea: acc.totalArea + metric.totalArea,
  }), {
    income: 0,
    expenses: 0,
    profit: 0,
    debt: 0,
    debtCount: 0,
    tenantCount: 0,
    vacantArea: 0,
    totalArea: 0,
  })

  const totalRow = ws.addRow({
    name: "ИТОГО",
    income: total.income,
    expenses: total.expenses,
    profit: total.profit,
    debt: total.debt,
    debtCount: total.debtCount,
    tenantCount: total.tenantCount,
    vacantArea: total.vacantArea,
    totalArea: total.totalArea,
    occupancyPercent: total.totalArea > 0 ? Math.round(((total.totalArea - total.vacantArea) / total.totalArea) * 100) : 0,
  })
  totalRow.font = { bold: true }
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } }

  for (const key of ["income", "expenses", "profit", "debt"] as const) {
    ws.getColumn(key).numFmt = "#,##0 ₸"
  }
  ws.getColumn("vacantArea").numFmt = "#,##0.0"
  ws.getColumn("totalArea").numFmt = "#,##0.0"
  ws.views = [{ state: "frozen", ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `owner-report-${from.toISOString().slice(0, 7)}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}

function renderHtmlReport(orgName: string, metrics: Awaited<ReturnType<typeof getOwnerBuildingMetrics>>, from: Date) {
  const title = `Отчет собственника за ${from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`
  const totals = metrics.reduce((acc, metric) => ({
    income: acc.income + metric.income,
    expenses: acc.expenses + metric.expenses,
    profit: acc.profit + metric.profit,
    debt: acc.debt + metric.debt,
  }), { income: 0, expenses: 0, profit: 0, debt: 0 })

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    p { margin: 0 0 20px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: right; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
    th { background: #f8fafc; }
    tfoot td { font-weight: 700; background: #eff6ff; }
    .toolbar { margin-bottom: 18px; }
    button { border: 1px solid #cbd5e1; background: white; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    @media print { .toolbar { display: none; } body { margin: 16mm; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Сохранить как PDF / печать</button></div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(orgName)}</p>
  <table>
    <thead>
      <tr>
        <th>Здание</th><th>Адрес</th><th>Доход</th><th>Расход</th><th>Прибыль</th><th>Долг</th><th>Свободно</th><th>Заполняемость</th>
      </tr>
    </thead>
    <tbody>
      ${metrics.map((metric) => `<tr>
        <td>${escapeHtml(metric.name)}</td>
        <td>${escapeHtml(metric.address)}</td>
        <td>${formatMoneyPlain(metric.income)}</td>
        <td>${formatMoneyPlain(metric.expenses)}</td>
        <td>${formatMoneyPlain(metric.profit)}</td>
        <td>${formatMoneyPlain(metric.debt)}</td>
        <td>${formatAreaPlain(metric.vacantArea)}</td>
        <td>${metric.occupancyPercent ?? 0}%</td>
      </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">Итого</td>
        <td>${formatMoneyPlain(totals.income)}</td>
        <td>${formatMoneyPlain(totals.expenses)}</td>
        <td>${formatMoneyPlain(totals.profit)}</td>
        <td>${formatMoneyPlain(totals.debt)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`
}

function formatMoneyPlain(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₸`
}

function formatAreaPlain(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} м²`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] ?? char))
}
