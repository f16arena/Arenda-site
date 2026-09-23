import "server-only"

import { db } from "@/lib/db"
import type { Messages } from "@/lib/i18n/messages"
import type { TextKey, Vars } from "@/lib/i18n/translate"
import { safeServerValue } from "@/lib/server-fallback"

export type OnboardingStepCategory = "foundation" | "object" | "people" | "legal" | "finance"

/**
 * Код шага. Он же путь в словаре: adminChecks.onboardingSteps.steps.<код>.
 * Заголовок, описание, кнопку и «что это даст» модуль не собирает — язык
 * страницы известен только при отрисовке.
 */
export type OnboardingStepKey =
  | "requisites"
  | "building"
  | "floors"
  | "spaces"
  | "rates"
  | "administrator"
  | "tenants"
  | "contacts"
  | "paymentDetails"
  | "documentNumbering"
  | "contract"
  | "billing"
  | "tariffs"
  | "staff"
  | "payment"

/** Счётчик в бейдже шага: adminChecks.onboardingSteps.units.* */
export type OnboardingUnitKey = Extract<TextKey<Messages>, `adminChecks.onboardingSteps.units.${string}`>

export type OnboardingStep = {
  key: OnboardingStepKey
  href: string
  category: OnboardingStepCategory
  done: boolean
  required: boolean
  countKey: OnboardingUnitKey
  countVars?: Vars
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

  const [organization, buildings] = await Promise.all([
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
  ])

  const buildingIds = buildings.map((building) => building.id)
  const buildingScope = { buildingId: { in: buildingIds } }
  const tenantOrgScope = { user: { organizationId: orgId } }

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

  const steps: OnboardingStep[] = [
    {
      key: "requisites",
      href: "/admin/settings#organization-requisites",
      category: "foundation",
      done: orgRequisitesReady,
      required: true,
      countKey: orgRequisitesReady
        ? "adminChecks.onboardingSteps.units.done"
        : "adminChecks.onboardingSteps.units.required",
    },
    {
      key: "building",
      href: "/admin/buildings",
      category: "foundation",
      done: buildings.length > 0,
      required: true,
      countKey: buildings.length > 0
        ? "adminChecks.onboardingSteps.units.buildings"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: buildings.length },
    },
    {
      key: "floors",
      href: "/admin/buildings",
      category: "object",
      done: floorCount > 0,
      required: true,
      countKey: floorCount > 0
        ? "adminChecks.onboardingSteps.units.floors"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: floorCount },
    },
    {
      key: "spaces",
      href: "/admin/spaces",
      category: "object",
      done: rentableSpaceCount > 0,
      required: true,
      countKey: rentableSpaceCount > 0
        ? "adminChecks.onboardingSteps.units.spaces"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: rentableSpaceCount },
    },
    {
      key: "rates",
      href: "/admin/settings?tab=building",
      category: "object",
      done: pricedFloorCount > 0,
      required: true,
      countKey: pricedFloorCount > 0
        ? "adminChecks.onboardingSteps.units.floors"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: pricedFloorCount },
    },
    {
      key: "administrator",
      href: "/admin/buildings",
      category: "people",
      done: buildings.length > 0 && buildingsWithAdmin === buildings.length,
      required: true,
      countKey: buildings.length > 0
        ? "adminChecks.onboardingSteps.units.ratio"
        : "adminChecks.onboardingSteps.units.afterBuilding",
      countVars: { done: buildingsWithAdmin, total: buildings.length },
    },
    {
      key: "tenants",
      href: "/admin/tenants",
      category: "people",
      done: tenantCount > 0,
      required: true,
      countKey: tenantCount > 0
        ? "adminChecks.onboardingSteps.units.tenants"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: tenantCount },
    },
    {
      key: "contacts",
      href: "/admin/data-quality",
      category: "people",
      done: tenantCount > 0 && tenantWithContactCount === tenantCount,
      required: true,
      countKey: tenantCount > 0
        ? "adminChecks.onboardingSteps.units.ratio"
        : "adminChecks.onboardingSteps.units.afterTenants",
      countVars: { done: tenantWithContactCount, total: tenantCount },
    },
    {
      key: "paymentDetails",
      href: "/admin/settings#payment-accounts",
      category: "finance",
      done: orgPaymentDetailsReady || cashAccountCount > 0,
      required: true,
      countKey: cashAccountCount > 0
        ? "adminChecks.onboardingSteps.units.accounts"
        : orgPaymentDetailsReady
          ? "adminChecks.onboardingSteps.units.bankReady"
          : "adminChecks.onboardingSteps.units.required",
      countVars: { count: cashAccountCount },
    },
    {
      key: "documentNumbering",
      href: "/admin/settings?tab=money",
      category: "legal",
      done: buildings.length > 0 && buildingsWithNumbering === buildings.length,
      required: true,
      countKey: buildings.length > 0
        ? "adminChecks.onboardingSteps.units.ratio"
        : "adminChecks.onboardingSteps.units.afterBuilding",
      countVars: { done: buildingsWithNumbering, total: buildings.length },
    },
    {
      key: "contract",
      href: "/admin/documents?create=contract",
      category: "legal",
      done: signedContractCount > 0,
      required: true,
      countKey: contractCount > 0
        ? "adminChecks.onboardingSteps.units.contracts"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { done: signedContractCount, total: contractCount },
    },
    {
      key: "billing",
      href: "/admin/finances",
      category: "finance",
      done: chargeCount > 0,
      required: true,
      countKey: chargeCount > 0
        ? "adminChecks.onboardingSteps.units.charges"
        : "adminChecks.onboardingSteps.units.required",
      countVars: { count: chargeCount },
    },
    {
      key: "tariffs",
      href: "/admin/settings?tab=building",
      category: "finance",
      done: tariffCount > 0,
      required: false,
      countKey: tariffCount > 0
        ? "adminChecks.onboardingSteps.units.tariffs"
        : "adminChecks.onboardingSteps.units.ifNeeded",
      countVars: { count: tariffCount },
    },
    {
      key: "staff",
      href: "/admin/staff",
      category: "people",
      done: staffCount > 0,
      required: false,
      countKey: staffCount > 0
        ? "adminChecks.onboardingSteps.units.staff"
        : "adminChecks.onboardingSteps.units.later",
      countVars: { count: staffCount },
    },
    {
      key: "payment",
      href: "/admin/finances",
      category: "finance",
      done: paymentCount > 0,
      required: false,
      countKey: paymentCount > 0
        ? "adminChecks.onboardingSteps.units.payments"
        : "adminChecks.onboardingSteps.units.afterInvoice",
      countVars: { count: paymentCount },
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
