import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

// POST /api/setup — одноразовая инициализация БД
// Защищён секретом: /api/setup?secret=SETUP_SECRET
//
// В production эндпоинт ОТКЛЮЧЁН по умолчанию. Чтобы временно включить:
//   1. Установить SETUP_ENABLED=true в Vercel env
//   2. Выполнить инициализацию
//   3. Убрать SETUP_ENABLED обратно (или поставить false)
export async function POST(request: Request) {
  const reqHeaders = await headers()
  const clientKey = getClientKey(reqHeaders, "setup")

  // Feature flag: в production требуется явное SETUP_ENABLED=true
  if (process.env.NODE_ENV === "production" && process.env.SETUP_ENABLED !== "true") {
    console.warn(`[setup] BLOCKED — SETUP_ENABLED не установлен. Источник: ${clientKey}`)
    return NextResponse.json({ error: "Setup disabled" }, { status: 403 })
  }

  // Rate limit: 3 попытки за час с одного IP — защита от brute-force перебора SETUP_SECRET
  const rl = checkRateLimit(clientKey, { max: 3, window: 60 * 60_000 })
  if (!rl.ok) {
    console.warn(`[setup] RATE LIMITED ${clientKey}, retry через ${rl.retryAfterSec}с`)
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    )
  }

  // Защита от CSRF: только запросы с того же домена
  const origin = reqHeaders.get("origin") ?? ""
  const host = reqHeaders.get("host") ?? ""
  if (origin && host && !origin.includes(host) && !origin.endsWith("commrent.kz")) {
    console.warn(`[setup] CSRF blocked: origin=${origin} host=${host}`)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const expectedSecret = process.env.SETUP_SECRET
  if (!expectedSecret || expectedSecret.length < 32) {
    return NextResponse.json(
      { error: "SETUP_SECRET не настроен либо слишком короткий (нужно минимум 32 символа)" },
      { status: 503 },
    )
  }
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  if (!secret || secret.length !== expectedSecret.length) {
    console.warn(`[setup] FAIL secret format from ${clientKey}`)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Constant-time сравнение — защищает от timing-attacks
  const { timingSafeEqual } = await import("crypto")
  const a = Buffer.from(secret)
  const b = Buffer.from(expectedSecret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.warn(`[setup] FAIL wrong secret from ${clientKey}`)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await db.user.findFirst({ where: { role: "OWNER" } })
  if (existing) {
    return NextResponse.json({ message: "Already initialized", owner: existing.email ?? existing.phone })
  }

  const hash = (pw: string) => bcrypt.hash(pw, 10)
  // Генерируем стойкие случайные пароли (12 символов, base64url)
  const { randomBytes } = await import("crypto")
  const randomPassword = () => randomBytes(9).toString("base64url")
  const ownerPw = randomPassword()
  const adminPw = randomPassword()
  const accountantPw = randomPassword()
  const managerPw = randomPassword()

  // ── Здание ──────────────────────────────────────────────────
  // Сначала создадим организацию (или возьмём существующую)
  let org = await db.organization.findUnique({ where: { slug: "f16" } })
  if (!org) {
    const proPlan = await db.plan.findUnique({ where: { code: "PRO" } })
    org = await db.organization.create({
      data: {
        name: "БЦ F16",
        slug: "f16",
        planId: proPlan?.id,
        planExpiresAt: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000),
      },
    })
  }

  const building = await db.building.create({
    data: {
      organizationId: org.id,
      name: "БЦ F16",
      address: "г. Усть-Каменогорск, ул. 30-й Гвардейской дивизии 24/1",
      responsible: "Арыстан",
      phone: "+7 (700) 000-00-00",
      email: "f16arena@gmail.com",
      totalArea: 3200,
    },
  })

  // ── Этажи ───────────────────────────────────────────────────
  const [floor0, floor1, floor2, floor3] = await Promise.all([
    db.floor.create({ data: { buildingId: building.id, number: 0, name: "Подвал", ratePerSqm: 1500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 1, name: "1 этаж", ratePerSqm: 2500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 2, name: "2 этаж", ratePerSqm: 2500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 3, name: "3 этаж", ratePerSqm: 2000 } }),
  ])

  // ── Пользователи ─────────────────────────────────────────────
  // mustChangePassword: true — стартовые пароли одноразовые, надо сменить при
  // первом входе (см. middleware-проверку в app/admin/layout.tsx).
  const [owner, admin, accountant, manager] = await Promise.all([
    db.user.create({
      data: {
        name: "Арыстан",
        email: "f16arena@gmail.com",
        password: await hash(ownerPw),
        role: "OWNER",
        mustChangePassword: true,
        organizationId: org.id,
      },
    }),
    db.user.create({
      data: {
        name: "Администратор",
        phone: "+77000000002",
        email: "admin@f16arena.kz",
        password: await hash(adminPw),
        role: "ADMIN",
        mustChangePassword: true,
        organizationId: org.id,
      },
    }),
    db.user.create({
      data: {
        name: "Бухгалтер",
        phone: "+77000000003",
        email: "buh@f16arena.kz",
        password: await hash(accountantPw),
        role: "ACCOUNTANT",
        mustChangePassword: true,
        organizationId: org.id,
      },
    }),
    db.user.create({
      data: {
        name: "Завхоз",
        phone: "+77000000004",
        password: await hash(managerPw),
        role: "FACILITY_MANAGER",
        mustChangePassword: true,
        organizationId: org.id,
      },
    }),
  ])

  // ── Профили сотрудников ──────────────────────────────────────
  await Promise.all([
    db.staff.create({ data: { userId: admin.id,      position: "Администратор", salary: 250000 } }),
    db.staff.create({ data: { userId: accountant.id, position: "Бухгалтер",     salary: 220000 } }),
    db.staff.create({ data: { userId: manager.id,    position: "Завхоз",         salary: 180000 } }),
  ])

  // ── Экстренные контакты ──────────────────────────────────────
  await db.emergencyContact.createMany({
    data: [
      { buildingId: building.id, name: "Пожарная служба",      phone: "101",                category: "FIRE" },
      { buildingId: building.id, name: "Полиция",               phone: "102",                category: "POLICE" },
      { buildingId: building.id, name: "Скорая помощь",         phone: "103",                category: "AMBULANCE" },
      { buildingId: building.id, name: "Водоканал аварийная",   phone: "+7 727 273-03-03",   category: "WATER" },
      { buildingId: building.id, name: "Электросети аварийная", phone: "+7 727 230-88-33",   category: "ELECTRICITY" },
      { buildingId: building.id, name: "Газовая служба",        phone: "+7 727 239-25-55",   category: "GAS" },
    ],
  })

  // Пароли НЕ возвращаются в JSON — отправляем по email/Telegram владельцу.
  // Для первого setup'а выводим один раз в server-log с привязкой к timestamp.
  console.warn(
    `[setup] Создан владелец ${owner.email}. Стартовый пароль: ${ownerPw}\n` +
      `Передайте этот пароль владельцу безопасным каналом и попросите немедленно сменить в /admin/profile.\n` +
      `Дополнительно создано: admin=${adminPw} accountant=${accountantPw} manager=${managerPw}`,
  )

  return NextResponse.json({
    success: true,
    message: "База данных инициализирована. Пароли в server-log (Vercel → Logs).",
    accounts: [
      { role: "OWNER", login: "f16arena@gmail.com" },
      { role: "ADMIN", login: "admin@f16arena.kz" },
      { role: "ACCOUNTANT", login: "buh@f16arena.kz" },
      { role: "FACILITY_MANAGER", login: "+77000000004" },
    ],
    building: building.id,
    floors: [floor0.id, floor1.id, floor2.id, floor3.id],
  })
}

// GET — показать инструкцию (только если SETUP_ENABLED либо вне production)
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.SETUP_ENABLED !== "true") {
    return NextResponse.json({ error: "Setup disabled" }, { status: 403 })
  }

  const initialized = await db.user.findFirst({ where: { role: "OWNER" } })

  if (initialized) {
    return NextResponse.json({
      status: "initialized",
      // НЕ возвращаем email владельца — может быть использован для атак
      message: "Система уже настроена. Войдите через /login",
    })
  }

  return NextResponse.json({
    status: "not_initialized",
    message: "Отправьте POST /api/setup?secret=ВАШ_SETUP_SECRET для инициализации",
  })
}
