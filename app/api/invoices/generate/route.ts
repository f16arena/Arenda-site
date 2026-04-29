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

export const dynamic = "force-dynamic"

// GET /api/invoices/generate?tenantId=xxx&period=2026-04&number=001
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

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      user: true,
      space: { include: { floor: true } },
      fullFloors: true,
      charges: { where: { period }, orderBy: { createdAt: "asc" } },
    },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const today = new Date()

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

  const total = items.reduce((s, it) => s + it.amount, 0)

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
      row(["", "Итого:", "", "", "", fmtMoney(total)], {
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
        center(`Счёт-фактура № ${invoiceNumber} от ${fmtDate(today)}`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        sideTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 300 } }),
        heading("Услуги"),
        itemsTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        p(`Всего к оплате: ${fmtMoney(total)} (${numberToWords(total)}) тенге`, { bold: true, indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 400 } }),
        p(`Поставщик: ___________________ ${LANDLORD.directorShort}    М.П.`, { indent: false }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const fileName = `Счет_${invoiceNumber}_${safeTenant}_${period}.docx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
