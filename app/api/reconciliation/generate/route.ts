import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { suggestDocumentNumber } from "@/lib/document-numbering"
import { resolveMonthRange } from "@/lib/period-range"
import { buildLegalEntityFullName } from "@/lib/full-name"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { Document, Packer } from "docx"
import {
  p, center, row, fmtMoney, fmtDate, numberToWords,
  Paragraph, TextRun, AlignmentType, WidthType, Table, tableThin,
} from "@/lib/docx-helpers"
import { renderDocx, renderXlsx } from "@/lib/template-engine"

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
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-tenant access" }, { status: 403 })
  }

  const [tenant, organization] = await Promise.all([
    db.tenant.findFirst({
      where: { id: tenantId, ...tenantScope(orgId) },
      include: {
        user: { select: { name: true } },
        bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        charges: { where: { period: { gte: from, lte: to } }, orderBy: { period: "asc" } },
        payments: {
          where: { paymentDate: { gte: fromDate, lt: toEndExclusive } },
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
  // Расчётная месячная аренда (для справки в шапке — клиент может сравнить
  // фактически начисленное с тем что должно быть по договору).
  // calculateTenantMonthlyRent требует space.floor.ratePerSqm — подгружаем.
  const tenantWithRent = await db.tenant.findUnique({
    where: { id: tenant.id },
    include: {
      space: { include: { floor: { select: { ratePerSqm: true } } } },
      tenantSpaces: { include: { space: { include: { floor: { select: { ratePerSqm: true } } } } } },
      fullFloors: true,
    },
  })
  const monthlyRentEstimate = tenantWithRent ? calculateTenantMonthlyRent(tenantWithRent) : 0

  const building = await db.building.findFirst({ where: { organizationId: orgId } })
  const reconciliationNumber = numberParam
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

  const customTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "RECONCILIATION", isActive: true },
    orderBy: { uploadedAt: "desc" },
  }).catch(() => null)

  let buffer: Buffer
  let format: "DOCX" | "XLSX" = "DOCX"
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  let fileName = `Акт_сверки_${reconciliationNumber}_${safeTenant}_${from}_${to}.docx`

  if (customTemplate && customTemplate.format !== "PDF") {
    const templateData = {
      reconciliation_number: reconciliationNumber,
      period_start: periodStart,
      period_end: periodEnd,
      landlord_name: landlord.fullName,
      landlord_full_name: landlord.fullName,
      landlord_bin: landlord.bin || landlord.taxId,
      tenant_name: tenant.companyName,
      tenant_full_name: buildLegalEntityFullName({
        legalType: tenant.legalType,
        companyName: tenant.companyName,
        directorName: tenant.directorName ?? tenant.user?.name,
      }),
      tenant_bin: tenant.bin || tenant.iin || "",
      total_debit: fmtMoney(totalDebit),
      total_credit: fmtMoney(totalCredit),
      balance: fmtMoney(balance),
      // Справочно: расчётная месячная аренда по договору (для верификации).
      monthly_rent_estimate: fmtMoney(monthlyRentEstimate),
      balance_in_words: numberToWords(Math.abs(balance)),
      // Реестр для цикла {#entries}…{/entries}
      entries: entries.map((e) => ({
        date: e.date,
        doc: e.doc,
        our_debit: e.debit ? fmtMoney(e.debit) : "",
        our_credit: e.credit ? fmtMoney(e.credit) : "",
        their_debit: "",
        their_credit: "",
      })),
    }
    try {
      const tplBuf = Buffer.from(customTemplate.fileBytes)
      if (customTemplate.format === "DOCX") {
        buffer = renderDocx(tplBuf, templateData)
      } else {
        buffer = await renderXlsx(tplBuf, templateData)
        format = "XLSX"
        fileName = fileName.replace(/\.docx$/, ".xlsx")
      }
    } catch (e) {
      console.error("[reconciliation template render error]", e)
      buffer = await Packer.toBuffer(doc)
    }
  } else {
    buffer = await Packer.toBuffer(doc)
  }

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
      format,
      generatedById: session.user.id,
      templateUsedId: customTemplate?.id ?? null,
    },
  }).catch((e) => console.error("[archive save error]", e))

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": format === "XLSX"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
