// Общие хелперы для генерации DOCX-документов
import {
  Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeightRule,
} from "docx"

export type AlignType = typeof AlignmentType[keyof typeof AlignmentType]

export const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
export const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "999999" }

export function p(text: string, opts?: {
  bold?: boolean
  align?: AlignType
  size?: number
  spaceAfter?: number
  indent?: boolean
}) {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts?.spaceAfter ?? 100 },
    indent: opts?.indent !== false ? { firstLine: 567 } : undefined,
    children: [new TextRun({ text, bold: opts?.bold, size: opts?.size ?? 22 })],
  })
}

export function center(text: string, opts?: { bold?: boolean; size?: number }) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: opts?.bold ?? true, size: opts?.size ?? 24 })],
  })
}

export function heading(text: string) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22 })],
  })
}

export function row(cells: string[], opts?: { bold?: boolean; align?: AlignType[]; widths?: number[] }) {
  return new TableRow({
    children: cells.map((c, i) => new TableCell({
      width: { size: opts?.widths?.[i] ?? Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        alignment: opts?.align?.[i] ?? AlignmentType.LEFT,
        children: [new TextRun({ text: c, bold: opts?.bold, size: 20 })],
      })],
    })),
  })
}

export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU")
}

export function fmtDate(d: Date): string {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"]
  return `«${String(d.getDate()).padStart(2, "0")}» ${months[d.getMonth()]} ${d.getFullYear()} г.`
}

export function periodLabel(period: string): string {
  // YYYY-MM → "Апрель 2026"
  const [y, m] = period.split("-")
  const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
  return `${months[parseInt(m) - 1]} ${y}`
}

export function numberToWords(n: number): string {
  // Простая реализация для рублей/тенге (тысячи и миллионы)
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000)
    const rest = Math.floor((n % 1_000_000) / 1000)
    const mStr = `${m} миллион${m === 1 ? "" : m < 5 ? "а" : "ов"}`
    return rest > 0 ? `${mStr} ${rest} тысяч` : mStr
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000)
    return `${k} тысяч${k === 1 ? "а" : k < 5 ? "и" : ""}`
  }
  return String(n)
}

export const tableNoBorders = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
}

export const tableThin = {
  top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER,
  insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
}

export { Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, HeightRule }
