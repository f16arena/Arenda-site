import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { suggestDocumentNumber } from "@/lib/document-numbering"
import { nextDocumentNumber } from "@/lib/document-number"
import { resolveMonthRange } from "@/lib/period-range"
import { Document, Packer } from "docx"
import {
  p, center, row, fmtMoney, fmtDate, numberToWords,
  Paragraph, TextRun, AlignmentType, WidthType, Table, tableThin,
} from "@/lib/docx-helpers"

export const dynamic = "force-dynamic"

const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода",
  HEATING: "Отопление", GARBAGE: "Вывоз мусора", SECURITY: "Охрана",
  INTERNET: "Интернет", GAS: "Газ", CLEANING: "Уборка", PENALTY: "Пеня", OTHER: "Прочее",
}

// GET /api/reconciliation/generate?tenantId=xxx&year=2026&number=001
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  const numberParam = searchParams.get("number")
  const { from, to, fromDate, toEndExclusive, toEndDate } = resolveMonthRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    year: searchParams.get("year"),
  })

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 })

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(tenantId, orgId)
    // Сотрудник с доступом к части зданий — только арендаторы своих зданий.
    await assertTenantBuildingAccess(tenantId, orgId)
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-tenant access" }, { status: 403 })
  }

  const [tenant, organization] = await Promise.all([
    db.tenant.findFirst({
      where: { id: tenantId, ...tenantScope(orgId) },
      include: {
        user: { select: { name: true } },
        bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        charges: { where: { deletedAt: null, period: { gte: from, lte: to } }, orderBy: { period: "asc" } },
        payments: {
          where: { deletedAt: null, paymentDate: { gte: fromDate, lt: toEndExclusive } },
          orderBy: { paymentDate: "asc" },
        },
      },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: ORGANIZATION_REQUISITES_SELECT }),
  ])
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const landlord = organizationToRequisites(organization)

  // Реестр операций: с позиции арендодателя — начисление = дебет, оплата = кредит.
  // Колонки контрагента (their_*) оставляем пустыми для встречной сверки.
  type Entry = { sortDate: number; date: string; doc: string; debit: number; credit: number }
  const entries: Entry[] = []
  for (const c of tenant.charges) {
    entries.push({
      sortDate: c.createdAt.getTime(),
      date: fmtDate(c.createdAt),
      doc: `${CHARGE_TYPES[c.type] ?? c.type} · ${c.period}${c.description ? ` (${c.description})` : ""}`,
      debit: c.amount,
      credit: 0,
    })
  }
  for (const pay of tenant.payments) {
    entries.push({
      sortDate: pay.paymentDate.getTime(),
      date: fmtDate(pay.paymentDate),
      doc: `Оплата · ${pay.method}${pay.note ? ` (${pay.note})` : ""}`,
      debit: 0,
      credit: pay.amount,
    })
  }
  entries.sort((a, b) => a.sortDate - b.sortDate)

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const balance = totalDebit - totalCredit
  const building = await db.building.findFirst({ where: { organizationId: orgId } })
  // Если в настройках задан стартовый номер актов сверки (продолжение из 1С) —
  // обычная порядковая нумерация организации, как у АВР и счетов.
  const numberingOrg = await db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } })
  const reconciliationStart = (numberingOrg?.docNumberStart as Record<string, number> | null)?.RECONCILIATION
  const reconciliationNumber = numberParam
    ?? (reconciliationStart ? await nextDocumentNumber(orgId, "RECONCILIATION") : null)
    ?? (building ? await suggestDocumentNumber(building.id, "reconciliation").catch(() => null) : null)
    ?? `${from.slice(0, 4)}-001`

  const periodStart = fmtDate(fromDate)
  const periodEnd = fmtDate(toEndDate)

  // Встроенный DOCX-фолбэк (если шаблон не загружен).
  const fallbackTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableThin,
    rows: [
      row(["№", "Дата", "Документ / операция", "Дебет ₸", "Кредит ₸"], {
        bold: true, widths: [5, 15, 50, 15, 15],
        align: [AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT],
      }),
      ...entries.map((e, i) => row(
        [String(i + 1), e.date, e.doc, e.debit ? fmtMoney(e.debit) : "—", e.credit ? fmtMoney(e.credit) : "—"],
        { widths: [5, 15, 50, 15, 15], align: [AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT] },
      )),
      row(["", "", "ИТОГО", fmtMoney(totalDebit), fmtMoney(totalCredit)], {
        bold: true, widths: [5, 15, 50, 15, 15],
        align: [AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
      }),
    ],
  })

  const doc = new Document({
    styles: { default: { document: { run: { size: 22, font: "Times New Roman" } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [
        center(`Акт сверки взаимных расчётов № ${reconciliationNumber}`),
        center(`за период с ${periodStart} по ${periodEnd}`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 150 } }),
        p(`Между ${landlord.fullName} (БИН/ИИН ${landlord.bin || landlord.taxId}) и ${tenant.companyName} (БИН/ИИН ${tenant.bin || tenant.iin || "—"}).`, { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 150 } }),
        fallbackTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        p(`Сальдо на ${periodEnd}: ${fmtMoney(Math.abs(balance))} (${numberToWords(Math.abs(balance))}) тенге ${balance >= 0 ? "— задолженность в пользу арендодателя" : "— переплата арендатора"}.`, { bold: true, indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 300 } }),
        p(`От ${landlord.fullName}: ___________________`, { indent: false }),
        p(`От ${tenant.companyName}: ___________________`, { indent: false }),
      ],
    }],
  })

  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const fileName = `Акт_сверки_${reconciliationNumber}_${safeTenant}_${from}_${to}.docx`

  const buffer = await Packer.toBuffer(doc)

  await db.generatedDocument.create({
    data: {
      organizationId: orgId,
      documentType: "RECONCILIATION",
      number: reconciliationNumber,
      tenantId: tenant.id,
      tenantName: tenant.companyName,
      period: `${from}..${to}`,
      totalAmount: balance,
      fileName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fileBytes: buffer as any,
      fileSize: buffer.length,
      format: "DOCX",
      generatedById: session.user.id,
    },
  }).then(() => {
    // Инвалидируем /admin/documents, иначе акт сверки появится в списке
    // только после ручной перезагрузки.
    revalidatePath("/admin/documents")
    if (tenant.id) revalidatePath(`/admin/tenants/${tenant.id}`)
  }).catch((e) => console.error("[archive save error]", e))

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
