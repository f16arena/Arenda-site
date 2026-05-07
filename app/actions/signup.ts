"use server"

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { validateSlug } from "@/lib/reserved-slugs"
import { slugify, suggestSlugs } from "@/lib/slugify"
import { ROOT_HOST } from "@/lib/host"
import { audit } from "@/lib/audit"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"
import { APPROVAL_PENDING } from "@/lib/approval"
import bcrypt from "bcryptjs"
import crypto from "crypto"

export interface SignupResult {
  ok: boolean
  pendingApproval?: boolean
  message?: string
  orgSlug?: string
  error?: string
  details?: { step: string; ms: number; ok: boolean; note?: string }[]
}

/**
 * Открытая регистрация для будущего клиента.
 * Создаёт Organization + Owner пользователя + 14-дневный триал
 * + автологин + редирект на slug-поддомен.
 */
export async function signup(_prev: SignupResult | undefined, formData: FormData): Promise<SignupResult> {
  const details: NonNullable<SignupResult["details"]> = []
  const step = (label: string, t0: number, ok: boolean, note?: string) => {
    details.push({ step: label, ms: Date.now() - t0, ok, note })
  }

  // Rate limit: 5 регистраций за час с одного IP — защита от спам-регистраций
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, "signup"), { max: 5, window: 60 * 60_000 })
  if (!rl.ok) {
    return {
      ok: false,
      error: `Слишком много попыток регистрации. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
      details,
    }
  }

  const companyName = String(formData.get("companyName") ?? "").trim()
  const slug = slugify(String(formData.get("slug") ?? ""))
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  let ownerEmail: string | null
  let ownerPhone: string | null
  try {
    ownerEmail = normalizeEmail(formData.get("ownerEmail"), { fieldName: "Email владельца" })
    ownerPhone = normalizeKzPhone(formData.get("ownerPhone"), { fieldName: "Телефон владельца" })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Некорректные контактные данные", details }
  }
  const password = String(formData.get("password") ?? "")
  const agreed = formData.get("agreed") === "on"

  // ── Базовая валидация ────────────────────────────────────────
  if (!companyName) return { ok: false, error: "Введите название организации", details }
  if (!ownerName) return { ok: false, error: "Введите ФИО владельца", details }
  if (!ownerEmail && !ownerPhone) return { ok: false, error: "Укажите email или телефон", details }
  if (password.length < 8) return { ok: false, error: "Пароль минимум 8 символов", details }
  if (!agreed) return { ok: false, error: "Нужно принять Публичную оферту и Политику конфиденциальности", details }

  const v = validateSlug(slug)
  if (!v.ok) return { ok: false, error: `Поддомен: ${v.reason}`, details }

  // ── Найти/создать TRIAL план ─────────────────────────────────
  let t0 = Date.now()
  let trialPlan = await db.plan.findFirst({ where: { code: "TRIAL" } }).catch(() => null)
  if (!trialPlan) {
    trialPlan = await db.plan.create({
      data: {
        code: "TRIAL",
        name: "Триал 14 дней",
        description: "Бесплатный пробный период со всеми функциями Бизнеса",
        priceMonthly: 0,
        priceYearly: 0,
        maxBuildings: 5,
        maxTenants: 100,
        maxUsers: 10,
        maxLeads: 50,
        features: JSON.stringify({
          emailNotifications: true, telegramBot: true, floorEditor: true,
          contractTemplates: true, bankImport: true, excelExport: true,
          export1c: true, cmdkSearch: true,
        }),
        sortOrder: -1,
      },
    }).catch((e) => {
      step("plan.create", t0, false, e instanceof Error ? e.message : "fail")
      throw e
    })
  }
  step("plan.ensure", t0, true, `id=${trialPlan.id}`)

  // ── Проверка занятости slug ──────────────────────────────────
  t0 = Date.now()
  const existingOrg = await db.organization.findUnique({ where: { slug } })
  step("slug.check", t0, true, existingOrg ? "taken" : "free")
  if (existingOrg) {
    const sug = suggestSlugs(slug).join(", ")
    return { ok: false, error: `Поддомен «${slug}» занят. Попробуйте: ${sug}`, details }
  }

  // ── Проверка не занят ли email/phone ─────────────────────────
  t0 = Date.now()
  if (ownerEmail) {
    const u = await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }).catch(() => null)
    if (u) {
      step("user.checkEmail", t0, false, "taken")
      return { ok: false, error: `Email ${ownerEmail} уже зарегистрирован. Войдите вместо регистрации.`, details }
    }
  }
  if (ownerPhone) {
    const u = await db.user.findUnique({ where: { phone: ownerPhone }, select: { id: true } }).catch(() => null)
    if (u) {
      step("user.checkPhone", t0, false, "taken")
      return { ok: false, error: `Телефон ${ownerPhone} уже зарегистрирован`, details }
    }
  }
  step("user.checkUnique", t0, true)

  // ── Создание заявки организации + владельца ──────────────────
  t0 = Date.now()

  let orgId: string
  let userId: string
  try {
    const hash = await bcrypt.hash(password, 10)
    const requestedAt = new Date()

    const org = await db.organization.create({
      data: {
        name: companyName,
        slug,
        planId: trialPlan.id,
        planExpiresAt: null,
        isActive: false,
        approvalStatus: APPROVAL_PENDING,
        approvalRequestedAt: requestedAt,
      },
    })
    orgId = org.id

    const user = await db.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        phone: ownerPhone,
        password: hash,
        role: "OWNER",
        organizationId: org.id,
        isActive: true,
        approvalStatus: APPROVAL_PENDING,
        approvalRequestedAt: requestedAt,
      },
      select: { id: true },
    })
    userId = user.id

    await db.organization.update({
      where: { id: org.id },
      data: { ownerUserId: user.id },
    })

    step("create.all", t0, true, `org=${org.id} user=${user.id}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    step("create.all", t0, false, msg)
    return { ok: false, error: `Не удалось создать организацию: ${msg}`, details }
  }

  await audit({
    action: "CREATE",
    entity: "tenant",
    entityId: orgId,
    details: { type: "organization", source: "signup", slug, name: companyName, approvalStatus: APPROVAL_PENDING },
  })

  // ── Welcome-письмо + ссылка для подтверждения email ─────────────
  // Не блокирует регистрацию: если письмо не ушло — просто пропускаем,
  // юзер сможет запросить повторное подтверждение из /admin/profile.
  if (ownerEmail) {
    try {
      const token = crypto.randomBytes(32).toString("hex")
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000) // 24 часа

      await db.verificationToken.create({
        data: {
          userId,
          type: "EMAIL_VERIFY",
          target: ownerEmail,
          token,
          expiresAt,
        },
      })

      const h = await headers()
      const proto = h.get("x-forwarded-proto") ?? "https"
      const verifyLink = `${proto}://${ROOT_HOST}/verify-email?token=${token}`

      const html = basicEmailTemplate({
        title: "Заявка в Commrent принята",
        body: `<p>Здравствуйте, ${ownerName}!</p>
<p>Ваша организация <b>${companyName}</b> отправлена на подтверждение.</p>
<p>После подтверждения суперадмином вам будет открыт кабинет <b>${slug}.commrent.kz</b>, а 14-дневный триал начнется этой датой.</p>
<p>Логин: <b>${ownerEmail}</b></p>
<p>Подтвердите email, чтобы получать важные уведомления (договоры, счета, напоминания):</p>`,
        buttonText: "Подтвердить email",
        buttonUrl: verifyLink,
        footer: "Если вы не регистрировались — проигнорируйте это письмо или ответьте на него для блокировки аккаунта.",
      })

      await sendEmail({
        to: ownerEmail,
        subject: `Заявка Commrent принята · ${companyName}`,
        html,
        text: `Здравствуйте, ${ownerName}!\n\nЗаявка организации ${companyName} отправлена на подтверждение. Кабинет ${slug}.commrent.kz и 14-дневный триал будут открыты после подтверждения суперадмином.\n\nПодтвердите email: ${verifyLink}`,
      })
    } catch (e) {
      console.warn("[signup] welcome email failed:", e instanceof Error ? e.message : e)
    }
  }

  return {
    ok: true,
    pendingApproval: true,
    orgSlug: slug,
    message: `Заявка ${companyName} отправлена на подтверждение. После подтверждения суперадмином владелец сможет войти в ${slug}.${ROOT_HOST}.`,
    details,
  }
}
