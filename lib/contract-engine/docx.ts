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
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
} from "docx"

import { type ContractState, type Party } from "./schema"
import { assemble } from "./assemble"
import { deriveContext } from "./derive"
import { partyIntro } from "./parties"
import { money, dateLong } from "./numerals"

// ───────────────────────── helpers ─────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 120 } })
}

function h2(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } })
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

function requisitesParagraphs(p: Party): Paragraph[] {
  const idLabel = p.type === "individual" ? "ИИН" : "БИН/ИИН"
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
  lines.push("_______________ /" + (p.signatory || "________") + "/ М.П.")
  return lines.map((l) => new Paragraph({ children: [new TextRun({ text: l, size: 20 })], spacing: { after: 30 } }))
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }

function signatureTable(s: ContractState): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "АРЕНДОДАТЕЛЬ:", bold: true })] }), ...requisitesParagraphs(s.landlord)] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "АРЕНДАТОР:", bold: true })] }), ...requisitesParagraphs(s.tenant)] }),
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

function contractChildren(s: ContractState): (Paragraph | Table)[] {
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
  out.push(signatureTable(s))
  return out
}

// ───────────────────────── annexes ─────────────────────────

function annex1Act(s: ContractState): (Paragraph | Table)[] {
  const p = s.premises
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № 1 к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
  out.push(h1("АКТ"))
  out.push(new Paragraph({ text: "приёма-передачи нежилого помещения", alignment: AlignmentType.CENTER, spacing: { after: 120 } }))
  out.push(metaTable(s.meta.city, s.meta.contractDate))
  out.push(para(`${s.landlord.name || "Арендодатель"} (Арендодатель) и ${s.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:`))
  out.push(para(`1. Арендодатель передал, а Арендатор принял нежилое помещение по адресу: ${p.buildingAddress || "________"}${p.placement ? ", " + p.placement : ""}, общей площадью ${p.spaceAreaSqm || "____"} кв. м.`))
  out.push(para("2. Состояние Помещения на момент передачи:"))
  for (const x of ["стены", "пол", "потолок", "окна, двери", "электропроводка, освещение", "сантехника, отопление", "иное"]) {
    out.push(new Paragraph({ children: [new TextRun(`— ${x}: ____________________________`)], indent: { left: 360 }, spacing: { after: 30 } }))
  }
  out.push(para("3. Показания счётчиков: электроэнергия ________ кВт·ч; холодная вода ________ куб. м; горячая вода ________ куб. м."))
  out.push(para("4. Передаваемые ключи: ____ комплектов."))
  out.push(para("5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет."))
  out.push(signatureTable(s))
  return out
}

function annex2Services(s: ContractState): (Paragraph | Table)[] {
  const sv = s.financials.additionalServices
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № 2 к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
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
  out.push(signatureTable(s))
  return out
}

function annex3OperatingCosts(s: ContractState): (Paragraph | Table)[] {
  const f = s.financials
  const op = f.operatingCosts
  const out: (Paragraph | Table)[] = []
  out.push(new Paragraph({ children: [new TextRun({ text: `Приложение № 3 к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`, italics: true, size: 20 })], alignment: AlignmentType.RIGHT }))
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
  out.push(signatureTable(s))
  return out
}

// ───────────────────────── entry ─────────────────────────

/** Собирает DOCX договора + включённых приложений. Возвращает Buffer. */
export async function renderContractDocx(s: ContractState): Promise<Buffer> {
  const c = deriveContext(s)
  const children: (Paragraph | Table)[] = [...contractChildren(s)]

  if (c.annexes.act) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex1Act(s))
  }
  if (c.annexes.services) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex2Services(s))
  }
  if (c.annexes.operatingCosts) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...annex3OperatingCosts(s))
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
