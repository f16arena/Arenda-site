// DOCX-рендер договора и приложений из ContractState (спецификация §11, Фаза 2).
// СЕРВЕРНЫЙ модуль (использует библиотеку `docx` + Buffer) — не импортировать в
// клиентский конструктор. Не зависит от старой системы DocumentTemplate.
//
// Структура текста договора берётся из assemble() (та же, что в предпросмотре и
// в renderContractText), поэтому DOCX и подписываемая строка консистентны.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
  ImageRun,
} from "docx"
import QRCode from "qrcode"

import { type ContractState, type Party } from "./schema"
import { assemble } from "./assemble"
import { deriveContext } from "./derive"
import { partyIntro } from "./parties"
import { money, dateLong } from "./numerals"

// ───────────────────────── helpers ─────────────────────────

// Заголовки рисуем явным чёрным жирным текстом (а не HeadingLevel) — иначе Word
// применяет тему стилей и красит заголовки в синий.
function h1(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: 28, color: "000000" })], alignment: AlignmentType.CENTER, spacing: { after: 120 } })
}

function h2(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: 26, color: "000000" })], spacing: { before: 200, after: 80 } })
}

function para(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)], alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 } })
}

/** Нумерованный пункт: жирный номер + (опц.) жирный подзаголовок + текст. */
function clausePara(num: string, html: string, sub?: string, indent = 0): Paragraph {
  const runs: TextRun[] = [new TextRun({ text: `${num}. `, bold: true })]
  if (sub) runs.push(new TextRun({ text: `${sub} `, bold: true }))
  runs.push(new TextRun(html))
  return new Paragraph({ children: runs, alignment: AlignmentType.JUSTIFIED, spacing: { after: 70 }, indent: indent ? { left: indent } : undefined })
}

/** Штамп ЭЦП-подписи стороны (вместо строки «___ /ФИО/ М.П.»), если сторона подписала. */
export interface DocxSigner { name: string; taxId?: string; signedAt?: string; certSerial?: string; method?: string; tspTime?: string }
export type DocxSigners = { landlord?: DocxSigner; tenant?: DocxSigner }

function requisitesParagraphs(p: Party, stamp?: DocxSigner): Paragraph[] {
  const idLabel = p.type === "too" ? "БИН" : "ИИН"
  const lines = [
    p.name || "________",
    `Адрес: ${p.address || "________"}`,
    `${idLabel}: ${p.bin || p.iin || "________"}`,
    `ИИК: ${p.iik || "________"} · Банк: ${p.bank || "________"} · БИК: ${p.bik || "________"}`,
  ]
  if (p.phone) lines.push(`Тел.: ${p.phone}`)
  if (p.email) lines.push(`E-mail: ${p.email}`)
  lines.push(`Основание: ${p.basis || "________"}`)
  lines.push("")
  const paras = lines.map((l) => new Paragraph({ children: [new TextRun({ text: l, size: 20 })], spacing: { after: 30 } }))
  if (stamp) {
    // Подписано ЭЦП — штамп вместо рукописной строки.
    paras.push(new Paragraph({ children: [new TextRun({ text: "✔ " + (stamp.method ?? "Документ подписан ЭЦП (НУЦ РК)"), bold: true, size: 18, color: "1A7F37" })], spacing: { after: 16 } }))
    paras.push(new Paragraph({ children: [new TextRun({ text: `${stamp.name}${stamp.taxId ? `, ИИН/БИН ${stamp.taxId}` : ""}`, size: 16, color: "444444" })], spacing: { after: 8 } }))
    if (stamp.signedAt) paras.push(new Paragraph({ children: [new TextRun({ text: `Время подписания: ${stamp.signedAt}`, size: 16, color: "444444" })], spacing: { after: 8 } }))
    if (stamp.tspTime) paras.push(new Paragraph({ children: [new TextRun({ text: `Метка времени (TSP, НУЦ РК): ${stamp.tspTime}`, size: 16, color: "444444" })], spacing: { after: 8 } }))
    if (stamp.certSerial) paras.push(new Paragraph({ children: [new TextRun({ text: `Сертификат №: ${stamp.certSerial}`, size: 16, color: "444444" })] }))
  } else {
    paras.push(new Paragraph({ children: [new TextRun({ text: "_______________ /" + (p.signatory || "________") + "/ М.П.", size: 20 })] }))
  }
  return paras
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }

const thin = { style: BorderStyle.SINGLE, size: 4, color: "999999" }
const thinBorders = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin }

/**
 * Блок «Отметка о подписании ЭЦП (НУЦ РК)» на странице подписей (§17.4 ТЗ).
 * `qr` — PNG-буфер QR-кода со ссылкой на страницу проверки (`/verify/{id}`);
 * если его нет (черновик/предпросмотр) — рисуется зарезервированное место под QR.
 * Сам документ после подписания не перегенерируется (§17.6) — QR/штамп ставятся
 * один раз на финальном PDF.
 */
function signingMark(qr: Buffer | null, verifyUrl: string | null): (Paragraph | Table)[] {
  const qrCell = new TableCell({
    width: { size: 22, type: WidthType.PERCENTAGE },
    borders: thinBorders,
    children: qr
      ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: qr, transformation: { width: 104, height: 104 } })] })]
      : [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720, after: 720 }, children: [new TextRun({ text: "QR", color: "BBBBBB", size: 28, bold: true })] })],
  })
  const textCell = new TableCell({
    width: { size: 78, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      new Paragraph({ children: [new TextRun({ text: "Отметка о подписании ЭЦП (НУЦ РК)", bold: true, size: 20 })], spacing: { after: 40 } }),
      new Paragraph({
        children: [new TextRun({ text: verifyUrl ? `Проверка подлинности и статуса подписей: ${verifyUrl}` : "Проверка подлинности — по QR-коду: commrent.kz/verify/…", size: 20 })],
        spacing: { after: 40 },
      }),
      new Paragraph({ children: [new TextRun({ text: "После подписания здесь фиксируются подписанты (наименование, ИИН/БИН, серийный № сертификата) и время по метке доверенного времени (TSP).", size: 18, color: "666666" })] }),
    ],
  })
  return [
    new Paragraph({ text: "", spacing: { before: 160 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...thinBorders, insideVertical: noBorder }, rows: [new TableRow({ children: [qrCell, textCell] })] }),
  ]
}

/** Подписи сторон + отметка ЭЦП/QR — ставится после каждого блока реквизитов (договор и каждое приложение). */
function requisitesBlock(s: ContractState, qr: Buffer | null, verifyUrl: string | null, signers?: DocxSigners): (Paragraph | Table)[] {
  return [signatureTable(s, signers), ...signingMark(qr, verifyUrl)]
}

function signatureTable(s: ContractState, signers?: DocxSigners): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "АРЕНДОДАТЕЛЬ:", bold: true })] }), ...requisitesParagraphs(s.landlord, signers?.landlord)] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "АРЕНДАТОР:", bold: true })] }), ...requisitesParagraphs(s.tenant, signers?.tenant)] }),
        ],
      }),
    ],
  })
}

function metaTable(city: string, dateIso: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph(city)] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({ text: dateLong(dateIso), alignment: AlignmentType.RIGHT })] }),
        ],
      }),
    ],
  })
}

function kvRow(k: string, v: string): TableRow {
  return new TableRow({ children: [new TableCell({ children: [new Paragraph(k)] }), new TableCell({ children: [new Paragraph(v)] })] })
}

// ───────────────────────── contract body ─────────────────────────

function contractChildren(s: ContractState, qr: Buffer | null, verifyUrl: string | null, signers?: DocxSigners): (Paragraph | Table)[] {
  const a = assemble(s)
  const out: (Paragraph | Table)[] = []
  out.push(h1(`ДОГОВОР № ${s.meta.contractNumber || "____"}`))
  out.push(new Paragraph({ text: "аренды нежилого помещения", alignment: AlignmentType.CENTER, spacing: { after: 120 } }))
  out.push(metaTable(s.meta.city, s.meta.contractDate))
  out.push(para(`${partyIntro(s.landlord, "Арендодатель")}, с одной стороны, и ${partyIntro(s.tenant, "Арендатор")}, с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:`))

  for (const sec of a.sections) {
    out.push(h2(`${sec.num}. ${sec.title}`))
    for (const it of sec.items) {
      out.push(clausePara(it.num, it.html, it.sub))
      for (const k of it.children) out.push(clausePara(k.num, k.html, undefined, 360))
    }
  }
  out.push(h2(`${a.requisitesNum}. Реквизиты и подписи Сторон`))
  out.push(...requisitesBlock(s, qr, verifyUrl, signers))
  return out
}

// ───────────────────────── annexes ─────────────────────────

function annex1Act(s: ContractState, qr: Buffer | null, verifyUrl: string | null, signers: DocxSigners | undefined, annexNo: number): (Paragraph | Table)[] {
  const p = s.premises
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № ${annexNo} к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
  out.push(h1("АКТ"))
  out.push(new Paragraph({ text: "приёма-передачи нежилого помещения", alignment: AlignmentType.CENTER, spacing: { after: 120 } }))
  out.push(metaTable(s.meta.city, s.meta.contractDate))
  out.push(para(`${s.landlord.name || "Арендодатель"} (Арендодатель) и ${s.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:`))
  out.push(para(`1. Арендодатель передал, а Арендатор принял нежилое помещение по адресу: ${p.buildingAddress || "________"}${p.placement ? ", " + p.placement : ""}, общей площадью ${p.spaceAreaSqm || "____"} кв. м.`))
  const h = s.handoverAct ?? {
    conditionWalls: "", conditionFloor: "", conditionCeiling: "", conditionWindowsDoors: "",
    conditionElectrical: "", conditionPlumbing: "", conditionOther: "",
    keysCount: "", meterElectricity: "", meterColdWater: "", meterHotWater: "",
  }
  const fill = (v: string, blank = "____________________________") => (v && v.trim() ? v.trim() : blank)
  out.push(para("2. Состояние Помещения на момент передачи:"))
  const conditions: [string, string][] = [
    ["стены", h.conditionWalls], ["пол", h.conditionFloor], ["потолок", h.conditionCeiling],
    ["окна, двери", h.conditionWindowsDoors], ["электропроводка, освещение", h.conditionElectrical],
    ["сантехника, отопление", h.conditionPlumbing], ["иное", h.conditionOther],
  ]
  for (const [label, value] of conditions) {
    out.push(new Paragraph({ children: [new TextRun(`— ${label}: ${fill(value)}`)], indent: { left: 360 }, spacing: { after: 30 } }))
  }
  out.push(para(`3. Показания счётчиков: электроэнергия ${fill(h.meterElectricity, "________")} кВт·ч; холодная вода ${fill(h.meterColdWater, "________")} куб. м; горячая вода ${fill(h.meterHotWater, "________")} куб. м.`))
  out.push(para(`4. Передаваемые ключи: ${fill(h.keysCount, "____")} комплектов.`))
  out.push(para("5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет."))
  out.push(...requisitesBlock(s, qr, verifyUrl, signers))
  return out
}

function annex2Services(s: ContractState, qr: Buffer | null, verifyUrl: string | null, signers: DocxSigners | undefined, annexNo: number): (Paragraph | Table)[] {
  const sv = s.financials.additionalServices
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № ${annexNo} к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
  out.push(h1("ЗАЯВЛЕНИЕ"))
  out.push(new Paragraph({ text: "на дополнительные услуги", alignment: AlignmentType.CENTER, spacing: { after: 120 } }))
  out.push(para(`Арендатор: ${s.tenant.name || "________"}. Помещение: ${s.premises.buildingAddress || "________"}, ${s.premises.spaceAreaSqm || "____"} кв. м.`))
  out.push(para("Арендатор поручает Арендодателю оказание следующих услуг:"))
  const rows: [string, boolean, string][] = [
    ["Уборка внутри Помещения", sv.premisesCleaning.ordered, sv.premisesCleaning.ratePerSqm ? money(sv.premisesCleaning.ratePerSqm) + " за 1 кв. м/мес" : "____ за 1 кв. м/мес"],
    ["Стационарная телефонная линия", sv.phone.ordered, "по тарифам оператора"],
    ["Доступ в интернет (Wi-Fi)", sv.internet.ordered, sv.internet.monthly ? money(sv.internet.monthly) + "/мес" : "____/мес"],
    ["Охрана помещения (тревожная кнопка / пульт)", sv.premisesSecurity.ordered, sv.premisesSecurity.monthly ? money(sv.premisesSecurity.monthly) + "/мес" : "____/мес"],
  ]
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: ["№", "Услуга", "Тариф / стоимость", "Заказ"].map((t) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })] })) }),
        ...rows.map((r, i) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(i + 1))] }),
              new TableCell({ children: [new Paragraph(r[0])] }),
              new TableCell({ children: [new Paragraph(r[2])] }),
              new TableCell({ children: [new Paragraph({ text: r[1] ? "✓" : "☐", alignment: AlignmentType.CENTER })] }),
            ],
          }),
        ),
      ],
    }),
  )
  out.push(para("Стоимость услуг оплачивается ежемесячно одновременно с арендной платой отдельной строкой счёта. Состав услуг может быть изменён уведомлением за 15 календарных дней."))
  out.push(...requisitesBlock(s, qr, verifyUrl, signers))
  return out
}

function annex3OperatingCosts(s: ContractState, qr: Buffer | null, verifyUrl: string | null, signers: DocxSigners | undefined, annexNo: number): (Paragraph | Table)[] {
  const f = s.financials
  const op = f.operatingCosts
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № ${annexNo} к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
  out.push(h1("РАСЧЁТ"))
  out.push(new Paragraph({ text: "эксплуатационных расходов", alignment: AlignmentType.CENTER, spacing: { after: 120 } }))

  if (op.method === "fixed_per_sqm") {
    const area = s.premises.spaceAreaSqm || 0
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          kvRow("Площадь Помещения", `${s.premises.spaceAreaSqm || "____"} кв. м`),
          kvRow("Тариф (окт–апр)", `${money(op.fixed?.winterRate ?? 0)} за 1 кв. м/мес`),
          kvRow("Тариф (май–сен)", `${money(op.fixed?.summerRate ?? 0)} за 1 кв. м/мес`),
          kvRow("Расходы в месяц (окт–апр)", money((op.fixed?.winterRate ?? 0) * area)),
          kvRow("Расходы в месяц (май–сен)", money((op.fixed?.summerRate ?? 0) * area)),
        ],
      }),
    )
  } else {
    out.push(new Paragraph({ children: [new TextRun({ text: "Формула долевого расчёта: ", bold: true }), new TextRun("ЭР = (Сумма фактических расходов здания за расчётный период ÷ Общая арендуемая площадь здания) × Площадь Помещения.")], alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 } }))
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          kvRow("Общая арендуемая площадь здания", `${s.building.totalRentableAreaSqm || "____"} кв. м`),
          kvRow("Площадь Помещения", `${s.premises.spaceAreaSqm || "____"} кв. м`),
          kvRow("Авансовая ставка", op.pooled?.estimatedRatePerSqm ? `${money(op.pooled.estimatedRatePerSqm)} за 1 кв. м/мес` : "—"),
        ],
      }),
    )
    out.push(para("Перерасчёт по фактическим расходам производится в порядке и сроки, установленные п. 3 Договора; разница подлежит доплате/возврату."))
  }

  const c = deriveContext(s)
  out.push(para("Эксплуатационные расходы покрывают: " + c.covers.join("; ") + "."))
  out.push(...requisitesBlock(s, qr, verifyUrl, signers))
  return out
}

// ───────────────────────── entry ─────────────────────────

/**
 * Собирает DOCX договора + включённых приложений. Возвращает Buffer.
 * `opts.verifyUrl` — ссылка на страницу проверки ЭЦП (`/verify/{id}`): если задана,
 * на странице подписей рисуется реальный QR-код; иначе — зарезервированное место под него.
 */
export async function renderContractDocx(s: ContractState, opts?: { verifyUrl?: string; signers?: DocxSigners }): Promise<Buffer> {
  const verifyUrl = opts?.verifyUrl ?? null
  const signers = opts?.signers
  const qr = verifyUrl ? await QRCode.toBuffer(verifyUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" }) : null
  const c = deriveContext(s)
  const children: (Paragraph | Table)[] = [...contractChildren(s, qr, verifyUrl, signers)]

  if (c.annexes.act) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex1Act(s, qr, verifyUrl, signers, c.annexNumbers.act))
  }
  if (c.annexes.services) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex2Services(s, qr, verifyUrl, signers, c.annexNumbers.services))
  }
  if (c.annexes.operatingCosts) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex3OperatingCosts(s, qr, verifyUrl, signers, c.annexNumbers.operatingCosts))
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [
      {
        // Поля как принято в РК-документах: левое 30мм, правое 15мм, верх/низ 20мм (в twips).
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
