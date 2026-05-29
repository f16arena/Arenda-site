// DOCX-рендер АВР по гос-форме Р-1 (Приложение 50 к приказу Минфина РК от
// 20.12.2012 № 562). СЕРВЕРНЫЙ модуль (docx + Buffer) — не импортировать в клиент.
// Структура данных та же, что в renderAvrText и предпросмотре → консистентность.

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
  ImageRun,
  VerticalAlign,
} from "docx"
import QRCode from "qrcode"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import { type AvrState, itemSum, avrSubtotal, avrVat, avrTotal, periodLabel } from "./schema"

// ───────────────────────── helpers ─────────────────────────

const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" }
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin }
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }
const thinGrey = { style: BorderStyle.SINGLE, size: 4, color: "999999" }
const markBorders = { top: thinGrey, bottom: thinGrey, left: thinGrey, right: thinGrey, insideHorizontal: thinGrey, insideVertical: noBorder }

function txt(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 20, color: opts.color })
}
function pr(runs: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, after = 40): Paragraph {
  return new Paragraph({ children: runs, alignment: align, spacing: { after } })
}
function note(text: string): Paragraph {
  return new Paragraph({ children: [txt(text, { italics: true, size: 16, color: "666666" })], spacing: { after: 60 } })
}

function tableCell(text: string, widthPct: number, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number } = {}): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: opts.align ?? AlignmentType.LEFT, children: [txt(text, { bold: opts.bold, size: opts.size ?? 18 })] })],
  })
}

const COLS = [4, 24, 10, 14, 8, 10, 14, 16] // суммируется в 100
const HEADERS = [
  "Номер по порядку",
  "Наименование работ (услуг)",
  "Дата выполнения работ (оказания услуг)",
  "Сведения об отчёте (дата, номер, кол-во страниц)",
  "Единица измерения",
  "Количество",
  "Цена за единицу",
  "Стоимость",
]

function itemsTable(s: AvrState): Table {
  const rows: TableRow[] = []
  rows.push(new TableRow({ tableHeader: true, children: HEADERS.map((h, i) => tableCell(h, COLS[i], { bold: true, align: AlignmentType.CENTER })) }))
  rows.push(new TableRow({ children: ["1", "2", "3", "4", "5", "6", "7", "8"].map((n, i) => tableCell(n, COLS[i], { align: AlignmentType.CENTER, size: 16 })) }))
  s.items.forEach((it, idx) => {
    rows.push(
      new TableRow({
        children: [
          tableCell(String(idx + 1), COLS[0], { align: AlignmentType.CENTER }),
          tableCell(it.name || "", COLS[1]),
          tableCell(it.date || "", COLS[2], { align: AlignmentType.CENTER }),
          tableCell(it.report || "", COLS[3]),
          tableCell(it.unit || "", COLS[4], { align: AlignmentType.CENTER }),
          tableCell(String(it.qty ?? ""), COLS[5], { align: AlignmentType.CENTER }),
          tableCell(money(it.price), COLS[6], { align: AlignmentType.RIGHT }),
          tableCell(money(itemSum(it)), COLS[7], { align: AlignmentType.RIGHT }),
        ],
      }),
    )
  })
  // Итого
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: COLS[0] + COLS[1] + COLS[2] + COLS[3] + COLS[4] + COLS[5], type: WidthType.PERCENTAGE },
          borders: cellBorders,
          columnSpan: 6,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Итого", { bold: true })] })],
        }),
        tableCell("х", COLS[6], { align: AlignmentType.CENTER }),
        tableCell(money(avrSubtotal(s)), COLS[7], { bold: true, align: AlignmentType.RIGHT }),
      ],
    }),
  )
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

/** Подпись стороны: должность / подпись / расшифровка. */
function signCell(role: string, party: { signatory: string; position: string }): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      pr([txt(role, { bold: true })], AlignmentType.LEFT, 120),
      pr([txt("_______________ / _______________ / _______________", { size: 18 })], AlignmentType.LEFT, 20),
      pr([txt("    должность              подпись          расшифровка подписи", { size: 14, color: "666666" })], AlignmentType.LEFT, 60),
      pr([txt(`${party.position || ""}${party.signatory ? `, ${party.signatory}` : ""}`, { size: 18 })], AlignmentType.LEFT, 80),
      pr([txt("М.П.", { size: 18 })], AlignmentType.LEFT, 0),
    ],
  })
}

/** Отметка о подписании ЭЦП + QR (как в договоре): реальный QR при verifyUrl, иначе место под него. */
function signingMark(qr: Buffer | null, verifyUrl: string | null): Table {
  const qrCell = new TableCell({
    width: { size: 22, type: WidthType.PERCENTAGE },
    borders: { top: thinGrey, bottom: thinGrey, left: thinGrey, right: thinGrey },
    verticalAlign: VerticalAlign.CENTER,
    children: qr
      ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: qr, transformation: { width: 96, height: 96 } })] })]
      : [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 640, after: 640 }, children: [txt("QR", { bold: true, size: 28, color: "BBBBBB" })] })],
  })
  const textCell = new TableCell({
    width: { size: 78, type: WidthType.PERCENTAGE },
    borders: { top: thinGrey, bottom: thinGrey, left: noBorder, right: thinGrey },
    children: [
      pr([txt("Отметка о подписании ЭЦП (НУЦ РК)", { bold: true })], AlignmentType.LEFT, 40),
      pr([txt(verifyUrl ? `Проверка подлинности: ${verifyUrl}` : "Проверка подлинности — по QR-коду: commrent.kz/verify/…", { size: 20 })], AlignmentType.LEFT, 40),
      pr([txt("После подписания здесь фиксируются подписанты (наименование, ИИН/БИН, серийный № сертификата) и время по метке доверенного времени (TSP).", { size: 16, color: "666666" })]),
    ],
  })
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: markBorders, rows: [new TableRow({ children: [qrCell, textCell] })] })
}

// ───────────────────────── entry ─────────────────────────

export async function renderAvrDocx(s: AvrState, opts?: { verifyUrl?: string }): Promise<Buffer> {
  const verifyUrl = opts?.verifyUrl ?? null
  const qr = verifyUrl ? await QRCode.toBuffer(verifyUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" }) : null

  const children: (Paragraph | Table)[] = []
  // Шапка формы (справа)
  for (const line of ["Приложение 50", "к приказу Министра финансов", "Республики Казахстан", "от 20 декабря 2012 года № 562"]) {
    children.push(pr([txt(line, { size: 16 })], AlignmentType.RIGHT, 0))
  }
  children.push(pr([txt("Форма Р-1", { bold: true, size: 20 })], AlignmentType.RIGHT, 120))

  // Стороны
  children.push(pr([txt("Заказчик: ", { bold: true }), txt([s.customer.name, s.customer.address, s.customer.comm].filter(Boolean).join(", ") || "—")]))
  children.push(note("полное наименование, адрес, данные о средствах связи"))
  children.push(pr([txt("Исполнитель: ", { bold: true }), txt([s.executor.name, s.executor.address, s.executor.comm].filter(Boolean).join(", ") || "—")]))
  children.push(note("полное наименование, адрес, данные о средствах связи"))
  children.push(pr([txt("ИИН/БИН Исполнителя: ", { bold: true }), txt(s.executor.binIin || "—"), txt("    ИИН/БИН Заказчика: ", { bold: true }), txt(s.customer.binIin || "—")], AlignmentType.LEFT, 120))

  // Договор / номер / дата
  children.push(
    pr(
      [
        txt("Договор (контракт): ", { bold: true }),
        txt(`№ ${s.contractRef.number || "—"}${s.contractRef.date ? ` от ${dateLong(s.contractRef.date)}` : ""}`),
        txt("     Номер документа: ", { bold: true }),
        txt(s.meta.number || "—"),
        txt("     Дата составления: ", { bold: true }),
        txt(s.meta.date ? dateLong(s.meta.date) : "—"),
      ],
      AlignmentType.LEFT,
      160,
    ),
  )

  // Заголовок
  children.push(pr([txt("АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)", { bold: true, size: 24 })], AlignmentType.CENTER, 60))
  children.push(pr([txt(`за ${periodLabel(s.period)}`, { size: 20 })], AlignmentType.CENTER, 160))

  // Таблица позиций
  children.push(itemsTable(s))

  // Итоги
  children.push(pr([txt("", { size: 20 })], AlignmentType.LEFT, 80))
  if (s.vat.enabled) children.push(pr([txt(`в т.ч. НДС ${s.vat.rate}%: ${money(avrVat(s))} тенге`)], AlignmentType.LEFT, 40))
  else children.push(pr([txt("Без НДС (Исполнитель не является плательщиком НДС).")], AlignmentType.LEFT, 40))
  children.push(pr([txt(`Всего на сумму: ${moneyWithWords(avrTotal(s))}.`, { bold: true })], AlignmentType.LEFT, 120))

  // Запасы / приложение
  children.push(pr([txt("Сведения об использовании запасов, полученных от заказчика: ", { bold: true }), txt(s.stocks || "не использовались")], AlignmentType.LEFT, 40))
  children.push(pr([txt("Приложение: перечень документации на ", {}), txt(String(s.attachmentPages || 0), { bold: true }), txt(" страниц(е/ах) (при наличии).")], AlignmentType.LEFT, 60))
  children.push(pr([txt("Работы (услуги) выполнены в полном объёме и в установленные сроки. Стороны претензий друг к другу не имеют.")], AlignmentType.LEFT, 200))

  // Подписи
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [signCell("Сдал (Исполнитель):", s.executor), signCell("Принял (Заказчик):", s.customer)] })] }))
  children.push(pr([txt("Дата подписания (принятия) работ (услуг): ____________________")], AlignmentType.LEFT, 160))

  // QR/ЭЦП
  children.push(signingMark(qr, verifyUrl))

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 850 } } },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
