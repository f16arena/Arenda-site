/**
 * Smoke E2E для v3 Launch Kit:
 *   1. Бутстрап: фикс singleton FoundersProgramState (totalSlots=15, isActive=true).
 *   2. Создание двух тест-орг и владельцев.
 *   3. Резерв Founders-слота → проверка инкремента takenSlots + flags на org.
 *   4. calculatePrice по всем 5 планам × 5 периодам × (founders/нет) — sanity-проверка
 *      математики (без отрицательных, с применённым cap=50%).
 *   5. Заявка на аддон (org A, BUILDING_PRO) — создан OrganizationAddon(isActive=false).
 *   6. Активация аддона — isActive=true; уведомление owner-у.
 *   7. Отзыв Founders-слота → декремент takenSlots, сбрасываются flags.
 *   8. Симуляция cron: org B → suspended + updatedAt = -61д → releaseFoundersSlotIfExpired
 *      возвращает true (если orgB вступил), takenSlots декрементируется.
 *   9. Cleanup в finally (delete всё созданное по slug-prefix).
 *
 * Guard-флаги — те же, что у e2e-isolation:
 *   RUN_E2E_V3=1  — обязательный
 *   E2E_ALLOW_DB_WRITE=1  — обязательный
 *   E2E_DATABASE_URL=...  — отдельный URL (отличается от DATABASE_URL, кроме E2E_ALLOW_PRODUCTION_URL=1)
 */
import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

const RUN_FLAG = "RUN_E2E_V3"
const WRITE_FLAG = "E2E_ALLOW_DB_WRITE"
const URL_ENV = "E2E_DATABASE_URL"

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertSafeDatabaseUrl(e2eDatabaseUrl: string) {
  if (process.env[WRITE_FLAG] !== "1") {
    throw new Error(`${WRITE_FLAG}=1 is required because this test writes and cleans up records`)
  }
  const applicationUrl = process.env.DATABASE_URL
  if (
    applicationUrl &&
    e2eDatabaseUrl === applicationUrl &&
    process.env.E2E_ALLOW_PRODUCTION_URL !== "1"
  ) {
    throw new Error(
      `${URL_ENV} matches DATABASE_URL. Use staging, or set E2E_ALLOW_PRODUCTION_URL=1 intentionally.`,
    )
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`)
}

function digits(stamp: string, len: number) {
  return stamp.replace(/[^0-9]/g, "").padEnd(len, "0").slice(0, len)
}

async function main() {
  if (process.env[RUN_FLAG] !== "1") {
    console.log(`[e2e-v3] skipped: set ${RUN_FLAG}=1 to run against staging`)
    return
  }
  const databaseUrl = requireEnv(URL_ENV)
  assertSafeDatabaseUrl(databaseUrl)
  process.env.DATABASE_URL = databaseUrl

  const [{ db }, { calculatePrice, tryReserveFoundersSlot, releaseFoundersSlotIfExpired }, { ADDON_CATALOG }] = await Promise.all([
    import("../lib/db"),
    import("../lib/pricing"),
    import("../lib/addons-catalog"),
  ])

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const createdOrgIds: string[] = []
  const createdUserIds: string[] = []
  const createdAddonIds: string[] = []

  console.log(`[e2e-v3] run id=${stamp}`)

  try {
    // ── 1. Бутстрап singleton ────────────────────────────────────────────────
    const stateBefore = await db.foundersProgramState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", totalSlots: 15, discountPct: 40, isActive: true },
      update: {},
    })
    console.log(`[1] FoundersProgramState: taken=${stateBefore.takenSlots}/${stateBefore.totalSlots}, active=${stateBefore.isActive}`)

    const plans = await db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })
    const periods = await db.billingPeriod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })
    expect(plans.length >= 4, `Ожидалось ≥4 плана, получено ${plans.length} (есть ли seed v3?)`)
    expect(periods.length >= 4, `Ожидалось ≥4 периода, получено ${periods.length}`)
    const paidPlan = plans.find((p) => p.code === "PRO") ?? plans.find((p) => p.priceMonthly > 0)
    expect(paidPlan, "Не найден платный план для теста")

    // ── 2. Создаём две орг + владельцев ──────────────────────────────────────
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: { name: `E2E V3 A ${stamp}`, slug: `e2e-v3-a-${stamp}`, planId: paidPlan.id },
      }),
      db.organization.create({
        data: { name: `E2E V3 B ${stamp}`, slug: `e2e-v3-b-${stamp}`, planId: paidPlan.id },
      }),
    ])
    createdOrgIds.push(orgA.id, orgB.id)

    const [ownerA, ownerB] = await Promise.all([
      db.user.create({
        data: {
          name: "E2E V3 Owner A",
          email: `e2e-v3-a-${stamp}@example.test`,
          phone: `+7702${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "OWNER",
          organizationId: orgA.id,
          isPlatformOwner: false,
        },
      }),
      db.user.create({
        data: {
          name: "E2E V3 Owner B",
          email: `e2e-v3-b-${stamp}@example.test`,
          phone: `+7703${digits(stamp, 7)}`,
          password: "e2e-not-a-real-password",
          role: "OWNER",
          organizationId: orgB.id,
          isPlatformOwner: false,
        },
      }),
    ])
    createdUserIds.push(ownerA.id, ownerB.id)
    await Promise.all([
      db.organization.update({ where: { id: orgA.id }, data: { ownerUserId: ownerA.id } }),
      db.organization.update({ where: { id: orgB.id }, data: { ownerUserId: ownerB.id } }),
    ])
    console.log(`[2] orgA=${orgA.slug}, orgB=${orgB.slug}, plan=${paidPlan.code}`)

    // ── 3. Резерв Founders для orgA ──────────────────────────────────────────
    const r1 = await tryReserveFoundersSlot(orgA.id)
    expect(r1.success, `Founders reserve failed: ${r1.reason}`)
    expect(typeof r1.slotNumber === "number" && r1.slotNumber > 0, `slotNumber должно быть >0, получено ${r1.slotNumber}`)

    const orgAAfter = await db.organization.findUnique({
      where: { id: orgA.id },
      select: { isFoundersMember: true, foundersLockedPct: true, foundersSlotNumber: true, foundersJoinedAt: true },
    })
    expect(orgAAfter?.isFoundersMember, "orgA должен стать Founders")
    expect((orgAAfter?.foundersLockedPct ?? 0) >= 1, "foundersLockedPct должен быть выставлен")
    expect(orgAAfter?.foundersSlotNumber === r1.slotNumber, "foundersSlotNumber должен совпадать с slotNumber из reserve")
    expect(orgAAfter?.foundersJoinedAt instanceof Date, "foundersJoinedAt должен быть Date")
    console.log(`[3] Founders reserve orgA: #${r1.slotNumber}, locked=${orgAAfter?.foundersLockedPct}%`)

    const stateAfterReserve = await db.foundersProgramState.findUnique({ where: { id: "singleton" } })
    expect(
      (stateAfterReserve?.takenSlots ?? 0) === stateBefore.takenSlots + 1,
      `takenSlots должен инкрементироваться: было ${stateBefore.takenSlots}, стало ${stateAfterReserve?.takenSlots}`,
    )

    // Повторный reserve того же — должен отказать
    const r1dup = await tryReserveFoundersSlot(orgA.id)
    expect(!r1dup.success, "Повторный reserve orgA должен отказать")
    console.log(`[3] Повторный reserve orgA отклонён: «${r1dup.reason}» (корректно)`)

    // ── 4. calculatePrice по всем платным планам × периодам ─────────────────
    const paidPlans = plans.filter((p) => p.priceMonthly > 0)
    let priceChecks = 0
    for (const plan of paidPlans) {
      for (const period of periods) {
        for (const founders of [false, true]) {
          const r = await calculatePrice({
            planCode: plan.code,
            billingPeriodCode: period.code,
            isFoundersMember: founders,
            foundersLockedPct: founders ? (plan.foundersDiscountPct ?? 40) : undefined,
          })
          expect(r.pricePerMonth > 0, `pricePerMonth должен быть >0 для ${plan.code}/${period.code}/founders=${founders}`)
          expect(r.totalPriceFinal > 0, `totalPriceFinal должен быть >0`)
          expect(r.totalPriceFinal <= r.totalBeforeDiscount, `totalPriceFinal не может быть больше totalBeforeDiscount`)
          expect(r.appliedDiscountPct <= (plan.discountStackCapPct ?? 50), `appliedDiscountPct ${r.appliedDiscountPct}% не должен превышать cap ${plan.discountStackCapPct}%`)
          expect(r.appliedDiscountPct >= 0, `appliedDiscountPct должен быть ≥0`)
          if (founders) {
            // Стэк = period% + founders%; cap = plan.discountStackCapPct
            const expected = Math.min(r.periodDiscountPct + r.foundersDiscountPct, plan.discountStackCapPct ?? 50)
            expect(r.appliedDiscountPct === expected, `Cap не применился корректно для ${plan.code}/${period.code}: ${r.appliedDiscountPct}% vs ожидание ${expected}%`)
          }
          priceChecks++
        }
      }
    }
    console.log(`[4] calculatePrice: ${priceChecks} комбинаций, все корректны (cap соблюдён)`)

    // ── 5. Заявка на аддон (orgA, BUILDING_PRO) ──────────────────────────────
    const addonItem = ADDON_CATALOG.find((a) => a.code === "BUILDING_PRO")
    expect(addonItem, "В каталоге должен быть BUILDING_PRO")
    const addon = await db.organizationAddon.create({
      data: {
        organizationId: orgA.id,
        addonCode: addonItem.code,
        quantity: 2,
        priceMonthly: addonItem.priceMonthly,
        isActive: false,
        notes: "E2E-заявка",
      },
    })
    createdAddonIds.push(addon.id)
    expect(addon.isActive === false, "Заявка должна быть isActive=false")
    console.log(`[5] Заявка на аддон создана: ${addon.id} (${addonItem.label} × 2)`)

    // ── 6. Активация аддона ──────────────────────────────────────────────────
    const activated = await db.organizationAddon.update({
      where: { id: addon.id },
      data: { isActive: true, expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) },
    })
    expect(activated.isActive === true, "После активации isActive=true")
    expect(activated.expiresAt instanceof Date, "expiresAt установлен")
    console.log(`[6] Аддон активирован, expiresAt=${activated.expiresAt?.toISOString().slice(0, 10)}`)

    // ── 7. Отзыв Founders-слота у orgA ───────────────────────────────────────
    const releasedManual = await db.$transaction(async (tx) => {
      const state = await tx.foundersProgramState.findUnique({ where: { id: "singleton" } })
      await tx.foundersProgramState.update({
        where: { id: "singleton" },
        data: { takenSlots: { decrement: 1 } },
      })
      await tx.organization.update({
        where: { id: orgA.id },
        data: { isFoundersMember: false, foundersLockedPct: 0, foundersSlotNumber: null },
      })
      return state?.takenSlots ?? 0
    })

    const stateAfterRelease = await db.foundersProgramState.findUnique({ where: { id: "singleton" } })
    expect(
      (stateAfterRelease?.takenSlots ?? 0) === releasedManual - 1,
      `takenSlots должен декрементироваться: было ${releasedManual}, стало ${stateAfterRelease?.takenSlots}`,
    )
    const orgAReleased = await db.organization.findUnique({
      where: { id: orgA.id },
      select: { isFoundersMember: true, foundersSlotNumber: true },
    })
    expect(!orgAReleased?.isFoundersMember, "isFoundersMember=false после release")
    expect(orgAReleased?.foundersSlotNumber === null, "foundersSlotNumber=null после release")
    console.log(`[7] Founders-слот отозван, флаги сброшены`)

    // ── 8. Cron-симуляция: orgB вступает, suspended 61д, cron освобождает ────
    const r2 = await tryReserveFoundersSlot(orgB.id)
    expect(r2.success, `Founders reserve B failed: ${r2.reason}`)
    console.log(`[8a] Founders reserve orgB: #${r2.slotNumber}`)

    // Эмулируем, что org "висит" suspended 61 день
    const sixtyOneDaysAgo = new Date(Date.now() - 61 * 24 * 3600 * 1000)
    await db.organization.update({
      where: { id: orgB.id },
      data: { isSuspended: true, updatedAt: sixtyOneDaysAgo },
    })
    const released = await releaseFoundersSlotIfExpired(orgB.id, 61)
    expect(released === true, "releaseFoundersSlotIfExpired должен вернуть true для 61д suspended")
    const orgBReleased = await db.organization.findUnique({
      where: { id: orgB.id },
      select: { isFoundersMember: true },
    })
    expect(!orgBReleased?.isFoundersMember, "orgB.isFoundersMember=false после cron-релиза")
    console.log(`[8b] Cron-симуляция: orgB освобождён через releaseFoundersSlotIfExpired`)

    console.log(`\n✅ Все Phase 6 smoke-проверки пройдены успешно.`)
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log(`\n[cleanup] удаляю ${createdAddonIds.length} addon, ${createdUserIds.length} user, ${createdOrgIds.length} org`)
    try {
      if (createdAddonIds.length) {
        await db.organizationAddon.deleteMany({ where: { id: { in: createdAddonIds } } })
      }
      if (createdUserIds.length) {
        await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
      }
      if (createdOrgIds.length) {
        // Снимаем ownerUserId перед удалением (FK).
        await db.organization.updateMany({ where: { id: { in: createdOrgIds } }, data: { ownerUserId: null } })
        await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
      }
    } catch (e) {
      console.error(`[cleanup] error:`, e)
    }
  }
}

main()
  .catch((e) => {
    console.error(`[e2e-v3] FAILED:`, e)
    process.exit(1)
  })
  .then(() => process.exit(0))
