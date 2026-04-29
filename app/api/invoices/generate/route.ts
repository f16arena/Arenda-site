import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { LANDLORD } from "@/lib/landlord"
import { Document, Packer } from "docx"
import {
  p, center, heading, row, fmtMoney, fmtDate, periodLabel, numberToWords,
  Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType,
  tableThin, tableNoBorders,
} from "@/lib/docx-helpers"
import { renderDocx, renderXlsx } from "@/lib/template-engine"

export const dynamic = "force-dynamic"

// GET /api/invoices/generate?tenantId=xxx&period=2026-04&number=001
// "Счёт на оплату" — произвольная форма по РК. Не НДС-документ, не основание для бухучёта.
// Только инструкция плательщику для перевода. ЭСФ выпускается отдельно через esf.gov.kz.
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  const period = searchParams.get("period") ?? new Date().toISOString().slice(0, 7)
  const invoiceNumber = searchParams.get("number") ?? `${period.replace("-", "")}-001`

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
        fullFloors: true,
        charges: { where: { period }, orderBy: { createdAt: "asc" } },
        contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { isVatPayer: true, vatRate: true },
    }),
  ])
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const today = new Date()
  const dueDate = new Date(today.getFullYear(), today.getMonth(), tenant.paymentDueDay)
  const contract = tenant.contracts[0]
  const withVat = !!organization?.isVatPayer
  const vatRate = organization?.vatRate ?? 12

  // Считаем строки счёта
  const items: { name: string; qty: number; unit: string; price: number; amount: number }[] = []

  if (tenant.charges.length > 0) {
    // Используем существующие начисления
    for (const c of tenant.charges) {
      items.push({
        name: c.description ?? `${c.type} (${period})`,
        qty: 1,
        unit: "услуга",
        price: c.amount,
        amount: c.amount,
      })
    }
  } else {
    // Генерируем строки на лету (если ещё нет начислений)
    const fullFloor = tenant.fullFloors?.[0]
    const monthlyRent = fullFloor?.fixedMonthlyRent
      ?? (tenant.space ? tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm) : 0)
    const placement = fullFloor?.name ?? (tenant.space ? `Каб. ${tenant.space.number}, ${tenant.space.floor.name}` : "")
    items.push({
      name: `Аренда нежилого помещения (${placement}) за ${periodLabel(period)}`,
      qty: 1,
      unit: "мес",
      price: monthlyRent,
      amount: monthlyRent,
    })
    if (tenant.needsCleaning && tenant.cleaningFee > 0) {
      items.push({
        name: `Уборка помещения за ${periodLabel(period)}`,
        qty: 1,
        unit: "мес",
        price: tenant.cleaningFee,
        amount: tenant.cleaningFee,
      })
    }
  }

  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  // НДС начисляется "сверху" — стандартная схема для РК
  const vatAmount = withVat ? Math.round(subtotal * vatRate / 100) : 0
  const total = subtotal + vatAmount

  // Build DOCX
  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableThin,
    rows: [
      row(["№", "Наименование услуги", "Кол-во", "Ед.", "Цена ₸", "Сумма ₸"], {
        bold: true,
        widths: [5, 50, 10, 10, 12, 13],
        align: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
                AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT],
      }),
      ...items.map((it, i) => row(
        [String(i + 1), it.name, String(it.qty), it.unit, fmtMoney(it.price), fmtMoney(it.amount)],
        {
          widths: [5, 50, 10, 10, 12, 13],
          align: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
                  AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT],
        }
      )),
      row(["", "Итого:", "", "", "", fmtMoney(subtotal)], {
        widths: [5, 50, 10, 10, 12, 13],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER,
                AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT],
      }),
      ...(withVat ? [row(["", `НДС ${vatRate}%:`, "", "", "", fmtMoney(vatAmount)], {
        widths: [5, 50, 10, 10, 12, 13],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER,
                AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT],
      })] : []),
      row(["", "Всего к оплате:", "", "", "", fmtMoney(total)], {
        bold: true,
        widths: [5, 50, 10, 10, 12, 13],
        align: [AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER,
                AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.RIGHT],
      }),
    ],
  })

  // Реквизиты в виде таблицы (без рамок)
  const sideTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableNoBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Поставщик:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: LANDLORD.fullName, size: 20 })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `Адрес: ${LANDLORD.legalAddress}`, size: 20 })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `ИИН: ${LANDLORD.iin}`, size: 20 })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `Банк: ${LANDLORD.bank}`, size: 20 })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `ИИК: ${LANDLORD.iik}`, size: 20 })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `БИК: ${LANDLORD.bik}`, size: 20 })], spacing: { after: 60 } }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Получатель:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: tenant.companyName, size: 20 })], spacing: { after: 60 } }),
              ...(tenant.legalAddress ? [new Paragraph({ children: [new TextRun({ text: `Адрес: ${tenant.legalAddress}`, size: 20 })], spacing: { after: 60 } })] : []),
              ...(tenant.iin ? [new Paragraph({ children: [new TextRun({ text: `ИИН: ${tenant.iin}`, size: 20 })], spacing: { after: 60 } })] : []),
              ...(tenant.bin ? [new Paragraph({ children: [new TextRun({ text: `БИН: ${tenant.bin}`, size: 20 })], spacing: { after: 60 } })] : []),
              ...(tenant.bankName ? [new Paragraph({ children: [new TextRun({ text: `Банк: ${tenant.bankName}`, size: 20 })], spacing: { after: 60 } })] : []),
              ...(tenant.iik ? [new Paragraph({ children: [new TextRun({ text: `ИИК: ${tenant.iik}`, size: 20 })], spacing: { after: 60 } })] : []),
              ...(tenant.bik ? [new Paragraph({ children: [new TextRun({ text: `БИК: ${tenant.bik}`, size: 20 })], spacing: { after: 60 } })] : []),
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
        center(`Счёт на оплату № ${invoiceNumber} от ${fmtDate(today)}`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } }),
        ...(contract ? [p(`По договору № ${contract.number}${contract.startDate ? ` от ${fmtDate(contract.startDate)}` : ""}`, { indent: false })] : []),
        p(`Срок оплаты: до ${fmtDate(dueDate)}`, { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        sideTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 300 } }),
        heading("Услуги"),
        itemsTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        ...(withVat ? [p(`в т.ч. НДС ${vatRate}%: ${fmtMoney(vatAmount)} тенге`, { indent: false })] : [p("Без НДС (поставщик не плательщик НДС).", { indent: false })]),
        p(`Всего к оплате: ${fmtMoney(total)} (${numberToWords(total)}) тенге`, { bold: true, indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        p(`Назначение платежа: «Оплата за аренду по счёту № ${invoiceNumber} от ${fmtDate(today)}${contract ? `, договор № ${contract.number}` : ""}»`, { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 400 } }),
        p(`Поставщик: ___________________ ${LANDLORD.directorShort}    М.П.`, { indent: false }),
      ],
    }],
  })

  // Если есть активный кастомный шаблон — используем его
  const customTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "INVOICE", isActive: true },
    orderBy: { uploadedAt: "desc" },
  }).catch(() => null)

  let buffer: Buffer
  let format: "DOCX" | "XLSX" = "DOCX"
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  let fileName = `Счет_на_оплату_${invoiceNumber}_${safeTenant}_${period}.docx`

  if (customTemplate && customTemplate.format !== "PDF") {
    // Подготовим данные для подстановки
    const templateData = {
      invoice_number: invoiceNumber,
      invoice_date: fmtDate(today),
      due_date: fmtDate(dueDate),
      period: periodLabel(period),
      tenant_name: tenant.companyName,
      tenant_bin: tenant.bin || tenant.iin || "",
      tenant_address: tenant.legalAddress || "",
      tenant_iik: tenant.iik || "",
      tenant_bank: tenant.bankName || "",
      landlord_name: LANDLORD.fullName,
      landlord_bin: LANDLORD.iin,
      landlord_iik: LANDLORD.iik,
      landlord_bik: LANDLORD.bik,
      landlord_bank: LANDLORD.bank,
      landlord_director: LANDLORD.directorShort,
      subtotal: fmtMoney(subtotal),
      vat_rate: withVat ? `${vatRate}` : "",
      vat_amount: withVat ? fmtMoney(vatAmount) : "",
      total: fmtMoney(total),
      total_in_words: numberToWords(total),
      contract_number: contract?.number || "",
      purpose: `Оплата за аренду по счёту № ${invoiceNumber} от ${fmtDate(today)}${contract ? `, договор № ${contract.number}` : ""}`,
      items: items.map((it) => ({
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        price: fmtMoney(it.price),
        amount: fmtMoney(it.amount),
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
      console.error("[invoice template render error]", e)
      // Fallback на стандартный
      buffer = await Packer.toBuffer(doc)
    }
  } else {
    buffer = await Packer.toBuffer(doc)
  }

  // Сохраняем копию в архив
  await db.generatedDocument.create({
    data: {
      organizationId: orgId,
      documentType: "INVOICE",
      number: invoiceNumber,
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
