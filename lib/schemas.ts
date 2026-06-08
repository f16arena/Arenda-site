// Zod-схемы для server actions и API endpoints.
//
// Использование:
//   const result = TenantContactSchema.safeParse({
//     companyName: formData.get("companyName"),
//     email: formData.get("email"),
//   })
//   if (!result.success) {
//     return { ok: false, error: result.error.issues[0].message }
//   }
//   // result.data типизирован

import { z } from "zod"

// ── Базовые типы ────────────────────────────────────────────────────────────
export const PhoneSchema = z
  .string()
  .trim()
  .min(1, "Введите телефон")
  .regex(/^\+?[0-9\s\-()]{7,20}$/, "Некорректный формат телефона")

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Некорректный email")

export const PeriodSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Период должен быть в формате YYYY-MM")

export const NonNegativeMoneySchema = z
  .number({ error: "Некорректная сумма" })
  .nonnegative("Сумма не может быть отрицательной")
  .finite()

export const PositiveMoneySchema = NonNegativeMoneySchema.refine((v) => v > 0, {
  message: "Сумма должна быть больше нуля",
})

// Казахстанские реквизиты
export const BinSchema = z.string().regex(/^\d{12}$/, "БИН/ИИН должен содержать 12 цифр")
export const IikSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine((v) => /^KZ[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{13}$/.test(v), "ИИК должен начинаться с KZ и содержать 20 символов")
export const BikSchema = z.string().regex(/^[A-Z]{8,11}$/i, "БИК — это 8-11 латинских символов")

// ── User ────────────────────────────────────────────────────────────────────
export const UserCreateSchema = z.object({
  name: z.string().trim().min(2, "Имя минимум 2 символа").max(120),
  email: EmailSchema.optional().or(z.literal("").transform(() => undefined)),
  phone: PhoneSchema.optional().or(z.literal("").transform(() => undefined)),
  password: z.string().min(6, "Пароль минимум 6 символов"),
  role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE", "TENANT"]),
}).refine((data) => data.email || data.phone, {
  message: "Укажите email или телефон",
  path: ["phone"],
})

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(8, "Новый пароль минимум 8 символов"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "Новый пароль должен отличаться от текущего",
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
  title: z.string().trim().min(3, "Заголовок минимум 3 символа").max(200),
  description: z.string().trim().min(5, "Опишите проблему").max(5000),
  type: z.enum(["TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
})

// ── Building / Floor ────────────────────────────────────────────────────────
export const BuildingUpdateSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(200),
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
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ошибка валидации"
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
