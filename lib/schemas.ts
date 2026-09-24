// Zod-схемы для server actions и API endpoints.
//
// Использование:
//   const result = TenantContactSchema.safeParse({
//     companyName: formData.get("companyName"),
//     email: formData.get("email"),
//   })
//   if (!result.success) {
//     return { ok: false, error: firstZodError(result.error, t) }
//   }
//   // result.data типизирован
//
// Сообщения — ключи словаря (catalogs.validation.*), а не готовый текст: схема
// собирается при загрузке модуля, когда язык запроса ещё неизвестен. Подпись
// подставляет firstZodError по переводчику вызывающей стороны.

import { z } from "zod"

/** Ключи подписей ошибок; узкий тип, чтобы t подходил без приведения. */
export type ValidationKey = `catalogs.validation.${keyof typeof FALLBACK_RU}`
export type ValidationTranslate = (key: ValidationKey) => string

const K = {
  fallback: "catalogs.validation.fallback",
  phoneRequired: "catalogs.validation.phoneRequired",
  phoneFormat: "catalogs.validation.phoneFormat",
  email: "catalogs.validation.email",
  period: "catalogs.validation.period",
  amount: "catalogs.validation.amount",
  amountNegative: "catalogs.validation.amountNegative",
  amountZero: "catalogs.validation.amountZero",
  taxId: "catalogs.validation.taxId",
  iik: "catalogs.validation.iik",
  bik: "catalogs.validation.bik",
  nameShort: "catalogs.validation.nameShort",
  passwordShort: "catalogs.validation.passwordShort",
  contactRequired: "catalogs.validation.contactRequired",
  currentPassword: "catalogs.validation.currentPassword",
  newPasswordShort: "catalogs.validation.newPasswordShort",
  passwordsMismatch: "catalogs.validation.passwordsMismatch",
  newPasswordSame: "catalogs.validation.newPasswordSame",
  titleShort: "catalogs.validation.titleShort",
  describeProblem: "catalogs.validation.describeProblem",
  nameRequired: "catalogs.validation.nameRequired",
} as const

/**
 * Запасной русский текст для вызывающих сторон, куда переводчик ещё не
 * проброшен (тот же приём, что в lib/kz-iin.ts): до миграции пользователь видит
 * прежнее сообщение, а не ключ словаря.
 */
const FALLBACK_RU = {
  fallback: "Ошибка валидации",
  phoneRequired: "Введите телефон",
  phoneFormat: "Некорректный формат телефона",
  email: "Некорректный email",
  period: "Период должен быть в формате YYYY-MM",
  amount: "Некорректная сумма",
  amountNegative: "Сумма не может быть отрицательной",
  amountZero: "Сумма должна быть больше нуля",
  taxId: "БИН/ИИН должен содержать 12 цифр",
  iik: "ИИК должен начинаться с KZ и содержать 20 символов",
  bik: "БИК — это 8-11 латинских символов",
  nameShort: "Имя минимум 2 символа",
  passwordShort: "Пароль минимум 6 символов",
  contactRequired: "Укажите email или телефон",
  currentPassword: "Введите текущий пароль",
  newPasswordShort: "Новый пароль минимум 8 символов",
  passwordsMismatch: "Пароли не совпадают",
  newPasswordSame: "Новый пароль должен отличаться от текущего",
  titleShort: "Заголовок минимум 3 символа",
  describeProblem: "Опишите проблему",
  nameRequired: "Название обязательно",
} as const

// ── Базовые типы ────────────────────────────────────────────────────────────
export const PhoneSchema = z
  .string()
  .trim()
  .min(1, K.phoneRequired)
  .regex(/^\+?[0-9\s\-()]{7,20}$/, K.phoneFormat)

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email(K.email)

export const PeriodSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, K.period)

export const NonNegativeMoneySchema = z
  .number({ error: K.amount })
  .nonnegative(K.amountNegative)
  .finite()

export const PositiveMoneySchema = NonNegativeMoneySchema.refine((v) => v > 0, {
  message: K.amountZero,
})

// Казахстанские реквизиты
export const BinSchema = z.string().regex(/^\d{12}$/, K.taxId)
export const IikSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine((v) => /^KZ[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{13}$/.test(v), K.iik)
export const BikSchema = z.string().regex(/^[A-Z]{8,11}$/i, K.bik)

// ── User ────────────────────────────────────────────────────────────────────
export const UserCreateSchema = z.object({
  name: z.string().trim().min(2, K.nameShort).max(120),
  email: EmailSchema.optional().or(z.literal("").transform(() => undefined)),
  phone: PhoneSchema.optional().or(z.literal("").transform(() => undefined)),
  password: z.string().min(6, K.passwordShort),
  role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE", "TENANT"]),
}).refine((data) => data.email || data.phone, {
  message: K.contactRequired,
  path: ["phone"],
})

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, K.currentPassword),
  newPassword: z.string().min(8, K.newPasswordShort),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: K.passwordsMismatch,
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: K.newPasswordSame,
  path: ["newPassword"],
})

// ── Tenant ──────────────────────────────────────────────────────────────────
export const TenantContactSchema = z.object({
  companyName: z.string().trim().min(2).max(255),
  contactName: z.string().trim().max(255).optional().nullable(),
  email: EmailSchema.optional().or(z.literal("")),
  phone: PhoneSchema.optional().or(z.literal("")),
})

export const TenantRequisitesSchema = z.object({
  bin: BinSchema.optional().or(z.literal("")),
  bankName: z.string().trim().max(255).optional().nullable(),
  iik: IikSchema.optional().or(z.literal("")),
  bik: BikSchema.optional().or(z.literal("")),
})

// ── Charge / Payment ────────────────────────────────────────────────────────
export const ChargeCreateSchema = z.object({
  tenantId: z.string().min(1),
  type: z.enum([
    "RENT",
    "SERVICE_FEE",
    "CLEANING",
    "ELECTRICITY",
    "WATER",
    "HEATING",
    "GARBAGE",
    "SECURITY",
    "INTERNET",
    "PENALTY",
    "OTHER",
  ]),
  amount: PositiveMoneySchema,
  period: PeriodSchema,
  description: z.string().trim().max(500).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
})

export const PaymentCreateSchema = z.object({
  tenantId: z.string().min(1),
  amount: PositiveMoneySchema,
  method: z.enum(["TRANSFER", "CASH", "KASPI", "CARD"]),
  paymentDate: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
})

// ── Request ─────────────────────────────────────────────────────────────────
export const RequestCreateSchema = z.object({
  title: z.string().trim().min(3, K.titleShort).max(200),
  description: z.string().trim().min(5, K.describeProblem).max(5000),
  type: z.enum(["TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
})

// ── Building / Floor ────────────────────────────────────────────────────────
export const BuildingUpdateSchema = z.object({
  name: z.string().trim().min(1, K.nameRequired).max(200),
  address: z.string().trim().max(500).optional().nullable(),
  phone: PhoneSchema.optional().or(z.literal("")),
  email: EmailSchema.optional().or(z.literal("")),
  responsible: z.string().trim().max(200).optional().nullable(),
  totalArea: NonNegativeMoneySchema.optional().nullable(),
  // Описание здания
  description: z.string().trim().max(2000).optional().nullable(),
  // Адресные поля (детальная разбивка адреса)
  addressCountry: z.string().trim().max(120).optional().nullable(),
  addressRegion: z.string().trim().max(200).optional().nullable(),
  addressCity: z.string().trim().max(200).optional().nullable(),
  addressDistrict: z.string().trim().max(200).optional().nullable(),
  addressStreet: z.string().trim().max(300).optional().nullable(),
  addressBuilding: z.string().trim().max(50).optional().nullable(),
  addressApartment: z.string().trim().max(50).optional().nullable(),
  addressPostalCode: z.string().trim().max(20).optional().nullable(),
  addressLat: z.coerce.number().finite().optional().nullable(),
  addressLng: z.coerce.number().finite().optional().nullable(),
  addressNote: z.string().trim().max(500).optional().nullable(),
  // Контакты ответственного
  responsibleEmail: EmailSchema.optional().or(z.literal("")),
  responsiblePhone: PhoneSchema.optional().or(z.literal("")),
})

export const FloorUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ratePerSqm: NonNegativeMoneySchema,
  totalArea: NonNegativeMoneySchema.optional().nullable(),
})

// ── Хелпер: первое сообщение об ошибке ──────────────────────────────────────
/**
 * Первая ошибка разбора, уже подписью. message в схемах — ключ словаря; без
 * переводчика возвращаем русский запасной текст, а сообщение, которое ключом не
 * является (пришло из вложенной схемы), отдаём как есть.
 */
export function firstZodError(error: z.ZodError, t?: ValidationTranslate): string {
  const message = error.issues[0]?.message
  if (!message) return t ? t(K.fallback) : FALLBACK_RU.fallback
  if (!isValidationKey(message)) return message
  return t ? t(message) : FALLBACK_RU[message.slice("catalogs.validation.".length) as keyof typeof FALLBACK_RU]
}

function isValidationKey(message: string): message is ValidationKey {
  const name = message.startsWith("catalogs.validation.")
    ? message.slice("catalogs.validation.".length)
    : null
  return name !== null && name in FALLBACK_RU
}

// ── Хелпер: валидация email с DNS-проверкой домена ─────────────────────────
// Используется для дополнительной DNS-валидации email.
// Возвращает нормализованный email при успехе или null при ошибке/пустом значении.
export async function validateEmailWithDns(email: string): Promise<string | null> {
  const { normalizeEmailWithDns } = await import("@/lib/contact-validation")
  try {
    return await normalizeEmailWithDns(email)
  } catch {
    return null
  }
}
