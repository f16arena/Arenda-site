import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { LANDLORD } from "@/lib/landlord"
import { Document, Packer } from "docx"
import {
  p, center, heading, row, fmtMoney, fmtDate, periodLabel, numberToWords, shortName,
  Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType,
  tableThin, tableNoBorders,
} from "@/lib/docx-helpers"

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
  const fullFloor = tenant.fullFloors?.[0]
  const monthlyRent = fullFloor?.fixedMonthlyRent
    ?? (tenant.space ? tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm) : 0)
  const placement = fullFloor?.name ?? (tenant.space ? `Каб. ${tenant.space.number}, ${tenant.space.floor.name}` : "")

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
  const total = items.reduce((s, it) => s + it.amount, 0)

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
      row(["", "Итого:", "", fmtMoney(total)], {
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
              new Paragraph({ children: [new TextRun({ text: LANDLORD.fullName, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: `ИИН: ${LANDLORD.iin}`, size: 20 })], spacing: { after: 100 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `___________________ ${LANDLORD.directorShort}`, size: 22 })],
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
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        p(`Мы, нижеподписавшиеся, ${LANDLORD.fullName} (далее — Исполнитель), в лице руководителя ${LANDLORD.directorShort}, с одной стороны, и ${tenant.companyName} (далее — Заказчик), в лице ${tenant.directorName ?? tenant.user.name}, с другой стороны, составили настоящий акт о том, что Исполнитель оказал Заказчику следующие услуги в полном объёме и в установленные сроки, а Заказчик принял эти услуги без претензий по объёму, качеству и срокам оказания:`),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
        itemsTable,
        new Paragraph({ children: [new TextRun("")], spacing: { before: 200 } }),
        p(`Всего на сумму: ${fmtMoney(total)} (${numberToWords(total)}) тенге.`, { bold: true, indent: false }),
        p("Услуги оказаны в полном объёме, в установленные сроки. Стороны претензий друг к другу не имеют.", { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 400 } }),
        sideTable,
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const fileName = `Акт_${actNumber}_${safeTenant}_${period}.docx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
