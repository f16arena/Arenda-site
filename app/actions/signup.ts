"use server"

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { validateSlug } from "@/lib/reserved-slugs"
import { slugify, suggestSlugs } from "@/lib/slugify"
import { ROOT_HOST } from "@/lib/host"
import { getT } from "@/lib/i18n/server"
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
  // Письмо уходит тому же человеку, кто заполняет форму, — язык запроса верен.
  const { t } = await getT()
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
      error: t("actions.signup.tooManyAttempts", { minutes: Math.ceil(rl.retryAfterSec / 60) }),
      details,
    }
  }

  const companyName = String(formData.get("companyName") ?? "").trim()
  const slug = slugify(String(formData.get("slug") ?? ""))
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  let ownerEmail: string | null
  let ownerPhone: string | null
  try {
    ownerEmail = normalizeEmail(formData.get("ownerEmail"), {
      fieldName: t("actions.organizations.ownerEmailField"),
      t,
    })
    ownerPhone = normalizeKzPhone(formData.get("ownerPhone"), {
      fieldName: t("actions.organizations.ownerPhoneField"),
      t,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t("actions.common.invalidContactData"), details }
  }
  const password = String(formData.get("password") ?? "")
  // acceptedTerms (новое название после консолидации с agreed). Серверная
  // валидация — на случай если кто-то обойдёт клиентскую блокировку кнопки.
  const acceptedTerms = formData.get("acceptedTerms") === "on" || formData.get("agreed") === "on"

  // ── Базовая валидация ────────────────────────────────────────
  if (!companyName) return { ok: false, error: t("actions.signup.companyRequired"), details }
  if (!ownerName) return { ok: false, error: t("actions.signup.ownerNameRequired"), details }
  if (!ownerEmail && !ownerPhone) return { ok: false, error: t("actions.signup.contactRequired"), details }
  if (password.length < 8) return { ok: false, error: t("actions.myAccount.newPasswordTooShort"), details }
  if (!acceptedTerms) return { ok: false, error: t("actions.signup.termsRequired"), details }

  const v = validateSlug(slug)
  if (!v.ok) return { ok: false, error: t("actions.signup.slugProblem", { reason: v.reason ?? "" }), details }

  // ── Найти/создать TRIAL план ─────────────────────────────────
  let t0 = Date.now()
  let trialPlan = await db.plan.findFirst({ where: { code: "TRIAL" } }).catch(() => null)
  if (!trialPlan) {
    trialPlan = await db.plan.create({
      data: {
        code: "TRIAL",
        // Название и описание тарифа — запись в БД, её видят все организации
        // на любом языке, поэтому остаются русскими.
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
    return { ok: false, error: t("actions.organizations.slugTaken", { slug, suggestions: sug }), details }
  }

  // ── Проверка не занят ли email/phone ─────────────────────────
  t0 = Date.now()
  if (ownerEmail) {
    const u = await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }).catch(() => null)
    if (u) {
      step("user.checkEmail", t0, false, "taken")
      return { ok: false, error: t("actions.signup.emailRegistered", { email: ownerEmail }), details }
    }
  }
  if (ownerPhone) {
    const u = await db.user.findUnique({ where: { phone: ownerPhone }, select: { id: true } }).catch(() => null)
    if (u) {
      step("user.checkPhone", t0, false, "taken")
      return { ok: false, error: t("actions.signup.phoneRegistered", { phone: ownerPhone }), details }
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
    return { ok: false, error: t("actions.signup.createFailed", { reason: msg }), details }
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
        title: t("actions.signup.mailTitle"),
        body: `<p>${t("actions.signup.mailGreeting", { name: ownerName })}</p>
<p>${t("actions.signup.mailPending", { company: companyName })}</p>
<p>${t("actions.signup.mailCabinet", { host: `${slug}.commrent.kz` })}</p>
<p>${t("actions.signup.mailLogin", { login: ownerEmail })}</p>
<p>${t("actions.signup.mailVerifyLead")}</p>`,
        buttonText: t("actions.signup.mailVerifyButton"),
        buttonUrl: verifyLink,
        footer: t("actions.signup.mailFooter"),
      })

      await sendEmail({
        to: ownerEmail,
        subject: t("actions.signup.mailSubject", { company: companyName }),
        html,
        text: t("actions.signup.mailText", {
          name: ownerName,
          company: companyName,
          host: `${slug}.commrent.kz`,
          link: verifyLink,
        }),
      })
    } catch (e) {
      console.warn("[signup] welcome email failed:", e instanceof Error ? e.message : e)
    }
  }

  return {
    ok: true,
    pendingApproval: true,
    orgSlug: slug,
    message: t("actions.signup.submitted", { company: companyName, host: `${slug}.${ROOT_HOST}` }),
    details,
  }
}
