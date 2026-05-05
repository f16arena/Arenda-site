import "server-only"

import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"

export type OnboardingStepCategory = "setup" | "people" | "legal" | "finance"

export type OnboardingStep = {
  key: string
  title: string
  description: string
  href: string
  category: OnboardingStepCategory
  done: boolean
  countLabel?: string
}

export type OnboardingState = {
  steps: OnboardingStep[]
  doneCount: number
  totalCount: number
  percent: number
  allDone: boolean
  nextStep: OnboardingStep | null
}

export async function getOnboardingState(orgId: string): Promise<OnboardingState> {
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin", orgId })

  const buildings = await safe(
    "onboarding.buildings",
    db.building.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        administratorUserId: true,
        contractPrefix: true,
        invoicePrefix: true,
        actPrefix: true,
      },
    }),
    [] as Array<{
    id: string
    administratorUserId: string | null
    contractPrefix: string | null
    invoicePrefix: string | null
    actPrefix: string | null
  }>,
  )

  const buildingIds = buildings.map((building) => building.id)
  const buildingScope = { buildingId: { in: buildingIds } }
  const tenantOrgScope = { user: { organizationId: orgId } }

  const [
    floorCount,
    rentableSpaceCount,
    pricedFloorCount,
    tenantCount,
    tenantWithContactCount,
    cashAccountCount,
    contractCount,
    signedContractCount,
    chargeCount,
    paymentCount,
  ] = await Promise.all([
    safe("onboarding.floorCount", db.floor.count({ where: buildingScope }), 0),
    safe(
      "onboarding.rentableSpaceCount",
      db.space.count({
        where: {
          kind: "RENTABLE",
          floor: { buildingId: { in: buildingIds } },
        },
      }),
      0,
    ),
    safe(
      "onboarding.pricedFloorCount",
      db.floor.count({
        where: {
          ...buildingScope,
          OR: [
            { ratePerSqm: { gt: 0 } },
            { fixedMonthlyRent: { gt: 0 } },
          ],
        },
      }),
      0,
    ),
    safe("onboarding.tenantCount", db.tenant.count({ where: tenantOrgScope }), 0),
    safe(
      "onboarding.tenantWithContactCount",
      db.tenant.count({
        where: {
          ...tenantOrgScope,
          OR: [
            { user: { phone: { not: null } } },
            { user: { email: { not: null } } },
          ],
        },
      }),
      0,
    ),
    safe(
      "onboarding.cashAccountCount",
      db.cashAccount.count({
        where: { organizationId: orgId, isActive: true },
      }),
      0,
    ),
    safe("onboarding.contractCount", db.contract.count({ where: { tenant: tenantOrgScope } }), 0),
    safe("onboarding.signedContractCount", db.contract.count({ where: { tenant: tenantOrgScope, status: "SIGNED" } }), 0),
    safe("onboarding.chargeCount", db.charge.count({ where: { tenant: tenantOrgScope } }), 0),
    safe("onboarding.paymentCount", db.payment.count({ where: { tenant: tenantOrgScope } }), 0),
  ])

  const buildingsWithAdmin = buildings.filter((building) => !!building.administratorUserId).length
  const buildingsWithNumbering = buildings.filter((building) =>
    !!building.contractPrefix || !!building.invoicePrefix || !!building.actPrefix
  ).length

  const steps: OnboardingStep[] = [
    {
      key: "building",
      title: "Добавить первое здание",
      description: "Это основа всей структуры: финансы, помещения, заявки и документы привязываются к зданию.",
      href: "/admin/buildings",
      category: "setup",
      done: buildings.length > 0,
      countLabel: buildings.length > 0 ? `${buildings.length} здан.` : undefined,
    },
    {
      key: "floors",
      title: "Настроить этажи",
      description: "Этажи нужны, чтобы разделять помещения, ставки и доступ администраторов.",
      href: "/admin/buildings",
      category: "setup",
      done: floorCount > 0,
      countLabel: floorCount > 0 ? `${floorCount} эт.` : undefined,
    },
    {
      key: "spaces",
      title: "Создать помещения",
      description: "Помещения дают точную заполняемость, арендаторов, счетчики и расчет аренды.",
      href: "/admin/spaces",
      category: "setup",
      done: rentableSpaceCount > 0,
      countLabel: rentableSpaceCount > 0 ? `${rentableSpaceCount} пом.` : undefined,
    },
    {
      key: "rates",
      title: "Указать ставки аренды",
      description: "Без ставок или фиксированной аренды система не сможет надежно считать месячный доход.",
      href: "/admin/settings",
      category: "finance",
      done: pricedFloorCount > 0,
      countLabel: pricedFloorCount > 0 ? `${pricedFloorCount} эт.` : undefined,
    },
    {
      key: "administrator",
      title: "Назначить администратора здания",
      description: "Арендаторы должны общаться с администратором, а владелец видеть контроль сверху.",
      href: "/admin/staff",
      category: "people",
      done: buildings.length > 0 && buildingsWithAdmin === buildings.length,
      countLabel: buildings.length > 0 ? `${buildingsWithAdmin}/${buildings.length}` : undefined,
    },
    {
      key: "tenants",
      title: "Добавить арендаторов",
      description: "Можно внести вручную или импортировать Excel-шаблоном.",
      href: "/admin/import/tenants",
      category: "people",
      done: tenantCount > 0,
      countLabel: tenantCount > 0 ? `${tenantCount} аренд.` : undefined,
    },
    {
      key: "contacts",
      title: "Проверить контакты арендаторов",
      description: "Телефон или email нужен для кабинета, уведомлений, счетов и подписания.",
      href: "/admin/data-quality",
      category: "people",
      done: tenantCount > 0 && tenantWithContactCount === tenantCount,
      countLabel: tenantCount > 0 ? `${tenantWithContactCount}/${tenantCount}` : undefined,
    },
    {
      key: "cash-account",
      title: "Добавить счет или кассу",
      description: "Платежи и сверка будут понятнее, если есть активный денежный счет.",
      href: "/admin/finances/balance",
      category: "finance",
      done: cashAccountCount > 0,
      countLabel: cashAccountCount > 0 ? `${cashAccountCount} счет.` : undefined,
    },
    {
      key: "document-numbering",
      title: "Настроить номера документов",
      description: "Префиксы договоров, счетов и актов защищают от хаоса в документообороте.",
      href: "/admin/settings",
      category: "legal",
      done: buildings.length > 0 && buildingsWithNumbering === buildings.length,
      countLabel: buildings.length > 0 ? `${buildingsWithNumbering}/${buildings.length}` : undefined,
    },
    {
      key: "contract",
      title: "Создать и подписать договор",
      description: "Юридический контур должен подтверждать аренду и будущие изменения условий.",
      href: "/admin/documents/templates/rental",
      category: "legal",
      done: signedContractCount > 0,
      countLabel: contractCount > 0 ? `${signedContractCount}/${contractCount} подпис.` : undefined,
    },
    {
      key: "billing",
      title: "Сформировать первое начисление",
      description: "После начисления становится виден долг, срок оплаты и финансовая дисциплина.",
      href: "/admin/finances",
      category: "finance",
      done: chargeCount > 0,
      countLabel: chargeCount > 0 ? `${chargeCount} начисл.` : undefined,
    },
    {
      key: "payment",
      title: "Принять первый платеж",
      description: "Платеж закрывает долг и показывает владельцу реальный денежный поток.",
      href: "/admin/finances",
      category: "finance",
      done: paymentCount > 0,
      countLabel: paymentCount > 0 ? `${paymentCount} плат.` : undefined,
    },
  ]

  const doneCount = steps.filter((step) => step.done).length
  const totalCount = steps.length
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return {
    steps,
    doneCount,
    totalCount,
    percent,
    allDone: doneCount === totalCount,
    nextStep: steps.find((step) => !step.done) ?? null,
  }
}
