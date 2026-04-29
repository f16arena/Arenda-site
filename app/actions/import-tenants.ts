"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import {
  parseExcel,
  autoMapColumns,
  getField,
  parseFlexibleDate,
  parseFlexibleNumber,
  normalizePhone,
  normalizeLegalType,
  extractBinIin,
} from "@/lib/excel-import"

// Синонимы заголовков (auto-mapping)
const FIELD_SYNONYMS: Record<string, string[]> = {
  contactName: ["ФИО", "Контактное лицо", "Контакт", "ФИО арендатора", "ФИО контакта", "Имя"],
  phone: ["Телефон", "Тел", "Phone", "Моб", "Мобильный", "Контакт"],
  email: ["Email", "Эл почта", "Электронная почта", "Mail", "E-mail"],
  companyName: ["Название", "Компания", "Контрагент", "Организация", "Арендатор", "Наименование"],
  legalType: ["Тип", "Форма", "Орг форма", "Тип ЮЛ"],
  bin: ["БИН", "ИИН", "БИНИИН", "БИН/ИИН", "ИНН", "BIN"],
  category: ["Категория", "Деятельность", "Вид деятельности", "Сфера", "Что"],
  spaceNumber: ["Помещение", "Кабинет", "Кaбинет", "Каб", "№ помещения", "Номер помещения", "Офис"],
  area: ["Площадь", "м2", "м²", "Кв м", "Sqm"],
  rate: ["Ставка", "Цена за м2", "Тариф", "Rate", "Ставка ₸/м²"],
  contractStart: ["Дата начала", "Начало", "С", "Старт", "Start"],
  contractEnd: ["Дата окончания", "Окончание", "По", "End", "Конец"],
  cleaningFee: ["Уборка", "Клининг", "Cleaning"],
  needsCleaning: ["Уборка нужна", "Клининг нужен"],
  legalAddress: ["Юр адрес", "Юридический адрес", "Адрес юр"],
  directorName: ["Директор", "Руководитель"],
}

export interface ParsedTenantRow {
  rowIndex: number
  data: {
    contactName: string
    phone: string
    email: string
    companyName: string
    legalType: string
    bin: string
    category: string
    spaceNumber: string
    rate: number | null
    contractStart: Date | null
    contractEnd: Date | null
    cleaningFee: number | null
    legalAddress: string
    directorName: string
  }
  warnings: string[]
}

export interface PreviewResult {
  totalRows: number
  validRows: ParsedTenantRow[]
  invalidRows: { rowIndex: number; error: string }[]
  unmappedFields: string[]
}

/**
 * Шаг 1: парсит Excel и возвращает превью (без сохранения в БД).
 */
export async function previewTenantImport(formData: FormData): Promise<PreviewResult> {
  await requireOrgAccess()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) throw new Error("Файл не передан")
  if (file.size > 10 * 1024 * 1024) throw new Error("Размер файла превышает 10 МБ")

  const buffer = Buffer.from(await file.arrayBuffer())
  const sheet = await parseExcel(buffer)

  const mapping = autoMapColumns(sheet.headers, FIELD_SYNONYMS)
  const requiredFields = ["companyName"]
  const unmapped = requiredFields.filter((f) => mapping[f] === undefined)

  if (unmapped.length > 0) {
    return {
      totalRows: sheet.rows.length,
      validRows: [],
      invalidRows: [],
      unmappedFields: unmapped,
    }
  }

  const validRows: ParsedTenantRow[] = []
  const invalidRows: { rowIndex: number; error: string }[] = []

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]
    const warnings: string[] = []

    const companyName = getField(row, mapping, "companyName")
    if (!companyName) {
      invalidRows.push({ rowIndex: i + 2, error: "Пустое название организации" })
      continue
    }

    const contactName = getField(row, mapping, "contactName") || companyName
    const phone = normalizePhone(getField(row, mapping, "phone"))
    const email = getField(row, mapping, "email").toLowerCase()
    const legalType = normalizeLegalType(getField(row, mapping, "legalType"))
    const bin = extractBinIin(getField(row, mapping, "bin"))
    const category = getField(row, mapping, "category")
    const spaceNumber = getField(row, mapping, "spaceNumber")
    const rate = parseFlexibleNumber(getField(row, mapping, "rate"))
    const contractStart = parseFlexibleDate(getField(row, mapping, "contractStart"))
    const contractEnd = parseFlexibleDate(getField(row, mapping, "contractEnd"))
    const cleaningFee = parseFlexibleNumber(getField(row, mapping, "cleaningFee"))
    const legalAddress = getField(row, mapping, "legalAddress")
    const directorName = getField(row, mapping, "directorName")

    if (!phone && !email) warnings.push("Нет ни телефона, ни email — пользователь не сможет войти")
    if (bin && bin.length !== 12) warnings.push(`БИН/ИИН должен быть 12 цифр (получено: ${bin})`)
    if (contractEnd && contractStart && contractEnd < contractStart) warnings.push("Дата окончания раньше даты начала")

    validRows.push({
      rowIndex: i + 2,
      data: {
        contactName,
        phone,
        email,
        companyName,
        legalType,
        bin,
        category,
        spaceNumber,
        rate,
        contractStart,
        contractEnd,
        cleaningFee,
        legalAddress,
        directorName,
      },
      warnings,
    })
  }

  return {
    totalRows: sheet.rows.length,
    validRows,
    invalidRows,
    unmappedFields: [],
  }
}

export interface ImportResult {
  created: number
  skipped: number
  errors: { rowIndex: number; error: string }[]
}

/**
 * Шаг 2: сохраняет распарсенные данные в БД.
 * Принимает уже-парсенные строки от previewTenantImport.
 */
export async function applyTenantImport(rows: ParsedTenantRow[]): Promise<ImportResult> {
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)

  const result: ImportResult = { created: 0, skipped: 0, errors: [] }

  // Найдём здание организации (для привязки помещений по номеру)
  const building = await db.building.findFirst({
    where: { organizationId: orgId },
    include: {
      floors: { include: { spaces: { select: { id: true, number: true } } } },
    },
    orderBy: { createdAt: "asc" },
  })

  // Карта № помещения → spaceId (для быстрого поиска)
  const spaceByNumber = new Map<string, string>()
  if (building) {
    for (const f of building.floors) {
      for (const s of f.spaces) spaceByNumber.set(s.number.toLowerCase(), s.id)
    }
  }

  for (const row of rows) {
    try {
      // Лимит — не подходит ли уже выходим?
      try { await checkLimit(orgId, "tenants") } catch (e) {
        result.errors.push({ rowIndex: row.rowIndex, error: e instanceof Error ? e.message : "лимит" })
        continue
      }

      const d = row.data

      // Дублирование по БИН/email/phone
      const dupBy: Array<{ bin?: string }> = []
      if (d.bin) dupBy.push({ bin: d.bin })
      const existing = d.bin
        ? await db.tenant.findFirst({
            where: {
              bin: d.bin,
              space: { floor: { building: { organizationId: orgId } } },
            },
            select: { id: true },
          })
        : null
      if (existing) {
        result.skipped++
        continue
      }

      // Создаём User (если есть phone/email)
      let userId: string | null = null
      if (d.phone || d.email) {
        const userPhone = d.phone || null
        const userEmail = d.email || null

        // Проверка глобальных уникальных ограничений (phone/email уникальны на платформе)
        const conflict = await db.user.findFirst({
          where: {
            OR: [
              ...(userPhone ? [{ phone: userPhone }] : []),
              ...(userEmail ? [{ email: userEmail }] : []),
            ],
          },
          select: { id: true },
        })
        if (conflict) {
          result.errors.push({
            rowIndex: row.rowIndex,
            error: `Телефон/email уже используется другим пользователем (${d.phone || d.email})`,
          })
          continue
        }

        // Дефолтный пароль = последние 8 цифр БИН/телефона или fallback
        const defaultPwd = (d.bin || d.phone.replace(/\D/g, "") || "tenant123").slice(-8) || "tenant123"
        const hash = await bcrypt.hash(defaultPwd.padEnd(6, "0"), 10)

        const user = await db.user.create({
          data: {
            name: d.contactName,
            phone: userPhone,
            email: userEmail,
            password: hash,
            role: "TENANT",
            organizationId: orgId,
          },
          select: { id: true },
        })
        userId = user.id
      } else {
        // Без контактов — создаём заглушку user
        const hash = await bcrypt.hash("temp_no_contacts_" + Date.now(), 10)
        const user = await db.user.create({
          data: {
            name: d.contactName,
            password: hash,
            role: "TENANT",
            organizationId: orgId,
          },
          select: { id: true },
        })
        userId = user.id
      }

      // Помещение
      const spaceId = d.spaceNumber ? spaceByNumber.get(d.spaceNumber.toLowerCase()) : undefined

      await db.tenant.create({
        data: {
          userId,
          spaceId: spaceId ?? null,
          companyName: d.companyName,
          bin: d.bin || null,
          legalType: d.legalType,
          category: d.category || null,
          legalAddress: d.legalAddress || null,
          directorName: d.directorName || null,
          customRate: d.rate || null,
          cleaningFee: d.cleaningFee ?? 0,
          needsCleaning: (d.cleaningFee ?? 0) > 0,
          contractStart: d.contractStart,
          contractEnd: d.contractEnd,
        },
      })

      // Если помещение нашли — пометим OCCUPIED
      if (spaceId) {
        await db.space.update({
          where: { id: spaceId },
          data: { status: "OCCUPIED" },
        })
      }

      result.created++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push({ rowIndex: row.rowIndex, error: msg })
    }
  }

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return result
}
