"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { Prisma } from "@/app/generated/prisma/client"
import { tenantScope } from "@/lib/tenant-scope"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { assemble, defaultState, renderContractText, type ContractState, type PartyType } from "@/lib/contract-engine"
import { renderContractDocx } from "@/lib/contract-engine/docx"
import { sendContractForSignature, markContractSignedByLandlord } from "@/app/actions/contract-workflow"

function toPartyType(legalType: string | null | undefined): PartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  return "too" // TOO/AO/OTHER
}

// Server actions конструктора договоров (Фаза 3). Работают с НОВОЙ таблицей
// contract_drafts, не трогая contracts / document_templates / подпись.

export interface SaveDraftInput {
  id?: string
  name: string
  builderState: ContractState
  tenantId?: string | null
}

export interface DraftListItem {
  id: string
  name: string
  status: string
  tenantId: string | null
  updatedAt: Date
}

export async function saveContractDraft(input: SaveDraftInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const session = await auth()
    const { orgId } = await requireOrgAccess()

    const data = {
      name: input.name?.trim() || "Без названия",
      builderState: input.builderState as unknown as Prisma.InputJsonValue,
      tenantId: input.tenantId ?? null,
    }

    let id = input.id
    if (id) {
      // обновляем только в пределах своей организации
      const res = await db.contractDraft.updateMany({
        where: { id, organizationId: orgId, deletedAt: null },
        data,
      })
      if (res.count === 0) return { ok: false, error: "Черновик не найден" }
    } else {
      const created = await db.contractDraft.create({
        data: { ...data, organizationId: orgId, createdById: session?.user?.id ?? null },
        select: { id: true },
      })
      id = created.id
    }

    revalidatePath("/admin/settings/document-templates")
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить" }
  }
}

export async function listContractDrafts(): Promise<DraftListItem[]> {
  const { orgId } = await requireOrgAccess()
  const rows = await db.contractDraft.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, tenantId: true, updatedAt: true },
    take: 100,
  })
  return rows
}

export async function loadContractDraft(
  id: string,
): Promise<{ ok: boolean; name?: string; builderState?: ContractState; error?: string }> {
  const { orgId } = await requireOrgAccess()
  const row = await db.contractDraft.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: { name: true, builderState: true },
  })
  if (!row) return { ok: false, error: "Черновик не найден" }
  return { ok: true, name: row.name, builderState: row.builderState as unknown as ContractState }
}

export async function deleteContractDraft(id: string): Promise<{ ok: boolean }> {
  await requireCapabilityAndFeature("documents.uploadTemplate")
  const { orgId } = await requireOrgAccess()
  await db.contractDraft.updateMany({
    where: { id, organizationId: orgId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath("/admin/settings/document-templates")
  return { ok: true }
}

/**
 * Серверная генерация DOCX из переданного состояния конструктора. Возвращает
 * base64 (клиент инициирует скачивание). Блокирует генерацию при hard-ошибках.
 * Архивация в GeneratedDocument — отдельная фаза интеграции (5).
 */
export interface ConstructorTenant {
  id: string
  name: string
  building: string | null
}

/** Список арендаторов организации для выбора в конструкторе (с зданием). */
export async function listConstructorTenants(): Promise<ConstructorTenant[]> {
  const { orgId } = await requireOrgAccess()
  const rows = await db.tenant.findMany({
    where: tenantScope(orgId),
    orderBy: { companyName: "asc" },
    take: 500,
    select: {
      id: true,
      companyName: true,
      space: { select: { floor: { select: { building: { select: { name: true } } } } } },
      tenantSpaces: { take: 1, select: { space: { select: { floor: { select: { building: { select: { name: true } } } } } } } },
      fullFloors: { take: 1, select: { building: { select: { name: true } } } },
    },
  })
  return rows.map((t) => ({
    id: t.id,
    name: t.companyName,
    building:
      t.space?.floor.building.name ??
      t.tenantSpaces[0]?.space.floor.building.name ??
      t.fullFloors[0]?.building.name ??
      null,
  }))
}

/**
 * Префилл состояния конструктора из существующего арендатора: реквизиты сторон
 * (арендодатель = организация, арендатор = выбранный), помещение, ставка аренды,
 * депозит, пеня, срок, услуги. Переиспользует те же загрузчики, что и генераторы.
 */
export async function prefillFromTenant(
  tenantId: string,
): Promise<{ ok: boolean; error?: string; state?: ContractState }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()

    const tenant = await db.tenant.findFirst({
      where: { AND: [tenantScope(orgId), { id: tenantId }] },
      select: {
        companyName: true, bin: true, iin: true, bankName: true, iik: true, bik: true,
        legalType: true, legalAddress: true, actualAddress: true, directorName: true,
        usePurpose: true, customRate: true, fixedMonthlyRent: true,
        contractStart: true, contractEnd: true, depositAmount: true, paymentDueDay: true,
        penaltyPercent: true, basisDocument: true, needsCleaning: true, cleaningFee: true,
        isVatPayer: true,
        user: { select: { phone: true, email: true } },
        bankAccounts: { select: { bankName: true, iik: true, bik: true, isPrimary: true } },
        space: { select: { number: true, area: true, floor: { select: { number: true, ratePerSqm: true, building: { select: { id: true, address: true, documentAddress: true } } } } } },
        tenantSpaces: { select: { space: { select: { number: true, area: true, floor: { select: { number: true, ratePerSqm: true, building: { select: { id: true, address: true, documentAddress: true } } } } } } } },
        fullFloors: { select: { number: true, totalArea: true, fixedMonthlyRent: true, building: { select: { id: true, address: true, documentAddress: true } } } },
      },
    })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    const org = await getOrganizationRequisites(orgId)
    const s = defaultState()

    // Арендодатель = организация
    s.landlord = {
      type: toPartyType(org.legalType),
      name: org.fullName,
      signatory: org.director || org.directorShort || "",
      bin: org.bin, iin: org.iin, iik: org.iik, bank: org.bank, bik: org.bik,
      basis: org.basis, address: org.legalAddress,
      phone: org.phone, email: org.email,
    }

    // Арендатор — выбранный
    const tb = tenant.bankAccounts.find((b) => b.isPrimary) ?? tenant.bankAccounts[0]
    s.tenant = {
      type: toPartyType(tenant.legalType),
      name: tenant.companyName,
      signatory: tenant.directorName ?? "",
      bin: tenant.bin ?? "", iin: tenant.iin ?? "",
      iik: tb?.iik ?? tenant.iik ?? "", bank: tb?.bankName ?? tenant.bankName ?? "", bik: tb?.bik ?? tenant.bik ?? "",
      basis: tenant.basisDocument ?? s.tenant.basis,
      address: tenant.legalAddress ?? tenant.actualAddress ?? "",
      phone: tenant.user?.phone ?? "", email: tenant.user?.email ?? "",
    }

    // Помещение
    const building =
      tenant.space?.floor.building ??
      tenant.tenantSpaces[0]?.space.floor.building ??
      tenant.fullFloors[0]?.building ??
      null
    s.premises.buildingAddress = building?.documentAddress || building?.address || ""
    if (tenant.space) {
      s.premises.placement = `${tenant.space.floor.number} этаж, помещение ${tenant.space.number}`
      s.premises.spaceAreaSqm = tenant.space.area
    } else if (tenant.tenantSpaces.length > 0) {
      s.premises.placement = tenant.tenantSpaces.map((x) => `${x.space.floor.number} эт., пом. ${x.space.number}`).join("; ")
      s.premises.spaceAreaSqm = tenant.tenantSpaces.reduce((sum, x) => sum + x.space.area, 0)
    } else if (tenant.fullFloors.length > 0) {
      s.premises.placement = tenant.fullFloors.map((fl) => `${fl.number} этаж целиком`).join("; ")
      s.premises.spaceAreaSqm = tenant.fullFloors.reduce((sum, fl) => sum + (fl.totalArea ?? 0), 0)
    }
    if (tenant.usePurpose) s.premises.purposeUse = tenant.usePurpose

    // Общая арендуемая площадь здания (для долевого расчёта)
    const buildingId = building?.id
    if (buildingId) {
      const agg = await db.space.aggregate({ where: { kind: "RENTABLE", floor: { buildingId } }, _sum: { area: true } })
      s.building.totalRentableAreaSqm = agg._sum.area ?? 0
    }

    // Финансы
    const rent = calculateTenantMonthlyRent(tenant)
    s.financials.monthlyRent = rent
    s.financials.deposit.amount = tenant.depositAmount ?? rent
    s.financials.paymentDueDay = tenant.paymentDueDay
    s.financials.penalty.tenantPerDay = tenant.penaltyPercent
    s.financials.penalty.landlordPerDay = tenant.penaltyPercent
    s.financials.vatIncluded = tenant.isVatPayer
    s.financials.additionalServices.premisesCleaning = { ordered: tenant.needsCleaning, ratePerSqm: tenant.cleaningFee }

    // Срок
    if (tenant.contractStart) s.term.startDate = new Date(tenant.contractStart).toISOString().slice(0, 10)
    if (tenant.contractEnd) s.term.endDate = new Date(tenant.contractEnd).toISOString().slice(0, 10)

    return { ok: true, state: s }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить арендатора" }
  }
}

/**
 * Создаёт реальный Contract (статус DRAFT) из состояния конструктора и
 * опционально сразу отправляет арендатору на подпись (переиспуёт существующий
 * sendContractForSignature — статус SENT, signToken, письмо со ссылкой /sign/[token]).
 * Контент — детерминированная строка (renderContractText), которую потребляет
 * контур подписи без изменений.
 */
export async function createContractFromBuilder(
  tenantId: string,
  builderState: ContractState,
  opts?: { send?: boolean; landlordSign?: boolean },
): Promise<{ ok: boolean; error?: string; contractId?: string; sent?: boolean; landlordSigned?: boolean; signUrl?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    if (!tenantId) return { ok: false, error: "Сначала выберите арендатора" }

    const tenant = await db.tenant.findFirst({
      where: { AND: [tenantScope(orgId), { id: tenantId }] },
      select: { id: true },
    })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    const a = assemble(builderState)
    if (a.validation.hard.length) {
      return { ok: false, error: "Договор содержит ошибки: " + a.validation.hard.join("; ") }
    }

    const rawNum = (builderState.meta.contractNumber || "").trim()
    const number = rawNum && rawNum !== "___" ? rawNum : "Б/Н"
    const contract = await db.contract.create({
      data: {
        tenantId,
        number,
        type: "STANDARD",
        content: renderContractText(builderState),
        status: "DRAFT",
        startDate: builderState.term.startDate ? new Date(builderState.term.startDate) : null,
        endDate: builderState.term.endDate ? new Date(builderState.term.endDate) : null,
      },
      select: { id: true },
    })

    // Подпись со стороны арендодателя (простая — отметка времени; ЭЦП владельца
    // делается отдельно интерактивно через NCALayer). Ставится ДО отправки,
    // чтобы арендатор получил уже подписанный нами договор.
    let landlordSigned = false
    if (opts?.landlordSign) {
      const r = await markContractSignedByLandlord(contract.id)
      if (r.ok) landlordSigned = true
      else {
        revalidatePath(`/admin/tenants/${tenantId}`)
        return { ok: true, contractId: contract.id, sent: false, landlordSigned: false, error: "Договор создан, но подпись арендодателя не удалась: " + r.error }
      }
    }

    let sent = false
    let signUrl: string | undefined
    if (opts?.send) {
      const r = await sendContractForSignature(contract.id)
      if (r.ok) {
        sent = true
        signUrl = r.signUrl
      } else {
        revalidatePath(`/admin/tenants/${tenantId}`)
        return { ok: true, contractId: contract.id, sent: false, landlordSigned, error: "Договор создан, но отправка не удалась: " + r.error }
      }
    }

    revalidatePath(`/admin/tenants/${tenantId}`)
    revalidatePath("/admin/contracts")
    return { ok: true, contractId: contract.id, sent, landlordSigned, signUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать договор" }
  }
}

export async function generateContractDocx(
  builderState: ContractState,
): Promise<{ ok: boolean; fileName?: string; base64?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()

    const a = assemble(builderState)
    if (a.validation.hard.length) {
      return { ok: false, error: "Договор содержит ошибки: " + a.validation.hard.join("; ") }
    }

    const buf = await renderContractDocx(builderState)
    const num = (builderState.meta.contractNumber || "draft").replace(/[^\w.-]+/g, "_")
    return { ok: true, fileName: `Договор_${num}.docx`, base64: buf.toString("base64") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сгенерировать" }
  }
}
