import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { BUILDING_DEFAULT } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { extractDocxPlaceholders, extractXlsxPlaceholders, renderDocx, renderXlsx } from "@/lib/template-engine"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm } from "@/lib/rent"
import {
  LEASE_ADDITIONAL_SERVICES_CLAUSE,
  LEASE_ESF_CLAUSE,
  LEASE_PROLONGATION_CLAUSE,
  buildLeaseRentClause,
  getLeaseRentBasisLabel,
} from "@/lib/contract-clauses"

export const dynamic = "force-dynamic"

// GET /api/contracts/generate?tenantId=xxx&format=docx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `contract:${session.user.id}`), {
    max: 30,
    window: 60 * 60_000,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.` },
      { status: 429 },
    )
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 })
  }

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
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: true } } },
      },
      fullFloors: true,
    },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const landlord = await getOrganizationRequisites(orgId)
  const contractNumber = searchParams.get("number") || "01-XXX"
  const today = new Date()
  const fullFloor = tenant.fullFloors?.[0]
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const primarySpace = assignedSpaces[0] ?? null
  const tenantBuildingId = primarySpace?.floor.buildingId ?? fullFloor?.buildingId
  const building = tenantBuildingId
    ? await db.building.findFirst({
        where: { id: tenantBuildingId, isActive: true, organizationId: orgId },
      })
    : await db.building.findFirst({
        where: { isActive: true, organizationId: orgId },
      })
  const monthlyRent = calculateTenantMonthlyRent(tenant)
  const ratePerSqm = calculateTenantRatePerSqm(tenant) ?? 0
  const start = tenant.contractStart ?? today
  const end = tenant.contractEnd ?? new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1)
  const placement = fullFloor?.name
    ?? (assignedSpaces.length > 0
      ? assignedSpaces.map((space) => `${space.floor.name}, кабинет ${space.number}`).join("; ")
      : "по договору")
  const area = fullFloor?.totalArea ?? assignedSpaces.reduce((sum, space) => sum + space.area, 0)
  const objectAddress = building?.address ?? BUILDING_DEFAULT.address
  const tenantBasis = inferTenantBasis(tenant)
  const rentWords = numberToWords(monthlyRent)
  const rentWithWords = `${formatMoney(monthlyRent)} (${rentWords})`
  const rentClause = buildLeaseRentClause({
    tenant,
    area,
    placement,
    fullFloorName: fullFloor?.name,
    monthlyRent,
    ratePerSqm,
  })
  const startDate = start.toLocaleDateString("ru-RU")
  const endDate = end.toLocaleDateString("ru-RU")
  const contractDate = today.toLocaleDateString("ru-RU")

  const customTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "CONTRACT", isActive: true },
    orderBy: { uploadedAt: "desc" },
  }).catch(() => null)

  if (customTemplate) {
    const data: Record<string, string | number> = {
      contract_number: contractNumber,
      contract_date: contractDate,
      contract_date_long: fmtDate(today),
      contract_start: startDate,
      contract_end: endDate,
      start_date: startDate,
      end_date: endDate,
      start_date_long: fmtDate(start),
      end_date_long: fmtDate(end),

      landlord_name: landlord.fullName,
      landlord_short: landlord.shortName,
      landlord_director: landlord.director,
      landlord_iin: landlord.iin,
      landlord_bin: landlord.bin || landlord.taxId,
      landlord_basis: landlord.basis,
      landlord_address: landlord.legalAddress,
      landlord_bank: landlord.bank,
      landlord_iik: landlord.iik,
      landlord_bik: landlord.bik,

      tenant_name: tenant.companyName,
      tenant_legal_type: tenant.legalType,
      tenant_director: tenant.directorName ?? tenant.user.name,
      tenant_director_short: shortName(tenant.directorName ?? tenant.user.name),
      tenant_position: tenant.directorPosition ?? "",
      tenant_basis: tenantBasis,
      tenant_basis_document: tenantBasis,
      tenant_bin: tenant.bin ?? tenant.iin ?? "",
      tenant_iin: tenant.iin ?? "",
      tenant_address: tenant.legalAddress ?? "",
      tenant_actual_address: tenant.actualAddress ?? "",
      tenant_phone: tenant.user.phone ?? "",
      tenant_email: tenant.user.email ?? "",
      tenant_bank: tenant.bankName ?? "",
      tenant_iik: tenant.iik ?? "",
      tenant_bik: tenant.bik ?? "",

      placement,
      space_number: assignedSpaces.map((space) => space.number).join(", "),
      floor_name: [...new Set(assignedSpaces.map((space) => space.floor.name))].join(", "),
      area,
      area_num: area,
      area_str: `${formatArea(area)} м²`,
      space_area: formatArea(area),

      monthly_rent: formatMoney(monthlyRent),
      monthly_rent_num: monthlyRent,
      monthly_rent_words: rentWords,
      monthly_rent_with_words: rentWithWords,
      rent_in_words: rentWords,
      rate_per_sqm: formatMoney(ratePerSqm),
      rate_per_sqm_num: ratePerSqm,
      rent_clause: rentClause,
      rent_terms_clause: rentClause,
      rent_basis: getLeaseRentBasisLabel(tenant),
      payment_due_day: tenant.paymentDueDay ?? 10,
      penalty_percent: tenant.penaltyPercent ?? 1,

      prolongation_clause: LEASE_PROLONGATION_CLAUSE,
      contract_prolongation_clause: LEASE_PROLONGATION_CLAUSE,
      esf_clause: LEASE_ESF_CLAUSE,
      invoice_clause: LEASE_ESF_CLAUSE,
      additional_services_clause: LEASE_ADDITIONAL_SERVICES_CLAUSE,
      utilities_clause: UTILITIES_CLAUSE,
      signage_clause: SIGNAGE_CLAUSE,
      building_name: building?.name ?? "",
      building_address: objectAddress,
    }

    let bytes: Buffer
    try {
      const templateBytes = Buffer.from(customTemplate.fileBytes)
      if (customTemplate.format === "DOCX") {
        const placeholders = extractDocxPlaceholders(templateBytes)
        bytes = placeholders.length > 0 ? renderDocx(templateBytes, data) : templateBytes
      } else if (customTemplate.format === "XLSX") {
        const placeholders = await extractXlsxPlaceholders(templateBytes)
        bytes = placeholders.length > 0 ? await renderXlsx(templateBytes, data) : templateBytes
      } else {
        bytes = templateBytes
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "render failed"
      return NextResponse.json({
        error: `Не удалось заполнить загруженный шаблон: ${msg}. Проверьте, что метки написаны в формате {tenant_name}, {monthly_rent_with_words}, {start_date}.`,
      }, { status: 500 })
    }

    try {
      await db.generatedDocument.create({
        data: {
          organizationId: orgId,
          documentType: "CONTRACT",
          number: contractNumber,
          tenantId: tenant.id,
          tenantName: tenant.companyName,
          totalAmount: monthlyRent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fileBytes: bytes as any,
          fileName: `Договор_${contractNumber}_${tenant.companyName.replace(/[\\/:*?"<>|]/g, "_")}.${customTemplate.format.toLowerCase()}`,
          fileSize: bytes.length,
          format: customTemplate.format,
          generatedById: session.user.id,
          templateUsedId: customTemplate.id,
        },
      })
    } catch {}

    const ext = customTemplate.format === "DOCX" ? "docx" : customTemplate.format === "XLSX" ? "xlsx" : "pdf"
    const mime = customTemplate.format === "DOCX"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : customTemplate.format === "XLSX"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf"
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="contract_${contractNumber}.${ext}"`,
        "Content-Length": String(bytes.length),
      },
    })
  }

  const p = (
    text: string,
    opts?: {
      bold?: boolean
      align?: (typeof AlignmentType)[keyof typeof AlignmentType]
      size?: number
      spaceAfter?: number
      indent?: boolean
    },
  ) => new Paragraph({
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

  const tenantName = tenant.companyName
  const tenantDir = tenant.directorName ?? tenant.user.name
  const tenantDirShort = shortName(tenantDir)

  const children = [
    center(`Договор № ${contractNumber} аренды нежилого помещения`),
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

    p(`${landlord.fullName}, именуемый в дальнейшем «Арендодатель», в лице руководителя ${landlord.directorShort}, действующего на основании ${landlord.basis}, с одной стороны, и ${tenantName}, именуемый(ое) в дальнейшем «Арендатор», в лице ${tenantDir}${tenant.directorPosition ? ` (${tenant.directorPosition})` : ""}, действующего на основании ${tenantBasis}, с другой стороны, заключили настоящий Договор аренды нежилого помещения о нижеследующем:`),

    heading("1. Предмет договора"),
    p(`1.1. Арендодатель обязуется передать, а Арендатор принять во временное владение и пользование (аренду) за плату на срок настоящего Договора нежилое помещение, расположенное по адресу: ${objectAddress}${placement ? `, ${placement}` : ""}, площадью ${formatArea(area)} кв.м., именуемое в дальнейшем «Помещение», в здании, принадлежащем Арендодателю на праве собственности.`),
    p(`1.2. ${UTILITIES_CLAUSE}`),
    p(`1.3. ${SIGNAGE_CLAUSE}`),

    heading("2. Срок аренды"),
    p(`2.1. Договор вступает в силу с ${fmtDate(start)} и действует по ${fmtDate(end)}.`),
    p(LEASE_PROLONGATION_CLAUSE),

    heading("3. Арендная плата и порядок расчётов"),
    p(rentClause),
    p(`3.2. Оплата производится не позднее ${tenant.paymentDueDay} числа каждого месяца на условиях предоплаты, независимо от фактического количества дней в месяце.`),
    p("3.3. Оплата производится путём перечисления на счёт Арендодателя, внесением наличных в кассу или иным согласованным способом."),
    p("3.4. Арендная плата подлежит ежегодной индексации с 1 января на величину официального уровня инфляции, публикуемого Национальным банком Республики Казахстан."),
    p(LEASE_ESF_CLAUSE),
    p(LEASE_ADDITIONAL_SERVICES_CLAUSE),

    heading("4. Права и обязанности Арендодателя"),
    p("4.1. Передать Помещение в трёхдневный срок с момента подписания настоящего договора по Акту приёма-передачи."),
    p("4.2. Производить капитальный ремонт Помещения и обеспечивать беспрепятственное пользование."),
    p("4.3. Своевременно выставлять счета на оплату с предоставлением счёта-фактуры и акта оказанных услуг."),

    heading("5. Права и обязанности Арендатора"),
    p("5.1. В 10-дневный срок с момента подписания принять Помещение."),
    p("5.2. Использовать Помещение по целевому назначению."),
    p("5.3. Своевременно производить арендные платежи."),
    p("5.4. Содержать Помещение в порядке, предусмотренном санитарными и противопожарными правилами."),
    p("5.5. Не осуществлять перестройку и перепланировку без письменного согласия Арендодателя."),
    p("5.6. Возвратить Помещение после прекращения договора в состоянии, пригодном для дальнейшего использования с учётом нормального износа."),

    heading("6. Ответственность сторон"),
    p(`6.1. В случае просрочки уплаты арендных платежей Арендатор обязан уплатить пеню в размере ${tenant.penaltyPercent}% от суммы долга за каждый день просрочки, но не более 10% от суммы Договора.`),

    heading("7. Прочие условия"),
    p("7.1. Споры разрешаются путём переговоров, в претензионном порядке, а впоследствии в суде."),
    p("7.2. Все изменения и дополнения действительны лишь в письменной форме при подписании обеими Сторонами."),
    p("7.3. Договор составлен на русском языке в двух экземплярах, имеющих одинаковую юридическую силу."),

    heading("8. Реквизиты сторон"),
    new Paragraph({ children: [new TextRun("")] }),
    requisitesTable(
      {
        title: "Арендодатель:",
        lines: [
          landlord.fullName,
          `Адрес: ${landlord.legalAddress}`,
          `${landlord.taxIdLabel}: ${landlord.taxId}`,
          `ИИК: ${landlord.iik}`,
          `БИК: ${landlord.bik}`,
          `Банк: ${landlord.bank}`,
        ],
        signature: landlord.directorShort,
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
  const safeTenant = tenantName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const safeNumber = contractNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
  const fileName = `Договор_${safeNumber}_${safeTenant}.docx`

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
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
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

type TenantBasisInput = {
  legalType?: string | null
  category?: string | null
  companyName?: string | null
  bin?: string | null
  iin?: string | null
}

const UTILITIES_CLAUSE = "Отопление, электроэнергия и водоснабжение предоставляются в рамках эксплуатации здания. За отдельную плату и/или по отдельному соглашению Арендодатель может предоставлять Арендатору телефонную линию, доступ в интернет и иные дополнительные услуги, которые не относятся к арендным платежам и оплачиваются Арендатором отдельно."

const SIGNAGE_CLAUSE = "По согласованию сторон Арендодатель может предоставить Арендатору место для размещения видеокамеры, наружной вывески для рекламы на фасаде здания арендуемого Помещения. Арендатор самостоятельно несёт ответственность за получение разрешения на размещение наружной рекламы и за осуществление платы за её размещение."

const MONTH = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
]

function fmtDate(d: Date) {
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTH[d.getMonth()]} ${d.getFullYear()} г.`
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u00a0\u202f]/g, " ")
}

function formatArea(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u00a0\u202f]/g, " ")
}

function inferTenantBasis(tenant: TenantBasisInput) {
  const legalType = (tenant.legalType ?? "").trim().toUpperCase()
  const name = `${tenant.companyName ?? ""} ${tenant.category ?? ""}`.toLowerCase()
  const id = tenant.bin ?? tenant.iin ?? ""
  const idText = id ? ` (БИН/ИИН ${id})` : ""

  if (name.includes("чси") || name.includes("судебн")) {
    return "государственной лицензии и регистрационных документов, подтверждающих статус частного судебного исполнителя"
  }

  if (legalType === "TOO" || legalType === "ТОО" || legalType === "AO" || legalType === "АО") {
    return "Устава"
  }

  if (legalType === "IP" || legalType === "ИП") {
    return `Уведомления о начале деятельности в качестве индивидуального предпринимателя${idText}`
  }

  if (legalType === "FIZ" || legalType === "PHYSICAL" || legalType === "INDIVIDUAL" || legalType === "ФИЗ") {
    return id ? `документа, удостоверяющего личность (ИИН ${id})` : "документа, удостоверяющего личность"
  }

  return id ? `регистрационных документов${idText}` : "регистрационных документов"
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

function numberToWords(value: number): string {
  const rounded = Math.trunc(Math.abs(value))
  if (rounded === 0) return "ноль"

  const groups = [
    { value: 1_000_000_000, forms: ["миллиард", "миллиарда", "миллиардов"] as const, gender: "male" as const },
    { value: 1_000_000, forms: ["миллион", "миллиона", "миллионов"] as const, gender: "male" as const },
    { value: 1_000, forms: ["тысяча", "тысячи", "тысяч"] as const, gender: "female" as const },
  ]
  let rest = rounded
  const parts: string[] = []

  for (const group of groups) {
    const chunk = Math.floor(rest / group.value)
    if (chunk > 0) {
      parts.push(`${chunkToWords(chunk, group.gender)} ${plural(chunk, group.forms)}`)
      rest %= group.value
    }
  }

  if (rest > 0) {
    parts.push(chunkToWords(rest, "male"))
  }

  return parts.join(" ")
}

function chunkToWords(value: number, gender: "male" | "female") {
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
  const maleOnes = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
  const femaleOnes = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]

  const words: string[] = []
  const h = Math.floor(value / 100)
  const t = Math.floor((value % 100) / 10)
  const o = value % 10

  if (h) words.push(hundreds[h])
  if (t === 1) {
    words.push(teens[o])
  } else {
    if (t) words.push(tens[t])
    if (o) words.push((gender === "female" ? femaleOnes : maleOnes)[o])
  }

  return words.join(" ")
}

function plural(value: number, forms: readonly [string, string, string]) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
