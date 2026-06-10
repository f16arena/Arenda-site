import "server-only"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

/**
 * Публичная демо-организация (кнопка «Попробовать демо» на лендинге, как
 * portal-demo.pro.rent): любой посетитель входит владельцем демо-БЦ с готовыми
 * данными и кликает всё подряд. Cron /api/cron/demo-reset раз в сутки полностью
 * сносит данные демо-организации и наполняет заново.
 *
 * env: DEMO_PASSWORD (по умолчанию "demo2026").
 */

export const DEMO_SLUG = "demo"
export const DEMO_EMAIL = "demo@commrent.kz"

export function demoPassword(): string {
  return process.env.DEMO_PASSWORD || "demo2026"
}

/** Демо-организация существует и наполнена? Если нет — создать/наполнить. */
export async function ensureDemoOrg(): Promise<{ orgId: string }> {
  const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } })
  if (existing) {
    const hasData = await db.building.findFirst({ where: { organizationId: existing.id }, select: { id: true } })
    if (hasData) return { orgId: existing.id }
  }
  return resetDemoOrg()
}

/** Полный сброс демо: снести данные организации и наполнить заново. */
export async function resetDemoOrg(): Promise<{ orgId: string }> {
  const org = await db.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } })
  if (org) await wipeDemoData(org.id)
  return seedDemoOrg()
}

/** Каждый шаг очистки независим: упавший deleteMany не должен ломать остальные. */
async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    console.warn(`[demo-reset] ${label}:`, e instanceof Error ? e.message : e)
  }
}

async function wipeDemoData(orgId: string) {
  const users = await db.user.findMany({ where: { organizationId: orgId }, select: { id: true } })
  const userIds = users.map((u) => u.id)
  const tenants = await db.tenant.findMany({ where: { user: { organizationId: orgId } }, select: { id: true } })
  const tenantIds = tenants.map((t) => t.id)
  const buildings = await db.building.findMany({ where: { organizationId: orgId }, select: { id: true } })
  const buildingIds = buildings.map((b) => b.id)
  const floors = await db.floor.findMany({ where: { buildingId: { in: buildingIds } }, select: { id: true } })
  const floorIds = floors.map((f) => f.id)

  await step("requestComments", () => db.requestComment.deleteMany({ where: { request: { tenantId: { in: tenantIds } } } }))
  await step("requests", () => db.request.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("meterReadings", () => db.meterReading.deleteMany({ where: { meter: { space: { floorId: { in: floorIds } } } } }))
  await step("meters", () => db.meter.deleteMany({ where: { space: { floorId: { in: floorIds } } } }))
  await step("charges", () => db.charge.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("payments", () => db.payment.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("paymentReports", () => db.paymentReport.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("emailLogs", () => db.emailLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] } }))
  await step("notifications", () => db.notification.deleteMany({ where: { userId: { in: userIds } } }))
  await step("signatureRequests", () => db.documentSignatureRequest.deleteMany({ where: { organizationId: orgId } }))
  await step("signatures", () => db.documentSignature.deleteMany({ where: { organizationId: orgId } }))
  await step("generatedDocuments", () => db.generatedDocument.deleteMany({ where: { organizationId: orgId } }))
  await step("storedFiles", () => db.storedFile.deleteMany({ where: { organizationId: orgId } }))
  await step("cashTransactions", () => db.cashTransaction.deleteMany({ where: { account: { organizationId: orgId } } }))
  await step("cashAccounts", () => db.cashAccount.deleteMany({ where: { organizationId: orgId } }))
  await step("contracts", () => db.contract.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("tenantSpaces", () => db.tenantSpace.deleteMany({ where: { tenantId: { in: tenantIds } } }))
  await step("expenses", () => db.expense.deleteMany({ where: { buildingId: { in: buildingIds } } }))
  await step("leads", () => db.lead.deleteMany({ where: { buildingId: { in: buildingIds } } }))
  await step("tasks", () => db.task.deleteMany({ where: { buildingId: { in: buildingIds } } }))
  await step("tenants", () => db.tenant.deleteMany({ where: { id: { in: tenantIds } } }))
  await step("spaces", () => db.space.deleteMany({ where: { floorId: { in: floorIds } } }))
  await step("floors", () => db.floor.deleteMany({ where: { id: { in: floorIds } } }))
  await step("buildings", () => db.building.deleteMany({ where: { id: { in: buildingIds } } }))
  // Пользователи-арендаторы демо удаляются; владелец демо остаётся (upsert при seed).
  await step("tenantUsers", () => db.user.deleteMany({ where: { organizationId: orgId, email: { not: DEMO_EMAIL } } }))
}

/** Случайный «казахстанский» телефон — телефоны уникальны в БД, а старые могли остаться soft-deleted. */
function randomPhone(): string {
  let digits = ""
  for (let i = 0; i < 9; i++) digits += Math.floor(Math.random() * 10)
  return `+7 7${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)}${digits.slice(7, 9)}`
}

const periodOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

async function seedDemoOrg(): Promise<{ orgId: string }> {
  const now = new Date()
  const period = periodOf(now)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const passwordHash = await bcrypt.hash(demoPassword(), 10)

  // Максимальный тариф — чтобы в демо были видны все фичи (аналитика, рассылки, автодокументы).
  const topPlan = await db.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "desc" }, select: { id: true } }).catch(() => null)

  const org = await db.organization.upsert({
    where: { slug: DEMO_SLUG },
    update: {
      isActive: true,
      isSuspended: false,
      approvalStatus: "APPROVED",
      planId: topPlan?.id ?? null,
      planExpiresAt: new Date(now.getTime() + 365 * 86_400_000),
    },
    create: {
      slug: DEMO_SLUG,
      name: "Демо: БЦ «Алатау»",
      legalType: "IP",
      legalName: "ИП «Алатау Демо»",
      iin: "880101300123",
      directorName: "Демеуов Алихан Серикович",
      directorPosition: "Директор",
      legalAddress: "РК, г. Алматы, пр. Абая 150",
      bankName: "АО «Kaspi Bank»",
      iik: "KZ00000000000000DEMO",
      bik: "CASPKZKA",
      phone: "+7 700 000 0000",
      email: "demo@commrent.kz",
      isActive: true,
      approvalStatus: "APPROVED",
      planId: topPlan?.id ?? null,
      planExpiresAt: new Date(now.getTime() + 365 * 86_400_000),
    },
    select: { id: true },
  })

  const owner = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      password: passwordHash,
      role: "OWNER",
      organizationId: org.id,
      isActive: true,
      deletedAt: null,
      approvalStatus: "APPROVED",
      mustChangePassword: false,
      emailVerifiedAt: now,
      totpSecret: null,
      totpEnabledAt: null,
    },
    create: {
      name: "Демеуов Алихан",
      email: DEMO_EMAIL,
      phone: randomPhone(),
      password: passwordHash,
      role: "OWNER",
      organizationId: org.id,
      approvalStatus: "APPROVED",
      mustChangePassword: false,
      emailVerifiedAt: now,
    },
    select: { id: true },
  })
  await db.organization.update({ where: { id: org.id }, data: { ownerUserId: owner.id } })

  // ── Здание: 2 этажа + территория ──────────────────────────────
  const building = await db.building.create({
    data: {
      organizationId: org.id,
      name: "БЦ «Алатау»",
      address: "г. Алматы, пр. Абая 150",
      contractPrefix: "АЛТ",
      serviceFeeWinterRate: 600,
      serviceFeeSummerRate: 400,
    },
    select: { id: true },
  })
  const floor1 = await db.floor.create({ data: { buildingId: building.id, number: 1, name: "1 этаж", ratePerSqm: 5000, totalArea: 320 }, select: { id: true } })
  const floor2 = await db.floor.create({ data: { buildingId: building.id, number: 2, name: "2 этаж", ratePerSqm: 4200, totalArea: 320 }, select: { id: true } })
  const territory = await db.floor.create({ data: { buildingId: building.id, number: 0, name: "Территория / двор", kind: "TERRITORY", ratePerSqm: 1500, totalArea: 400 }, select: { id: true } })

  const mkSpace = (floorId: string, number: string, area: number, kind = "RENTABLE") =>
    db.space.create({ data: { floorId, number, area, kind, status: "VACANT" }, select: { id: true } })
  const s101 = await mkSpace(floor1.id, "101", 48)
  const s102 = await mkSpace(floor1.id, "102", 35)
  await mkSpace(floor1.id, "103", 62) // свободное — для демонстрации «Заселить» с плана
  await mkSpace(floor1.id, "Холл", 40, "COMMON")
  const s201 = await mkSpace(floor2.id, "201", 55)
  const s202 = await mkSpace(floor2.id, "202", 28)
  await mkSpace(floor2.id, "203", 44)
  await mkSpace(floor2.id, "Коридор", 35, "COMMON")
  const p1 = await mkSpace(territory.id, "Паркинг P1-P10", 250)
  await mkSpace(territory.id, "Площадка под павильон", 80)

  // ── Арендаторы с разными сценариями ───────────────────────────
  async function mkTenant(opts: {
    company: string
    person: string
    legalType: string
    bin?: string
    iin?: string
    spaceId?: string
    usePurpose: string
    deposit?: number
    contractMonthsAgo: number
    contractMonthsLeft: number
  }) {
    const user = await db.user.create({
      data: {
        name: opts.person,
        phone: randomPhone(),
        password: passwordHash,
        role: "TENANT",
        organizationId: org.id,
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    })
    const start = new Date(now.getFullYear(), now.getMonth() - opts.contractMonthsAgo, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + opts.contractMonthsLeft, 0)
    const tenant = await db.tenant.create({
      data: {
        userId: user.id,
        spaceId: opts.spaceId ?? null,
        companyName: opts.company,
        legalType: opts.legalType,
        bin: opts.bin ?? null,
        iin: opts.iin ?? null,
        usePurpose: opts.usePurpose,
        legalAddress: "г. Алматы, пр. Абая 150",
        contractStart: start,
        contractEnd: end,
        depositAmount: opts.deposit ?? null,
        paymentDueDay: 10,
      },
      select: { id: true },
    })
    if (opts.spaceId) {
      await db.tenantSpace.create({ data: { tenantId: tenant.id, spaceId: opts.spaceId, isPrimary: true } })
      await db.space.update({ where: { id: opts.spaceId }, data: { status: "OCCUPIED" } })
    }
    return { tenantId: tenant.id, userId: user.id, start, end }
  }

  const coffee = await mkTenant({
    company: "ТОО «Кофейня Арман»", person: "Арман Бекенов", legalType: "TOO", bin: "200140012345",
    spaceId: s101.id, usePurpose: "кофейня", deposit: 240000, contractMonthsAgo: 8, contractMonthsLeft: 4,
  })
  const salon = await mkTenant({
    company: "ИП «Салон Айгерим»", person: "Айгерим Сапарова", legalType: "IP", iin: "920505400789",
    spaceId: s102.id, usePurpose: "салон красоты", contractMonthsAgo: 5, contractMonthsLeft: 7,
  })
  const ithub = await mkTenant({
    company: "ТОО «IT-Hub Almaty»", person: "Тимур Жаксылыков", legalType: "TOO", bin: "210840098765",
    spaceId: s201.id, usePurpose: "офис разработки", contractMonthsAgo: 0, contractMonthsLeft: 12,
  })
  const lawyer = await mkTenant({
    company: "Адвокат Нурланов К.", person: "Нурланов Куаныш", legalType: "ADVOKAT", iin: "850707300321",
    spaceId: s202.id, usePurpose: "адвокатский кабинет", contractMonthsAgo: 3, contractMonthsLeft: 9,
  })
  const parking = await mkTenant({
    company: "ТОО «CityPark Паркинг»", person: "Диас Оспанов", legalType: "TOO", bin: "190340054321",
    spaceId: p1.id, usePurpose: "платный паркинг", contractMonthsAgo: 12, contractMonthsLeft: 12,
  })
  // Без договора и помещения — для демонстрации правил («документы только по договору»).
  await mkTenant({
    company: "ИП «Новичок Демо»", person: "Самат Ержанов", legalType: "IP", iin: "990303500111",
    usePurpose: "запрос на аренду", contractMonthsAgo: 0, contractMonthsLeft: 0,
  })

  // ── Договоры ──────────────────────────────────────────────────
  const token = () => Array.from({ length: 48 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")
  async function mkContract(t: { tenantId: string; start: Date; end: Date }, number: string, company: string, status: string) {
    return db.contract.create({
      data: {
        tenantId: t.tenantId,
        number,
        type: "STANDARD",
        content: `Договор аренды нежилого помещения № ${number}\n\nАрендодатель: ИП «Алатау Демо»\nАрендатор: ${company}\nСрок: ${t.start.toLocaleDateString("ru-RU")} — ${t.end.toLocaleDateString("ru-RU")}\n\n(Демо-данные: текст сокращён)`,
        status,
        signToken: token(),
        startDate: t.start,
        endDate: t.end,
        ...(status === "SIGNED" ? { signedAt: t.start, signedByLandlordAt: t.start, signedByTenantAt: t.start } : { sentAt: now }),
      },
      select: { id: true },
    })
  }
  const cCoffee = await mkContract(coffee, "АЛТ-001", "ТОО «Кофейня Арман»", "SIGNED")
  const cSalon = await mkContract(salon, "АЛТ-002", "ИП «Салон Айгерим»", "SIGNED")
  await mkContract(ithub, "АЛТ-003", "ТОО «IT-Hub Almaty»", "SENT") // ждёт подписи — видно напоминания
  const cLawyer = await mkContract(lawyer, "АЛТ-004", "Адвокат Нурланов К.", "SIGNED")
  const cParking = await mkContract(parking, "АЛТ-005", "ТОО «CityPark Паркинг»", "SIGNED")

  // ── Начисления и платежи: оплачено / долг / просрочка / депозит ──
  const due = new Date(now.getFullYear(), now.getMonth(), 10)
  const mkCharge = (tenantId: string, contractId: string | null, type: string, amount: number, isPaid: boolean, dueDate: Date, description: string, p = period) =>
    db.charge.create({ data: { tenantId, contractId, period: p, type, amount, isPaid, dueDate, description } })

  // Кофейня: всё оплачено, депозит внесён.
  await mkCharge(coffee.tenantId, cCoffee.id, "DEPOSIT", 240000, true, coffee.start, "Гарантийный депозит по договору № АЛТ-001", periodOf(coffee.start))
  await mkCharge(coffee.tenantId, cCoffee.id, "RENT", 240000, true, due, `Аренда помещения 101 за ${period}`)
  await mkCharge(coffee.tenantId, cCoffee.id, "SERVICE_FEE", 28800, true, due, `Эксплуатационный сбор за ${period}`)
  await db.payment.create({ data: { tenantId: coffee.tenantId, amount: 268800, method: "KASPI", paymentDate: new Date(now.getFullYear(), now.getMonth(), 5), note: `Аренда + экспл. сбор за ${period}` } })

  // Салон: долг и просрочка (видно пени, напоминания, топ должников).
  const prevPeriod = periodOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  await mkCharge(salon.tenantId, cSalon.id, "RENT", 175000, false, new Date(now.getFullYear(), now.getMonth() - 1, 10), `Аренда помещения 102 за ${prevPeriod}`, prevPeriod)
  await mkCharge(salon.tenantId, cSalon.id, "RENT", 175000, false, due, `Аренда помещения 102 за ${period}`)
  await mkCharge(salon.tenantId, cSalon.id, "DEPOSIT", 175000, false, salon.start, "Гарантийный депозит по договору № АЛТ-002", periodOf(salon.start))

  // Адвокат: оплатил с переплатой (виден аванс).
  await mkCharge(lawyer.tenantId, cLawyer.id, "RENT", 117600, true, due, `Аренда помещения 202 за ${period}`)
  await db.payment.create({ data: { tenantId: lawyer.tenantId, amount: 150000, method: "TRANSFER", paymentDate: new Date(now.getFullYear(), now.getMonth(), 3), note: "Оплата с авансом", unappliedAmount: 32400 } })

  // Паркинг: оплачен.
  await mkCharge(parking.tenantId, cParking.id, "RENT", 375000, true, due, `Аренда паркинга за ${period}`)
  await db.payment.create({ data: { tenantId: parking.tenantId, amount: 375000, method: "TRANSFER", paymentDate: new Date(now.getFullYear(), now.getMonth(), 2) } })

  // История платежей с начала года — чтобы графики не пустовали.
  for (let m = 0; m < now.getMonth(); m++) {
    const d = new Date(now.getFullYear(), m, 7)
    if (d < yearStart) continue
    await db.payment.create({ data: { tenantId: coffee.tenantId, amount: 268800, method: "KASPI", paymentDate: d, note: `Аренда за ${periodOf(d)}` } })
    await db.payment.create({ data: { tenantId: parking.tenantId, amount: 375000, method: "TRANSFER", paymentDate: d } })
  }

  // Заявка от арендатора — чтобы раздел «Заявки» не был пуст.
  await step("seed request", () => db.request.create({
    data: {
      tenantId: salon.tenantId,
      userId: salon.userId,
      title: "Не работает кондиционер",
      description: "В помещении 102 не охлаждает кондиционер, просим мастера.",
      type: "TECHNICAL",
      status: "NEW",
      priority: "HIGH",
    },
  }))

  console.log(`[demo] организация наполнена: org=${org.id}`)
  return { orgId: org.id }
}
