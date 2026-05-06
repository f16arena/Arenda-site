import "server-only"

import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"

export type OnboardingStepCategory = "foundation" | "object" | "people" | "legal" | "finance"

export type OnboardingStep = {
  key: string
  title: string
  description: string
  href: string
  category: OnboardingStepCategory
  done: boolean
  required: boolean
  actionLabel: string
  outcome: string
  countLabel?: string
}

export type OnboardingState = {
  steps: OnboardingStep[]
  doneCount: number
  totalCount: number
  requiredCount: number
  doneRequiredCount: number
  recommendedCount: number
  doneRecommendedCount: number
  percent: number
  allDone: boolean
  nextStep: OnboardingStep | null
  nextRequiredStep: OnboardingStep | null
}

export async function getOnboardingState(orgId: string): Promise<OnboardingState> {
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/onboarding", orgId })

  const [organization, buildings, activeTemplates] = await Promise.all([
    safe(
      "onboarding.organization",
      db.organization.findUnique({
        where: { id: orgId },
        select: {
          legalType: true,
          legalName: true,
          shortName: true,
          bin: true,
          iin: true,
          directorName: true,
          directorPosition: true,
          basis: true,
          legalAddress: true,
          actualAddress: true,
          bankName: true,
          iik: true,
          bik: true,
          phone: true,
          email: true,
          isVatPayer: true,
          vatRate: true,
        },
      }),
      null as {
        legalType: string | null
        legalName: string | null
        shortName: string | null
        bin: string | null
        iin: string | null
        directorName: string | null
        directorPosition: string | null
        basis: string | null
        legalAddress: string | null
        actualAddress: string | null
        bankName: string | null
        iik: string | null
        bik: string | null
        phone: string | null
        email: string | null
        isVatPayer: boolean
        vatRate: number
      } | null,
    ),
    safe(
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
    ),
    safe(
      "onboarding.activeTemplates",
      db.documentTemplate.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { documentType: true, format: true },
      }),
      [] as Array<{ documentType: string; format: string }>,
    ),
  ])

  const buildingIds = buildings.map((building) => building.id)
  const buildingScope = { buildingId: { in: buildingIds } }
  const tenantOrgScope = { user: { organizationId: orgId } }
  const activeTemplateTypes = new Set(activeTemplates.map((template) => template.documentType))

  const [
    floorCount,
    rentableSpaceCount,
    pricedFloorCount,
    tariffCount,
    tenantCount,
    tenantWithContactCount,
    cashAccountCount,
    contractCount,
    signedContractCount,
    chargeCount,
    paymentCount,
    staffCount,
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
    safe(
      "onboarding.tariffCount",
      db.tariff.count({ where: { buildingId: { in: buildingIds }, isActive: true } }),
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
    safe(
      "onboarding.staffCount",
      db.user.count({
        where: {
          organizationId: orgId,
          isActive: true,
          role: { in: ["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"] },
        },
      }),
      0,
    ),
  ])

  const orgRequisitesReady = isOrganizationRequisitesReady(organization)
  const orgPaymentDetailsReady = isOrganizationPaymentDetailsReady(organization)
  const buildingsWithAdmin = buildings.filter((building) => !!building.administratorUserId).length
  const buildingsWithNumbering = buildings.filter((building) =>
    !!building.contractPrefix || !!building.invoicePrefix || !!building.actPrefix
  ).length
  const hasContractTemplate = activeTemplateTypes.has("CONTRACT")
  const hasAnyDocumentTemplate = activeTemplateTypes.size > 0

  const steps: OnboardingStep[] = [
    {
      key: "requisites",
      title: "Заполнить реквизиты арендодателя",
      description: "ИП/ТОО, ИИН/БИН, директор, основание действия, адрес, телефон, email и банк нужны для договоров, счетов и оплаты.",
      href: "/admin/settings#organization-requisites",
      category: "foundation",
      done: orgRequisitesReady,
      required: true,
      actionLabel: "Заполнить реквизиты",
      outcome: "Документы и экран оплаты будут формироваться с правильными данными владельца.",
      countLabel: orgRequisitesReady ? "готово" : "обязательно",
    },
    {
      key: "building",
      title: "Добавить первое здание",
      description: "Здание задает точку учета: помещения, арендаторы, документы, финансы, заявки и сотрудники не смешиваются между объектами.",
      href: "/admin/buildings",
      category: "foundation",
      done: buildings.length > 0,
      required: true,
      actionLabel: "Добавить здание",
      outcome: "Появится объект, к которому можно привязать этажи, помещения и команду.",
      countLabel: buildings.length > 0 ? `${buildings.length} здан.` : "обязательно",
    },
    {
      key: "floors",
      title: "Настроить этажи",
      description: "Этажи нужны для структуры здание -> этаж -> помещение, ставок, площадей и доступа администраторов.",
      href: "/admin/buildings",
      category: "object",
      done: floorCount > 0,
      required: true,
      actionLabel: "Настроить этажи",
      outcome: "Система сможет правильно группировать помещения и считать площадь здания.",
      countLabel: floorCount > 0 ? `${floorCount} эт.` : "обязательно",
    },
    {
      key: "spaces",
      title: "Создать помещения",
      description: "Помещения дают заполняемость, привязку арендаторов, счетчики и расчет аренды по конкретной площади.",
      href: "/admin/spaces",
      category: "object",
      done: rentableSpaceCount > 0,
      required: true,
      actionLabel: "Создать помещения",
      outcome: "Можно будет назначать арендаторов и видеть свободную/занятую площадь.",
      countLabel: rentableSpaceCount > 0 ? `${rentableSpaceCount} пом.` : "обязательно",
    },
    {
      key: "rates",
      title: "Указать ставки аренды",
      description: "Нужна ставка этажа, фиксированная аренда этажа или индивидуальная ставка арендатора, иначе прогноз дохода будет пустым.",
      href: "/admin/settings",
      category: "object",
      done: pricedFloorCount > 0,
      required: true,
      actionLabel: "Указать ставки",
      outcome: "Дашборд владельца начнет показывать расчетный месячный доход.",
      countLabel: pricedFloorCount > 0 ? `${pricedFloorCount} эт.` : "обязательно",
    },
    {
      key: "administrator",
      title: "Назначить администратора здания",
      description: "Арендаторы должны общаться с администратором, а владелец видеть контроль сверху. Можно назначить и самого владельца.",
      href: "/admin/buildings",
      category: "people",
      done: buildings.length > 0 && buildingsWithAdmin === buildings.length,
      required: true,
      actionLabel: "Назначить администратора",
      outcome: "У каждого здания появится ответственный контакт для арендаторов и заявок.",
      countLabel: buildings.length > 0 ? `${buildingsWithAdmin}/${buildings.length}` : "после здания",
    },
    {
      key: "tenants",
      title: "Добавить арендаторов",
      description: "Арендатора можно добавить вручную или импортировать из Excel, затем привязать к одному или нескольким помещениям/этажам.",
      href: "/admin/tenants",
      category: "people",
      done: tenantCount > 0,
      required: true,
      actionLabel: "Добавить арендатора",
      outcome: "Появится карточка арендатора, договоры, начисления и кабинет арендатора.",
      countLabel: tenantCount > 0 ? `${tenantCount} аренд.` : "обязательно",
    },
    {
      key: "contacts",
      title: "Проверить контакты арендаторов",
      description: "Телефон и email нужны для входа в кабинет, welcome-письма, счетов, уведомлений и подписания документов.",
      href: "/admin/data-quality",
      category: "people",
      done: tenantCount > 0 && tenantWithContactCount === tenantCount,
      required: true,
      actionLabel: "Проверить контакты",
      outcome: "Арендаторы смогут войти, получать уведомления и отправлять подтверждения оплат.",
      countLabel: tenantCount > 0 ? `${tenantWithContactCount}/${tenantCount}` : "после арендаторов",
    },
    {
      key: "payment-details",
      title: "Подготовить платежные реквизиты",
      description: "Основной банковский счет в реквизитах и/или активный счет учета нужен для оплат, сверки и отчетов.",
      href: "/admin/settings#payment-accounts",
      category: "finance",
      done: orgPaymentDetailsReady || cashAccountCount > 0,
      required: true,
      actionLabel: "Настроить оплату",
      outcome: "Арендатор увидит куда платить, а администратор сможет разносить платежи.",
      countLabel: cashAccountCount > 0 ? `${cashAccountCount} счет.` : orgPaymentDetailsReady ? "банк готов" : "обязательно",
    },
    {
      key: "document-numbering",
      title: "Настроить номера документов",
      description: "Префиксы договоров, счетов и актов защищают от хаоса, особенно когда у владельца несколько зданий.",
      href: "/admin/settings",
      category: "legal",
      done: buildings.length > 0 && buildingsWithNumbering === buildings.length,
      required: true,
      actionLabel: "Настроить нумерацию",
      outcome: "Номера документов будут понятными: здание, год, порядковый номер.",
      countLabel: buildings.length > 0 ? `${buildingsWithNumbering}/${buildings.length}` : "после здания",
    },
    {
      key: "contract",
      title: "Создать и подписать первый договор",
      description: "Юридический контур должен подтверждать аренду, помещение, срок, сумму и будущие изменения через доп. соглашения.",
      href: "/admin/documents/new/contract",
      category: "legal",
      done: signedContractCount > 0,
      required: true,
      actionLabel: "Создать договор",
      outcome: "Условия аренды будут подкреплены документом и подписью сторон.",
      countLabel: contractCount > 0 ? `${signedContractCount}/${contractCount} подпис.` : "обязательно",
    },
    {
      key: "billing",
      title: "Сформировать первое начисление",
      description: "После начисления становится виден долг, срок оплаты, счет и финансовая дисциплина арендатора.",
      href: "/admin/finances",
      category: "finance",
      done: chargeCount > 0,
      required: true,
      actionLabel: "Сформировать начисление",
      outcome: "Владелец увидит ожидаемый доход, а арендатор - сумму к оплате.",
      countLabel: chargeCount > 0 ? `${chargeCount} начисл.` : "обязательно",
    },
    {
      key: "templates",
      title: "Проверить шаблоны документов",
      description: "Можно оставить стандартные шаблоны, но для продаж SaaS лучше загрузить свой договор, счет, АВР и акт сверки с метками.",
      href: "/admin/settings/document-templates",
      category: "legal",
      done: hasContractTemplate || hasAnyDocumentTemplate,
      required: false,
      actionLabel: "Открыть шаблоны",
      outcome: "Документы будут выглядеть как документы владельца, а не как черновики системы.",
      countLabel: hasAnyDocumentTemplate ? `${activeTemplateTypes.size} шабл.` : "можно позже",
    },
    {
      key: "tariffs",
      title: "Добавить тарифы коммунальных услуг",
      description: "Электричество, вода, отопление, мусор и интернет можно считать отдельно от аренды, если они нужны конкретному объекту.",
      href: "/admin/settings",
      category: "finance",
      done: tariffCount > 0,
      required: false,
      actionLabel: "Добавить тарифы",
      outcome: "Коммунальные начисления будут прозрачными и не смешаются с арендной платой.",
      countLabel: tariffCount > 0 ? `${tariffCount} тариф.` : "если нужно",
    },
    {
      key: "staff",
      title: "Пригласить команду",
      description: "Бухгалтер, управляющий или сотрудник могут получить роль и доступ только к нужным зданиям.",
      href: "/admin/staff",
      category: "people",
      done: staffCount > 0,
      required: false,
      actionLabel: "Добавить сотрудника",
      outcome: "Владелец сможет не работать в операционке каждый день.",
      countLabel: staffCount > 0 ? `${staffCount} сотр.` : "можно позже",
    },
    {
      key: "payment",
      title: "Принять первый платеж",
      description: "Платеж закрывает долг и показывает владельцу реальный денежный поток. Это финальная проверка финансового контура.",
      href: "/admin/finances",
      category: "finance",
      done: paymentCount > 0,
      required: false,
      actionLabel: "Принять платеж",
      outcome: "Цепочка начисление -> оплата -> закрытие долга будет проверена на практике.",
      countLabel: paymentCount > 0 ? `${paymentCount} плат.` : "после счета",
    },
  ]

  const requiredSteps = steps.filter((step) => step.required)
  const recommendedSteps = steps.filter((step) => !step.required)
  const doneCount = steps.filter((step) => step.done).length
  const doneRequiredCount = requiredSteps.filter((step) => step.done).length
  const doneRecommendedCount = recommendedSteps.filter((step) => step.done).length
  const requiredCount = requiredSteps.length
  const recommendedCount = recommendedSteps.length
  const totalCount = steps.length
  const percent = requiredCount > 0 ? Math.round((doneRequiredCount / requiredCount) * 100) : 100
  const nextRequiredStep = requiredSteps.find((step) => !step.done) ?? null

  return {
    steps,
    doneCount,
    totalCount,
    requiredCount,
    doneRequiredCount,
    recommendedCount,
    doneRecommendedCount,
    percent,
    allDone: doneRequiredCount === requiredCount,
    nextStep: nextRequiredStep ?? recommendedSteps.find((step) => !step.done) ?? null,
    nextRequiredStep,
  }
}

function isOrganizationRequisitesReady(organization: {
  legalType: string | null
  legalName: string | null
  shortName: string | null
  bin: string | null
  iin: string | null
  directorName: string | null
  directorPosition: string | null
  basis: string | null
  legalAddress: string | null
  actualAddress: string | null
  bankName: string | null
  iik: string | null
  bik: string | null
  phone: string | null
  email: string | null
} | null) {
  if (!organization) return false
  const identityReady = isLegalIdentityReady(organization.legalType, organization.bin, organization.iin)
  return [
    organization.legalType,
    organization.legalName,
    organization.directorName,
    organization.basis,
    organization.legalAddress,
    organization.phone,
    organization.email,
  ].every(hasText) && identityReady && isOrganizationPaymentDetailsReady(organization)
}

function isOrganizationPaymentDetailsReady(organization: {
  bankName: string | null
  iik: string | null
  bik: string | null
} | null) {
  if (!organization) return false
  return [organization.bankName, organization.iik, organization.bik].every(hasText)
}

function isLegalIdentityReady(legalType: string | null, bin: string | null, iin: string | null) {
  const type = legalType?.toUpperCase()
  if (type === "IP" || type === "PHYSICAL") return hasText(iin)
  if (type === "TOO" || type === "AO") return hasText(bin)
  return hasText(bin) || hasText(iin)
}

function hasText(value: string | null | undefined) {
  return !!value?.trim()
}
