// DOCX-рендер акта сверки взаимных расчётов. СЕРВЕРНЫЙ модуль (docx + Buffer).

import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign,
} from "docx"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import { type ReconState, reconDebit, reconCredit, reconClosing } from "./schema"
import { reconPeriodLabel, fmtEntryDate } from "./render"

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

const COLS = [12, 50, 19, 19]
function cell(text: string, w: number, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; span?: number } = {}): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.span,
    children: [new Paragraph({ alignment: opts.align ?? AlignmentType.LEFT, children: [txt(text, { bold: opts.bold, size: 18 })] })],
  })
}

function ledgerTable(s: ReconState): Table {
  const rows: TableRow[] = []
  rows.push(new TableRow({ tableHeader: true, children: [
    cell("Дата", COLS[0], { bold: true, align: AlignmentType.CENTER }),
    cell("Операция", COLS[1], { bold: true, align: AlignmentType.CENTER }),
    cell("Дебет (начислено) ₸", COLS[2], { bold: true, align: AlignmentType.CENTER }),
    cell("Кредит (оплачено) ₸", COLS[3], { bold: true, align: AlignmentType.CENTER }),
  ] }))
  // Входящее сальдо строкой (в дебет/кредит по знаку)
  rows.push(new TableRow({ children: [
    new TableCell({ width: { size: COLS[0] + COLS[1], type: WidthType.PERCENTAGE }, borders: cellBorders, columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Входящее сальдо", { bold: true })] })] }),
    cell(s.openingBalance > 0 ? money(s.openingBalance) : "", COLS[2], { align: AlignmentType.RIGHT }),
    cell(s.openingBalance < 0 ? money(-s.openingBalance) : "", COLS[3], { align: AlignmentType.RIGHT }),
  ] }))
  for (const e of s.entries) {
    rows.push(new TableRow({ children: [
      cell(fmtEntryDate(e.date), COLS[0], { align: AlignmentType.CENTER }),
      cell(e.doc || "", COLS[1]),
      cell(e.debit ? money(e.debit) : "", COLS[2], { align: AlignmentType.RIGHT }),
      cell(e.credit ? money(e.credit) : "", COLS[3], { align: AlignmentType.RIGHT }),
    ] }))
  }
  rows.push(new TableRow({ children: [
    new TableCell({ width: { size: COLS[0] + COLS[1], type: WidthType.PERCENTAGE }, borders: cellBorders, columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Обороты за период", { bold: true })] })] }),
    cell(money(reconDebit(s)), COLS[2], { bold: true, align: AlignmentType.RIGHT }),
    cell(money(reconCredit(s)), COLS[3], { bold: true, align: AlignmentType.RIGHT }),
  ] }))
  const closing = reconClosing(s)
  rows.push(new TableRow({ children: [
    new TableCell({ width: { size: COLS[0] + COLS[1], type: WidthType.PERCENTAGE }, borders: cellBorders, columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Исходящее сальдо", { bold: true })] })] }),
    cell(closing > 0 ? money(closing) : "", COLS[2], { bold: true, align: AlignmentType.RIGHT }),
    cell(closing < 0 ? money(-closing) : "", COLS[3], { bold: true, align: AlignmentType.RIGHT }),
  ] }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function signCell(role: string, p: { name: string; signatory: string; position: string }): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      pr([txt(role, { bold: true })], AlignmentType.LEFT, 60),
      pr([txt(p.name || "—", { size: 18 })], AlignmentType.LEFT, 80),
      pr([txt(`${p.position || ""} ___________ / ${p.signatory || "________"} /`, { size: 18 })], AlignmentType.LEFT, 40),
      pr([txt("М.П.", { size: 18 })], AlignmentType.LEFT, 0),
    ],
  })
}

export async function renderReconDocx(s: ReconState): Promise<Buffer> {
  const closing = reconClosing(s)
  const children: (Paragraph | Table)[] = []
  children.push(pr([txt(`Акт сверки взаимных расчётов № ${s.meta.number || "____"}`, { bold: true, size: 26 })], AlignmentType.CENTER, 40))
  children.push(pr([txt(`за период ${reconPeriodLabel(s.period)}`, { size: 20 })], AlignmentType.CENTER, 120))
  children.push(pr([txt(`${s.org.name || "Арендодатель"} (ИИН/БИН ${s.org.binIin || "—"}), с одной стороны, и ${s.tenant.name || "Арендатор"} (ИИН/БИН ${s.tenant.binIin || "—"}), с другой стороны, составили настоящий акт о том, что состояние взаиморасчётов по данным сторон следующее:`)], AlignmentType.JUSTIFIED, 160))

  children.push(ledgerTable(s))

  children.push(pr([txt("", { size: 20 })], AlignmentType.LEFT, 100))
  if (closing > 0) children.push(pr([txt(`По состоянию на ${s.meta.date ? dateLong(s.meta.date) : "____"} задолженность в пользу ${s.org.name || "Арендодателя"} составляет ${moneyWithWords(closing)}.`, { bold: true })], AlignmentType.JUSTIFIED, 80))
  else if (closing < 0) children.push(pr([txt(`По состоянию на ${s.meta.date ? dateLong(s.meta.date) : "____"} переплата в пользу ${s.tenant.name || "Арендатора"} составляет ${moneyWithWords(-closing)}.`, { bold: true })], AlignmentType.JUSTIFIED, 80))
  else children.push(pr([txt("Взаимная задолженность сторон отсутствует.", { bold: true })], AlignmentType.JUSTIFIED, 80))
  children.push(pr([txt("Акт составлен в двух экземплярах, по одному для каждой стороны.")], AlignmentType.LEFT, 240))

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [signCell("От Арендодателя:", s.org), signCell("От Арендатора:", s.tenant)] })] }))

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 850 } } }, children }],
  })
  return Packer.toBuffer(doc)
}
