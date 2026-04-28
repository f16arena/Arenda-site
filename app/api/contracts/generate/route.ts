import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { LANDLORD, BUILDING_DEFAULT } from "@/lib/landlord"
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx"

export const dynamic = "force-dynamic"

// GET /api/contracts/generate?tenantId=xxx&format=docx
// Возвращает DOCX-файл с автозаполненными реквизитами
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      user: true,
      space: { include: { floor: true } },
      fullFloors: true,
    },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const building = await db.building.findFirst({ where: { isActive: true } })

  // Расчёт суммы аренды
  const fullFloor = tenant.fullFloors?.[0]
  const area = fullFloor?.totalArea ?? tenant.space?.area ?? 0
  const monthlyRent = fullFloor?.fixedMonthlyRent
    ?? (tenant.space ? tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm) : 0)
  const objectAddress = building?.address ?? BUILDING_DEFAULT.address
  const placement = fullFloor?.name
    ?? (tenant.space ? `${tenant.space.floor.name}, кабинет ${tenant.space.number}` : "")

  const today = new Date()
  const start = tenant.contractStart ?? today
  const end = tenant.contractEnd ?? new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1)

  const fmtDate = (d: Date) => `«${String(d.getDate()).padStart(2, "0")}» ${MONTH[d.getMonth()]} ${d.getFullYear()} г.`
  const num = (n: number) => n.toLocaleString("ru-RU")

  // ── Помощники ─────────────────────────────────────────────
  const p = (text: string, opts?: { bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; size?: number; spaceAfter?: number; indent?: boolean }) => new Paragraph({
    alignment: opts?.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts?.spaceAfter ?? 100 },
    indent: opts?.indent !== false ? { firstLine: 567 } : undefined,
    children: [new TextRun({ text, bold: opts?.bold, size: opts?.size ?? 22 })],
  })
  const heading = (text: string) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22 })],
  })
  const center = (text: string, opts?: { bold?: boolean; size?: number }) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: opts?.bold ?? true, size: opts?.size ?? 24 })],
  })
  const right = (text: string) => new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, size: 22 })],
  })

  // Tenant data
  const tenantName = tenant.companyName
  const tenantDir = tenant.directorName ?? tenant.user.name
  const tenantDirShort = shortName(tenantDir)
  const tenantBasis = tenant.bin
    ? `Свидетельства о государственной регистрации № ${tenant.bin}`
    : tenant.iin
    ? `документа удостоверяющего личность (ИИН ${tenant.iin})`
    : "учредительных документов"

  const children = [
    center(`Договор № ${searchParams.get("number") ?? "01-XXX"} аренды нежилого помещения`),
    new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } }),

    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: "г. Усть-Каменогорск", size: 22 }),
        new TextRun({ text: "                                                            ", size: 22 }),
        new TextRun({ text: fmtDate(today), size: 22 }),
      ],
      spacing: { after: 200 },
    }),

    p(`${LANDLORD.fullName}, именуемый в дальнейшем «Арендодатель», в лице руководителя ${LANDLORD.directorShort}, действующего на основании ${LANDLORD.basis}, с одной стороны, и ${tenantName}, именуем${["TOO", "AO"].includes(tenant.legalType) ? "ое" : "ый"} в дальнейшем «Арендатор», в лице ${tenantDir}${tenant.directorPosition ? ` (${tenant.directorPosition})` : ""}, действующего на основании ${tenantBasis}, с другой стороны, заключили настоящий Договор аренды нежилого помещения о нижеследующем:`),

    heading("1. Предмет договора"),
    p(`1.1. Арендодатель обязуется передать, а Арендатор принять во временное владение и пользование (аренду) за плату на срок настоящего Договора нежилое помещение, расположенное по адресу: ${objectAddress}${placement ? `, ${placement}` : ""}, площадью ${area} кв.м., именуемое в дальнейшем «Помещение», в здании, принадлежащем Арендодателю на праве собственности.`),
    p(`1.2. Арендодатель за отдельную плату может предоставлять Арендатору телефонную линию, интернет, отопление и электроэнергию, которые не относятся к арендным платежам и оплачиваются Арендатором.`),
    p(`1.3. Арендатор оплачивает арендные платежи в порядке и на условиях, определенных в настоящем Договоре.`),

    heading("2. Срок аренды"),
    p(`2.1. Договор вступает в силу с ${fmtDate(start)} и действует по ${fmtDate(end)}.`),
    p(`2.2. По истечении срока аренды Арендатор имеет право на заключение договора на новый срок, уведомив Арендодателя письменно не позднее, чем за 1 (один) месяц.`),

    heading("3. Арендная плата и порядок расчётов"),
    p(`3.1. Сумма арендной платы по соглашению сторон составляет: ${num(monthlyRent)} (${numberToWords(monthlyRent)}) тенге в месяц.`),
    p(`3.2. Оплата производится не позднее ${tenant.paymentDueDay} числа каждого месяца на условиях предоплаты, независимо от фактического количества дней в месяце.`),
    p(`3.3. Оплата производится путём перечисления на счёт Арендодателя, внесением наличных в кассу или иным согласованным способом.`),
    p(`3.4. Арендная плата подлежит ежегодной индексации с 1 января на величину официального уровня инфляции, публикуемого Национальным банком Республики Казахстан.`),
    p(`3.5. В арендную плату не включена стоимость коммунальных услуг: теплоснабжение, водоснабжение, вывоз мусора, уборка, охрана здания.`),

    heading("4. Права и обязанности Арендодателя"),
    p(`4.1. Передать Помещение в трёхдневный срок с момента подписания настоящего договора по Акту приёма-передачи.`),
    p(`4.2. Производить капитальный ремонт Помещения и обеспечивать беспрепятственное пользование.`),
    p(`4.3. Своевременно выставлять счета на оплату с предоставлением счёта-фактуры и акта оказанных услуг.`),

    heading("5. Права и обязанности Арендатора"),
    p(`5.1. В 10-дневный срок с момента подписания принять Помещение.`),
    p(`5.2. Использовать Помещение по целевому назначению.`),
    p(`5.3. Своевременно производить арендные платежи.`),
    p(`5.4. Содержать Помещение в порядке, предусмотренном санитарными и противопожарными правилами.`),
    p(`5.5. Не осуществлять перестройку и перепланировку без письменного согласия Арендодателя.`),
    p(`5.6. Возвратить Помещение после прекращения договора в состоянии, пригодном для дальнейшего использования с учётом нормального износа.`),

    heading("6. Ответственность сторон"),
    p(`6.1. В случае просрочки уплаты арендных платежей Арендатор обязан уплатить пеню в размере ${tenant.penaltyPercent}% от суммы долга за каждый день просрочки, но не более 10% от суммы Договора.`),

    heading("7. Прочие условия"),
    p(`7.1. Споры разрешаются путём переговоров, в претензионном порядке, а впоследствии в суде.`),
    p(`7.2. Все изменения и дополнения действительны лишь в письменной форме при подписании обеими Сторонами.`),
    p(`7.3. Договор составлен на русском языке в двух экземплярах, имеющих одинаковую юридическую силу.`),

    heading("8. Реквизиты сторон"),
    new Paragraph({ children: [new TextRun("")] }),
    requisitesTable(
      {
        title: "Арендодатель:",
        lines: [
          LANDLORD.fullName,
          `Адрес: ${LANDLORD.legalAddress}`,
          `ИИН: ${LANDLORD.iin}`,
          `ИИК: ${LANDLORD.iik}`,
          `БИК: ${LANDLORD.bik}`,
          `Банк: ${LANDLORD.bank}`,
          `Тел: ${LANDLORD.phone}`,
          `Email: ${LANDLORD.email}`,
        ],
        signature: LANDLORD.directorShort,
      },
      {
        title: "Арендатор:",
        lines: [
          tenantName,
          tenant.legalAddress ? `Адрес: ${tenant.legalAddress}` : null,
          tenant.iin ? `ИИН: ${tenant.iin}` : null,
          tenant.bin ? `БИН: ${tenant.bin}` : null,
          tenant.iik ? `ИИК: ${tenant.iik}` : null,
          tenant.bik ? `БИК: ${tenant.bik}` : null,
          tenant.bankName ? `Банк: ${tenant.bankName}` : null,
          tenant.user.phone ? `Тел: ${tenant.user.phone}` : null,
          tenant.user.email ? `Email: ${tenant.user.email}` : null,
        ].filter(Boolean) as string[],
        signature: tenantDirShort,
      },
    ),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: { run: { size: 22, font: "Times New Roman" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1000 } } },
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const fileName = `Договор_${tenantName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")}_${start.getFullYear()}.docx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}

function requisitesTable(left: SideData, right: SideData): Table {
  const cellChildren = (s: SideData) => [
    new Paragraph({
      children: [new TextRun({ text: s.title, bold: true, size: 22 })],
      spacing: { after: 100 },
    }),
    ...s.lines.map((l) => new Paragraph({
      children: [new TextRun({ text: l, size: 20 })],
      spacing: { after: 60 },
    })),
    new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `___________________ ${s.signature}`, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "М.П.", size: 18 })],
    }),
  ]

  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: cellChildren(left), width: { size: 50, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: cellChildren(right), width: { size: 50, type: WidthType.PERCENTAGE } }),
        ],
      }),
    ],
  })
}

type SideData = { title: string; lines: string[]; signature: string }

const MONTH = [
  "января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря",
]

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

function numberToWords(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000)
    return `${m} миллион${m === 1 ? "" : m < 5 ? "а" : "ов"}`
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000)
    return `${k} тысяч${k === 1 ? "а" : k < 5 ? "и" : ""}`
  }
  return String(n)
}
