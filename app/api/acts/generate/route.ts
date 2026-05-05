import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { Document, Packer } from "docx"
import {
  p, center, row, fmtMoney, fmtDate, periodLabel, numberToWords, shortName,
  Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType,
  tableThin, tableNoBorders,
} from "@/lib/docx-helpers"
import { renderDocx, renderXlsx } from "@/lib/template-engine"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"

export const dynamic = "force-dynamic"

// GET /api/acts/generate?tenantId=xxx&period=2026-04&number=001
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  const period = searchParams.get("period") ?? new Date().toISOString().slice(0, 7)
  const actNumber = searchParams.get("number") ?? `${period.replace("-", "")}-001`

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 })

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(tenantId, orgId)
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-tenant access" }, { status: 403 })
  }

  const [tenant, organization] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        user: true,
        space: { include: { floor: true } },
        tenantSpaces: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: { space: { include: { floor: true } } },
        },
        fullFloors: true,
        charges: { where: { period }, orderBy: { createdAt: "asc" } },
        contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true },
    }),
  ])
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const landlord = organizationToRequisites(organization)
  const today = new Date()
  const contract = tenant.contracts[0]
  const withVat = !!organization?.isVatPayer
  const vatRate = coerceKzVatRate(organization?.vatRate, DEFAULT_KZ_VAT_RATE)
  const tenantVatRate = coerceKzVatRate(tenant.vatRate, DEFAULT_KZ_VAT_RATE)
  const [py, pm] = period.split("-").map(Number)
  const periodStart = new Date(py, pm - 1, 1)
  const periodEnd = new Date(py, pm, 0)
  const fullFloor = tenant.fullFloors?.[0]
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const monthlyRent = calculateTenantMonthlyRent(tenant)
  const placement = fullFloor?.name
    ?? (assignedSpaces.length > 0
      ? assignedSpaces.map((space) => `Каб. ${space.number}, ${space.floor.name}`).join("; ")
      : "по договору")

  const items: { name: string; amount: number }[] = []
  if (tenant.charges.length > 0) {
    for (const c of tenant.charges) {
      items.push({ name: c.description ?? c.type, amount: c.amount })
    }
  } else {
    items.push({
      name: `Аренда нежилого помещения${placement ? ` (${placement})` : ""} за ${periodLabel(period)}`,
      amount: monthlyRent,
    })
    if (tenant.needsCleaning && tenant.cleaningFee > 0) {
      items.push({ name: `Уборка помещения за ${periodLabel(period)}`, amount: tenant.cleaningFee })
    }
  }
  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  const vatAmount = withVat ? Math.round(subtotal * vatRate / 100) : 0
  const total = subtotal + vatAmount

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableThin,
    rows: [
      row(["№", "Наименование услуги", "Период", "Сумма ₸"], {
        bold: true,
        widths: [5, 60, 15, 20],
        align: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT],
      }),
      ...items.map((it, i) => row(
        [String(i + 1), it.name, periodLabel(period), fmtMoney(it.amount)],
        {
          widths: [5, 60, 15, 20],
          align: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT],
        }
      )),
      row(["", "Итого:", "", fmtMoney(subtotal)], {
        widths: [5, 60, 15, 20],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER, AlignmentType.RIGHT],
      }),
      ...(withVat ? [row(["", `НДС ${vatRate}%:`, "", fmtMoney(vatAmount)], {
        widths: [5, 60, 15, 20],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER, AlignmentType.RIGHT],
      })] : []),
      row(["", "Всего:", "", fmtMoney(total)], {
        bold: true,
        widths: [5, 60, 15, 20],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER, AlignmentType.RIGHT],
      }),
    ],
  })

  const sideTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableNoBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Исполнитель:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: landlord.fullName, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: `${landlord.taxIdLabel}: ${landlord.taxId}`, size: 20 })], spacing: { after: 100 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `___________________ ${landlord.directorShort}`, size: 22 })],
                spacing: { before: 300 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "М.П.", size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Заказчик:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: tenant.companyName, size: 20 })] }),
              ...(tenant.iin ? [new Paragraph({ children: [new TextRun({ text: `ИИН: ${tenant.iin}`, size: 20 })] })] : []),
              ...(tenant.bin ? [new Paragraph({ children: [new TextRun({ text: `БИН: ${tenant.bin}`, size: 20 })] })] : []),
              new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `___________________ ${shortName(tenant.directorName ?? tenant.user.name)}`, size: 22 })],
                spacing: { before: 300 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "М.П.", size: 18 })],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const doc = new Document({
    styles: { default: { document: { run: { size: 22, font: "Times New Roman" } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1000 } } },
      children: [
        center(`Акт оказанных услуг № ${actNumber} от ${fmtDate(today)}`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } }),
        ...(contract ? [p(`К договору № ${contract.number}${contract.startDate ? ` от ${fmtDate(contract.startDate)}` : ""}`, { indent: false })] : []),
        p(`Период оказания услуг: с ${fmtDate(periodStart)} по ${fmtDate(periodEnd)}`, { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        p(`Мы, нижеподписавшиеся, ${landlord.fullName} (далее — Исполнитель), в лице руководителя ${landlord.directorShort}, с одной стороны, и ${tenant.companyName} (далее — Заказчик), в лице ${tenant.directorName ?? tenant.user.name}, с другой стороны, составили настоящий акт о том, что Исполнитель оказал Заказчику следующие услуги в полном объёме и в установленные сроки, а Заказчик принял эти услуги без претензий по объёму, качеству и срокам оказания:`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        itemsTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        ...(withVat ? [p(`в т.ч. НДС ${vatRate}%: ${fmtMoney(vatAmount)} тенге`, { indent: false })] : [p("Без НДС (Исполнитель не плательщик НДС).", { indent: false })]),
        p(`Всего на сумму: ${fmtMoney(total)} (${numberToWords(total)}) тенге.`, { bold: true, indent: false }),
        p("Услуги оказаны в полном объёме, в установленные сроки. Стороны претензий друг к другу не имеют.", { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 400 } }),
        sideTable,
      ],
    }],
  })

  const customTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "ACT", isActive: true },
    orderBy: { uploadedAt: "desc" },
  }).catch(() => null)

  let buffer: Buffer
  let format: "DOCX" | "XLSX" = "DOCX"
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  let fileName = `Акт_${actNumber}_${safeTenant}_${period}.docx`

  if (customTemplate && customTemplate.format !== "PDF") {
    const templateData = {
      act_number: actNumber,
      act_date: fmtDate(today),
      period_start: fmtDate(periodStart),
      period_end: fmtDate(periodEnd),
      tenant_name: tenant.companyName,
      tenant_bin: tenant.bin || tenant.iin || "",
      tenant_director: tenant.directorName || tenant.user.name,
      tenant_is_vat_payer: tenant.isVatPayer ? "да" : "нет",
      tenant_vat_rate: tenant.isVatPayer ? `${tenantVatRate}` : "",
      tenant_vat_status: tenant.isVatPayer ? `плательщик НДС, ставка ${tenantVatRate}%` : "не является плательщиком НДС",
      landlord_name: landlord.fullName,
      landlord_bin: landlord.bin || landlord.taxId,
      landlord_iin: landlord.iin,
      landlord_director: landlord.directorShort,
      subtotal: fmtMoney(subtotal),
      vat_rate: withVat ? `${vatRate}` : "",
      vat_amount: withVat ? fmtMoney(vatAmount) : "",
      total: fmtMoney(total),
      total_in_words: numberToWords(total),
      contract_number: contract?.number || "",
      items: items.map((it) => ({ name: it.name, amount: fmtMoney(it.amount) })),
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
      console.error("[act template render error]", e)
      buffer = await Packer.toBuffer(doc)
    }
  } else {
    buffer = await Packer.toBuffer(doc)
  }

  await db.generatedDocument.create({
    data: {
      organizationId: orgId,
      documentType: "ACT",
      number: actNumber,
      tenantId: tenant.id,
      tenantName: tenant.companyName,
      period,
      totalAmount: total,
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
