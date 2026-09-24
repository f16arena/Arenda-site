import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getT } from "@/lib/i18n/server"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

// GET /api/import/tenants/template
// Возвращает .xlsx-шаблон с правильными колонками и примером данных.
//
// Шапка переводится, и это работает только потому, что казахские названия
// колонок перечислены в KK_FIELD_SYNONYMS (lib/excel-import.ts): при загрузке
// файла колонки сопоставляются по заголовку. Меняете шапку — правьте синонимы.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { t } = await getT()
  const wb = new ExcelJS.Workbook()
  wb.creator = "Commrent"
  const ws = wb.addWorksheet(t("adminDocs.export.template.sheet"))

  ws.columns = [
    { header: t("adminDocs.export.template.contactName"), key: "contactName", width: 28 },
    { header: t("adminDocs.export.template.phone"), key: "phone", width: 16 },
    { header: t("adminDocs.export.template.email"), key: "email", width: 24 },
    { header: t("adminDocs.export.template.companyName"), key: "companyName", width: 32 },
    { header: t("adminDocs.export.template.legalType"), key: "legalType", width: 18 },
    { header: t("adminDocs.export.template.taxId"), key: "bin", width: 16 },
    { header: t("adminDocs.export.template.category"), key: "category", width: 22 },
    { header: t("adminDocs.export.template.legalAddress"), key: "legalAddress", width: 30 },
    { header: t("adminDocs.export.template.directorName"), key: "directorName", width: 24 },
    { header: t("adminDocs.export.template.spaceNumber"), key: "spaceNumber", width: 12 },
    { header: t("adminDocs.export.template.rate"), key: "rate", width: 12 },
    { header: t("adminDocs.export.template.fixedRent"), key: "fixedMonthlyRent", width: 16 },
    { header: t("adminDocs.export.template.cleaningFee"), key: "cleaningFee", width: 12 },
    { header: t("adminDocs.export.template.startDate"), key: "contractStart", width: 14 },
    { header: t("adminDocs.export.template.endDate"), key: "contractEnd", width: 14 },
  ]

  // Стиль заголовков
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } }
  ws.getRow(1).alignment = { vertical: "middle" }
  ws.getRow(1).height = 32

  // Пример строк
  const examples = [
    {
      contactName: t("adminDocs.export.template.examples.name1"),
      phone: "+7 700 000 00 00",
      email: "ivan@example.kz",
      companyName: t("adminDocs.export.template.examples.company1"),
      legalType: t("adminDocs.export.template.examples.legalType1"),
      bin: "180340012345",
      category: t("adminDocs.export.template.examples.category1"),
      legalAddress: t("adminDocs.export.template.examples.address1"),
      directorName: t("adminDocs.export.template.examples.director1"),
      spaceNumber: "201",
      rate: 5000,
      fixedMonthlyRent: "",
      cleaningFee: 0,
      contractStart: "2026-01-01",
      contractEnd: "2027-01-01",
    },
    {
      contactName: t("adminDocs.export.template.examples.name2"),
      phone: "+7 701 111 22 33",
      email: "petrov@example.kz",
      companyName: t("adminDocs.export.template.examples.company2"),
      legalType: t("adminDocs.export.template.examples.legalType2"),
      bin: "850315300009",
      category: t("adminDocs.export.template.examples.category2"),
      legalAddress: "",
      directorName: "",
      spaceNumber: "101",
      rate: "",
      fixedMonthlyRent: 350000,
      cleaningFee: 10000,
      contractStart: "2026-02-01",
      contractEnd: "2027-02-01",
    },
    {
      contactName: t("adminDocs.export.template.examples.name3"),
      phone: "+7 702 222 33 44",
      email: "sidorov@example.kz",
      companyName: t("adminDocs.export.template.examples.company3"),
      legalType: t("adminDocs.export.template.examples.legalType3"),
      bin: "930510300006",
      category: t("adminDocs.export.template.examples.category3"),
      legalAddress: t("adminDocs.export.template.examples.address3"),
      directorName: t("adminDocs.export.template.examples.director3"),
      spaceNumber: "305",
      rate: "",
      fixedMonthlyRent: 450000,
      cleaningFee: 0,
      contractStart: "2026-03-01",
      contractEnd: "2027-03-01",
    },
  ]

  examples.forEach((row) => ws.addRow(row))

  // Подсветка примера
  for (let i = 2; i <= examples.length + 1; i++) {
    ws.getRow(i).font = { italic: true, color: { argb: "FF64748B" } }
  }

  // Лист с инструкциями. Словарь хранит строки одним текстом (массивов он не
  // держит) — здесь разбираем его обратно по переносам.
  const help = wb.addWorksheet(t("adminDocs.export.template.helpSheet"))
  help.columns = [{ key: "text", width: 100 }]
  const lines = t("adminDocs.export.template.instructions").split("\n")
  lines.forEach((line) => help.addRow({ text: line }))
  help.getRow(1).font = { bold: true, size: 14 }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = "commrent-tenants-template.xlsx"

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
