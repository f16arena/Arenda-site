import { NextResponse } from "next/server"
import { auth } from "@/auth"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

// GET /api/import/tenants/template
// Возвращает .xlsx-шаблон с правильными колонками и примером данных.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const wb = new ExcelJS.Workbook()
  wb.creator = "Commrent"
  const ws = wb.addWorksheet("Арендаторы")

  ws.columns = [
    { header: "ФИО контактного лица", key: "contactName", width: 28 },
    { header: "Телефон", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "Название компании", key: "companyName", width: 32 },
    { header: "Тип (ИП/ТОО/АО)", key: "legalType", width: 12 },
    { header: "БИН/ИИН (12 цифр)", key: "bin", width: 16 },
    { header: "Категория", key: "category", width: 22 },
    { header: "Юр. адрес", key: "legalAddress", width: 30 },
    { header: "Директор", key: "directorName", width: 24 },
    { header: "№ помещения", key: "spaceNumber", width: 12 },
    { header: "Ставка ₸/м²", key: "rate", width: 12 },
    { header: "Фикс. аренда ₸/мес", key: "fixedMonthlyRent", width: 16 },
    { header: "Уборка ₸/мес", key: "cleaningFee", width: 12 },
    { header: "Дата начала", key: "contractStart", width: 14 },
    { header: "Дата окончания", key: "contractEnd", width: 14 },
  ]

  // Стиль заголовков
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } }
  ws.getRow(1).alignment = { vertical: "middle" }
  ws.getRow(1).height = 32

  // Пример строк
  const examples = [
    {
      contactName: "Иванов Иван Иванович",
      phone: "+7 700 000 00 00",
      email: "ivan@example.kz",
      companyName: "ТОО \"Пример\"",
      legalType: "ТОО",
      bin: "180340012345",
      category: "IT-консалтинг",
      legalAddress: "г. Алматы, ул. Абая 150",
      directorName: "Иванов И.И.",
      spaceNumber: "201",
      rate: 5000,
      fixedMonthlyRent: "",
      cleaningFee: 0,
      contractStart: "2026-01-01",
      contractEnd: "2027-01-01",
    },
    {
      contactName: "Петров Пётр Петрович",
      phone: "+7 701 111 22 33",
      email: "petrov@example.kz",
      companyName: "ИП Петров",
      legalType: "ИП",
      bin: "850315300123",
      category: "Юр. услуги",
      legalAddress: "",
      directorName: "",
      spaceNumber: "101",
      rate: 4500,
      fixedMonthlyRent: 350000,
      cleaningFee: 10000,
      contractStart: "2026-02-01",
      contractEnd: "2027-02-01",
    },
  ]

  examples.forEach((row) => ws.addRow(row))

  // Подсветка примера
  for (let i = 2; i <= examples.length + 1; i++) {
    ws.getRow(i).font = { italic: true, color: { argb: "FF64748B" } }
  }

  // Лист с инструкциями
  const help = wb.addWorksheet("Инструкция")
  help.columns = [{ key: "text", width: 100 }]
  const lines = [
    "ШАБЛОН ИМПОРТА АРЕНДАТОРОВ — Commrent",
    "",
    "Заполните лист «Арендаторы» (первый лист). Удалите строки-примеры или замените их вашими данными.",
    "",
    "ОБЯЗАТЕЛЬНЫЕ КОЛОНКИ:",
    "  • Название компании — без него строка пропускается",
    "",
    "РЕКОМЕНДУЕМЫЕ:",
    "  • ФИО контактного лица — если не указано, используется название компании",
    "  • Телефон или Email — иначе арендатор не сможет войти в свой кабинет",
    "  • БИН/ИИН — 12 цифр, нужен для счетов-фактур и проверки на дубли",
    "",
    "ОПЦИОНАЛЬНЫЕ:",
    "  • № помещения — если указано, арендатор автоматически привяжется к помещению (помещение должно быть создано в системе)",
    "  • Ставка ₸/м² — если не указано, используется ставка этажа",
    "  • Дата начала / окончания — формат ДД.ММ.ГГГГ или ГГГГ-ММ-ДД",
    "",
    "ТИПЫ ОРГАНИЗАЦИЙ: ИП, ТОО, АО, ФЛ (физическое лицо). Если не указано — ТОО по умолчанию.",
    "",
    "После заполнения — загрузите файл на странице импорта в системе.",
    "Перед сохранением вы увидите превью и список ошибок.",
  ]
  lines.forEach((l) => help.addRow({ text: l }))
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
