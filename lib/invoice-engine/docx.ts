// DOCX-рендер счёта на оплату из InvoiceState. СЕРВЕРНЫЙ модуль (docx + Buffer).
// Структура совпадает с renderInvoiceText и предпросмотром.

import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign,
} from "docx"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import { periodLabel } from "@/lib/avr-engine"
import { type InvoiceState, itemSum, invSubtotal, invVat, invTotal } from "./schema"

const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" }
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin }
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }

function txt(text: string, o: { bold?: boolean; size?: number } = {}): TextRun {
  return new TextRun({ text, bold: o.bold, size: o.size ?? 20 })
}
function pr(runs: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, after = 40): Paragraph {
  return new Paragraph({ children: runs, alignment: align, spacing: { after } })
}

const COLS = [5, 49, 10, 10, 12, 14]
function cell(text: string, w: number, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number } = {}): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: opts.align ?? AlignmentType.LEFT, children: [txt(text, { bold: opts.bold, size: opts.size ?? 18 })] })],
  })
}

function itemsTable(s: InvoiceState): Table {
  const rows: TableRow[] = []
  const head = ["№", "Наименование", "Кол-во", "Ед.", "Цена ₸", "Сумма ₸"]
  rows.push(new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, COLS[i], { bold: true, align: AlignmentType.CENTER })) }))
  s.items.forEach((it, idx) => {
    rows.push(new TableRow({ children: [
      cell(String(idx + 1), COLS[0], { align: AlignmentType.CENTER }),
      cell(it.name || "", COLS[1]),
      cell(String(it.qty ?? ""), COLS[2], { align: AlignmentType.CENTER }),
      cell(it.unit || "", COLS[3], { align: AlignmentType.CENTER }),
      cell(money(it.price), COLS[4], { align: AlignmentType.RIGHT }),
      cell(money(itemSum(it)), COLS[5], { align: AlignmentType.RIGHT }),
    ] }))
  })
  const totalRow = (label: string, value: string, bold = false): TableRow => new TableRow({ children: [
    new TableCell({ width: { size: COLS[0] + COLS[1] + COLS[2] + COLS[3] + COLS[4], type: WidthType.PERCENTAGE }, borders: cellBorders, columnSpan: 5, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(label, { bold })] })] }),
    cell(value, COLS[5], { bold, align: AlignmentType.RIGHT }),
  ] })
  rows.push(totalRow("Итого:", money(invSubtotal(s))))
  if (s.vat.enabled) rows.push(totalRow(`НДС ${s.vat.rate}%:`, money(invVat(s))))
  rows.push(totalRow("Всего к оплате:", money(invTotal(s)), true))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function partyCell(title: string, lines: string[]): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      pr([txt(title, { bold: true })], AlignmentType.LEFT, 60),
      ...lines.filter(Boolean).map((l) => pr([txt(l, { size: 18 })], AlignmentType.LEFT, 30)),
    ],
  })
}

export async function renderInvoiceDocx(s: InvoiceState): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []
  children.push(pr([txt(`Счёт на оплату № ${s.meta.number || "____"} от ${s.meta.date ? dateLong(s.meta.date) : "____"}`, { bold: true, size: 26 })], AlignmentType.CENTER, 80))
  if (s.contractRef.number) children.push(pr([txt(`По договору № ${s.contractRef.number}${s.contractRef.date ? ` от ${dateLong(s.contractRef.date)}` : ""}`)], AlignmentType.LEFT, 30))
  children.push(pr([txt(`Период: ${periodLabel(s.period)}${s.dueDate ? `    Оплатить до: ${dateLong(s.dueDate)}` : ""}`)], AlignmentType.LEFT, 160))

  // Поставщик / Получатель
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [new TableRow({ children: [
      partyCell("Поставщик:", [
        s.seller.name, s.seller.address ? `Адрес: ${s.seller.address}` : "", `ИИН/БИН: ${s.seller.binIin || "—"}`,
        `Банк: ${s.seller.bank || "—"}`, `ИИК: ${s.seller.iik || "—"}`, `БИК: ${s.seller.bik || "—"}`,
        s.seller.kbe ? `Кбе: ${s.seller.kbe}` : "", s.seller.knp ? `КНП: ${s.seller.knp}` : "",
      ]),
      partyCell("Получатель:", [
        s.buyer.name, s.buyer.address ? `Адрес: ${s.buyer.address}` : "", `ИИН/БИН: ${s.buyer.binIin || "—"}`,
        s.buyer.bank ? `Банк: ${s.buyer.bank}` : "", s.buyer.iik ? `ИИК: ${s.buyer.iik}` : "", s.buyer.bik ? `БИК: ${s.buyer.bik}` : "",
      ]),
    ] })],
  }))

  children.push(pr([txt("", { size: 20 })], AlignmentType.LEFT, 120))
  children.push(itemsTable(s))
  children.push(pr([txt("", { size: 20 })], AlignmentType.LEFT, 80))
  if (s.vat.enabled) children.push(pr([txt(`в т.ч. НДС ${s.vat.rate}%: ${money(invVat(s))} тенге`)], AlignmentType.LEFT, 40))
  else children.push(pr([txt("Без НДС (поставщик не плательщик НДС).")], AlignmentType.LEFT, 40))
  children.push(pr([txt(`Всего к оплате: ${moneyWithWords(invTotal(s))}.`, { bold: true })], AlignmentType.LEFT, 240))
  children.push(pr([txt(`${s.seller.signatoryPosition || "Поставщик"}: ___________________ / ${s.seller.signatory || "________"} /    М.П.`)], AlignmentType.LEFT, 0))

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 850 } } }, children }],
  })
  return Packer.toBuffer(doc)
}
