import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { audit } from "@/lib/audit"
import { db } from "@/lib/db"
import { basicEmailTemplate, sendEmail } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { createMobileSession, getRequestMeta } from "@/lib/mobile-auth"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { validateSlug } from "@/lib/reserved-slugs"
import { slugify, suggestSlugs } from "@/lib/slugify"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"

export const dynamic = "force-dynamic"

const TRIAL_DAYS = 14

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    companyName?: string
    slug?: string
    ownerName?: string
    ownerEmail?: string
    ownerPhone?: string
    password?: string
    agreed?: boolean
    deviceId?: string
    deviceName?: string
    platform?: string
    appVersion?: string
  } | null

  const rateLimit = checkRateLimit(getClientKey(req.headers, "mobile-signup"), { max: 5, window: 60 * 60_000 })
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `Слишком много регистраций. Попробуйте через ${Math.ceil(rateLimit.retryAfterSec / 60)} мин.` },
      { status: 429 },
    )
  }

  const companyName = String(body?.companyName ?? "").trim()
  const slug = slugify(String(body?.slug || companyName || ""))
  const ownerName = String(body?.ownerName ?? "").trim()
  const password = String(body?.password ?? "")

  let ownerEmail: string | null = null
  let ownerPhone: string | null = null
  try {
    ownerEmail = normalizeEmail(body?.ownerEmail, { fieldName: "Email владельца" })
    ownerPhone = normalizeKzPhone(body?.ownerPhone, { fieldName: "Телефон владельца" })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Некорректные контакты", 400)
  }

  if (!companyName) return jsonError("Введите название организации", 400)
  if (!ownerName) return jsonError("Введите ФИО владельца", 400)
  if (!ownerEmail && !ownerPhone) return jsonError("Укажите email или телефон", 400)
  if (password.length < 8) return jsonError("Пароль должен быть минимум 8 символов", 400)
  if (!body?.agreed) return jsonError("Примите публичную оферту и политику конфиденциальности", 400)

  const slugValidation = validateSlug(slug)
  if (!slugValidation.ok) return jsonError(`Поддомен: ${slugValidation.reason}`, 400)

  const [existingOrg, existingEmail, existingPhone] = await Promise.all([
    db.organization.findUnique({ where: { slug }, select: { id: true } }),
    ownerEmail ? db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }) : null,
    ownerPhone ? db.user.findUnique({ where: { phone: ownerPhone }, select: { id: true } }) : null,
  ])

  if (existingOrg) {
    return jsonError(`Поддомен «${slug}» занят. Попробуйте: ${suggestSlugs(slug).join(", ")}`, 409)
  }
  if (existingEmail) return jsonError(`Email ${ownerEmail} уже зарегистрирован`, 409)
  if (existingPhone) return jsonError(`Телефон ${ownerPhone} уже зарегистрирован`, 409)

  const trialPlan = await ensureTrialPlan()
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60_000)
  const passwordHash = await bcrypt.hash(password, 10)

  const created = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: companyName,
        slug,
        planId: trialPlan.id,
        planExpiresAt: expiresAt,
      },
    })

    const user = await tx.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        phone: ownerPhone,
        password: passwordHash,
        role: "OWNER",
        organizationId: org.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        organizationId: true,
        isPlatformOwner: true,
      },
    })

    await tx.organization.update({
      where: { id: org.id },
      data: { ownerUserId: user.id },
    })

    await tx.subscription.create({
      data: {
        organizationId: org.id,
        planId: trialPlan.id,
        expiresAt,
        paymentMethod: "TRIAL",
        notes: "Мобильная регистрация · 14-дневный триал",
      },
    })

    return { org, user: { ...user, organizationId: user.organizationId! } }
  })

  await audit({
    action: "CREATE",
    entity: "tenant",
    entityId: created.org.id,
    details: { type: "organization", source: "mobile-signup", slug, name: companyName },
  }).catch(() => null)

  await sendWelcomeEmail({
    req,
    userId: created.user.id,
    ownerName,
    ownerEmail,
    companyName,
    slug,
  })

  const tokens = await createMobileSession(created.user, {
    ...getRequestMeta(req),
    deviceId: body?.deviceId,
    deviceName: body?.deviceName,
    platform: body?.platform,
    appVersion: body?.appVersion,
  })

  return NextResponse.json({
    user: {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      phone: created.user.phone,
      role: created.user.role,
      organizationId: created.user.organizationId,
    },
    tokens,
    organization: {
      id: created.org.id,
      name: created.org.name,
      slug: created.org.slug,
      trialExpiresAt: expiresAt.toISOString(),
    },
  })
}

async function ensureTrialPlan() {
  const existing = await db.plan.findFirst({ where: { code: "TRIAL" } })
  if (existing) return existing

  return db.plan.create({
    data: {
      code: "TRIAL",
      name: "Триал 14 дней",
      description: "Бесплатный пробный период со всеми основными функциями",
      priceMonthly: 0,
      priceYearly: 0,
      maxBuildings: 5,
      maxTenants: 100,
      maxUsers: 10,
      maxLeads: 50,
      features: JSON.stringify({
        emailNotifications: true,
        telegramBot: true,
        floorEditor: true,
        contractTemplates: true,
        bankImport: true,
        excelExport: true,
        export1c: true,
        cmdkSearch: true,
      }),
      sortOrder: -1,
    },
  })
}

async function sendWelcomeEmail(input: {
  req: Request
  userId: string
  ownerName: string
  ownerEmail: string | null
  companyName: string
  slug: string
}) {
  if (!input.ownerEmail) return

  try {
    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000)
    await db.verificationToken.create({
      data: {
        userId: input.userId,
        type: "EMAIL_VERIFY",
        target: input.ownerEmail,
        token,
        expiresAt,
      },
    })

    const proto = input.req.headers.get("x-forwarded-proto") ?? "https"
    const verifyLink = `${proto}://${ROOT_HOST}/verify-email?token=${token}`
    const adminLink = `${proto}://${input.slug}.${ROOT_HOST}/admin/onboarding`
    const html = basicEmailTemplate({
      title: "Добро пожаловать в Commrent",
      body: `<p>Здравствуйте, ${input.ownerName}!</p>
<p>Организация <b>${input.companyName}</b> зарегистрирована. Вы можете продолжить настройку кабинета по ссылке ниже.</p>
<p>Логин: <b>${input.ownerEmail}</b></p>
<p>Также подтвердите email, чтобы получать важные уведомления по документам, оплатам и заявкам.</p>`,
      buttonText: "Открыть кабинет",
      buttonUrl: adminLink,
      footer: `Подтверждение email: ${verifyLink}`,
    })

    await sendEmail({
      to: input.ownerEmail,
      subject: `Добро пожаловать в Commrent · ${input.companyName}`,
      html,
      text: `Кабинет: ${adminLink}\nПодтверждение email: ${verifyLink}`,
    })
  } catch (error) {
    console.warn("[mobile-signup] welcome email failed:", error instanceof Error ? error.message : error)
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}
