"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { Prisma } from "@/app/generated/prisma/client"
import { tenantScope, contractScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { assemble, defaultState, renderContractText, type ContractState, type PartyType } from "@/lib/contract-engine"
import { renderContractDocx } from "@/lib/contract-engine/docx"
import { buildSignedContractDocxBuffer } from "@/lib/contract-engine/signed-docx"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { sendContractForSignature, markContractSignedByLandlord } from "@/app/actions/contract-workflow"
import { isObjectSpace, isZoneFloor } from "@/lib/zone-kinds"

function toPartyType(legalType: string | null | undefined): PartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  // ЧСИ / адвокат / нотариус — физлица с ИИН, действующие на основании лицензии
  // (НЕ юрлица с БИН). В конструкторе это «individual» (ИИН), основание = лицензия.
  if (t === "CHSI" || t === "ADVOKAT" || t === "NOTARIUS") return "individual"
  return "too" // TOO/AO/OTHER
}

// Подтип физлица для конструктора (подсветка выпадашки; имя/основание уже в БД).
function toIndividualSubtype(legalType: string | null | undefined): "regular" | "chsi" | "advokat" | "notarius" | undefined {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "CHSI") return "chsi"
  if (t === "ADVOKAT") return "advokat"
  if (t === "NOTARIUS") return "notarius"
  if (t === "PHYSICAL") return "regular"
  return undefined
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
  // Незавершённый договор арендатора (если есть) — чтобы предупредить о дубликате.
  existingContract: { number: string; status: string } | null
  // Действующий договор (SIGNED, не истёк). Счёт/АВР/акт сверки выставляются только при его наличии.
  activeContract: { number: string } | null
}

/** Список арендаторов организации для выбора в конструкторе (с зданием). */
export async function listConstructorTenants(): Promise<ConstructorTenant[]> {
  const { orgId } = await requireOrgAccess()
  // Жёсткая изоляция по зданию: если выбрано конкретное здание (верхний селектор),
  // показываем только его арендаторов; в режиме «Все здания» — всех по организации.
  const buildingId = await getCurrentBuildingId()
  const buildingFilter = buildingId
    ? {
        OR: [
          { space: { floor: { buildingId } } },
          { tenantSpaces: { some: { space: { floor: { buildingId } } } } },
          { fullFloors: { some: { buildingId } } },
        ],
      }
    : {}
  const rows = await db.tenant.findMany({
    where: { AND: [tenantScope(orgId), buildingFilter] },
    orderBy: { companyName: "asc" },
    take: 140,
    select: {
      id: true,
      companyName: true,
      space: { select: { floor: { select: { building: { select: { name: true } } } } } },
      tenantSpaces: { take: 1, select: { space: { select: { floor: { select: { building: { select: { name: true } } } } } } } },
      fullFloors: { take: 1, select: { building: { select: { name: true } } } },
      // Незавершённые/подписанные договоры — для предупреждения о дубликате
      // и определения действующего договора (SIGNED, срок не истёк).
      contracts: {
        where: { deletedAt: null, type: { not: "ADDENDUM" }, status: { in: ["DRAFT", "SENT", "VIEWED", "SIGNED_BY_TENANT", "SIGNED"] } },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: { number: true, status: true, endDate: true },
      },
    },
  })
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return rows.map((t) => {
    const active = t.contracts.find(
      (c) => c.status === "SIGNED" && (!c.endDate || c.endDate >= startOfToday),
    )
    return {
      id: t.id,
      name: t.companyName,
      building:
        t.space?.floor.building.name ??
        t.tenantSpaces[0]?.space.floor.building.name ??
        t.fullFloors[0]?.building.name ??
        null,
      existingContract: t.contracts[0] ? { number: t.contracts[0].number, status: t.contracts[0].status } : null,
      activeContract: active ? { number: active.number } : null,
    }
  })
}

/**
 * Префилл состояния конструктора из существующего арендатора: реквизиты сторон
 * (арендодатель = организация, арендатор = выбранный), помещение, ставка аренды,
 * депозит, пеня, срок, услуги. Переиспользует те же загрузчики, что и генераторы.
 */
export async function prefillFromTenant(
  tenantId: string,
): Promise<{
  ok: boolean
  error?: string
  state?: ContractState
  landlordContacts?: { owner: { phone: string; email: string }; admin: { phone: string; email: string } }
}> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId, userId } = await requireOrgAccess()

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
        space: { select: { number: true, area: true, kind: true, floor: { select: { number: true, name: true, kind: true, ratePerSqm: true, building: { select: { id: true, address: true, documentAddress: true } } } } } },
        tenantSpaces: { select: { space: { select: { number: true, area: true, kind: true, floor: { select: { number: true, name: true, kind: true, ratePerSqm: true, building: { select: { id: true, address: true, documentAddress: true } } } } } } } },
        fullFloors: { select: { number: true, totalArea: true, fixedMonthlyRent: true, building: { select: { id: true, address: true, documentAddress: true } } } },
      },
    })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    const org = await getOrganizationRequisites(orgId)
    const s = defaultState()

    // Контакты: владелец (текущий пользователь/аккаунт) vs администратор ЗДАНИЯ
    // (Building.administrator). adminContacts уточняется ниже, когда известно здание.
    const ownerUser = await db.user.findUnique({ where: { id: userId }, select: { phone: true, email: true } })
    const ownerContacts = { phone: ownerUser?.phone ?? "", email: ownerUser?.email ?? "" }
    let adminContacts = { phone: org.phone ?? "", email: org.email ?? "" }

    // Арендодатель = организация. Контакты по умолчанию — владельца (если заданы), иначе организации.
    s.landlord = {
      type: toPartyType(org.legalType),
      individualSubtype: toIndividualSubtype(org.legalType),
      name: org.fullName,
      signatory: org.director || org.directorShort || "",
      bin: org.bin, iin: org.iin, iik: org.iik, bank: org.bank, bik: org.bik,
      basis: org.basis, address: org.legalAddress,
      phone: ownerContacts.phone || adminContacts.phone,
      email: ownerContacts.email || adminContacts.email,
    }

    // Арендатор — выбранный
    const tb = tenant.bankAccounts.find((b) => b.isPrimary) ?? tenant.bankAccounts[0]
    s.tenant = {
      type: toPartyType(tenant.legalType),
      individualSubtype: toIndividualSubtype(tenant.legalType),
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
    // Объект на крыше/территории — без «этаж/помещение» и без площади:
    // «Антенно-мачтовое место, Крыша». Обычное помещение — «2 этаж, помещение 205».
    const placementForSpace = (sp: { number: string; kind?: string | null; floor: { number: number; name?: string | null; kind?: string | null } }) => {
      if (isObjectSpace(sp.kind) || isZoneFloor(sp.floor.kind)) {
        return sp.floor.name ? `${sp.number}, ${sp.floor.name}` : sp.number
      }
      return `${sp.floor.number} эт., пом. ${sp.number}`
    }
    if (tenant.space) {
      const sp = tenant.space
      const isObj = isObjectSpace(sp.kind) || isZoneFloor(sp.floor.kind)
      s.premises.placement = isObj
        ? (sp.floor.name ? `${sp.number}, ${sp.floor.name}` : sp.number)
        : `${sp.floor.number} этаж, помещение ${sp.number}`
      s.premises.spaceAreaSqm = isObj ? 0 : sp.area
    } else if (tenant.tenantSpaces.length > 0) {
      s.premises.placement = tenant.tenantSpaces.map((x) => placementForSpace(x.space)).join("; ")
      // Площадь — только реальные помещения (объекты площади не имеют).
      s.premises.spaceAreaSqm = tenant.tenantSpaces.reduce(
        (sum, x) => sum + (isObjectSpace(x.space.kind) || isZoneFloor(x.space.floor.kind) ? 0 : x.space.area),
        0,
      )
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
      // Контакты администратора + ставки эксплуатационного сбора здания.
      const b = await db.building.findUnique({
        where: { id: buildingId },
        select: {
          administrator: { select: { phone: true, email: true } },
          serviceFeeWinterRate: true, serviceFeeSummerRate: true, utilitiesInServiceFee: true,
        },
      })
      const a = b?.administrator
      if (a && (a.phone || a.email)) adminContacts = { phone: a.phone ?? "", email: a.email ?? "" }
      // Эксплуатационные расходы: подтягиваем сезонные тарифы из настроек здания
      // (страница «Эксплуатационный сбор»), чтобы не вбивать вручную в конструкторе.
      if (b && (b.serviceFeeWinterRate != null || b.serviceFeeSummerRate != null)) {
        s.financials.operatingCosts.method = "fixed_per_sqm"
        s.financials.operatingCosts.fixed = {
          winterRate: b.serviceFeeWinterRate ?? 0,
          summerRate: b.serviceFeeSummerRate ?? 0,
        }
        s.financials.operatingCosts.scope = (b.utilitiesInServiceFee && b.utilitiesInServiceFee.trim()) ? "all_inclusive" : "common_area"
      }
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

    return { ok: true, state: s, landlordContacts: { owner: ownerContacts, admin: adminContacts } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить арендатора" }
  }
}

/**
 * Следующий порядковый номер договора по организации: max числовой + 1, с ведущими
 * нулями до 3 знаков (001, 002, …). Учитываются только чисто числовые номера —
 * ручные/нестандартные («Б/Н», «2026/14») в подсчёте не участвуют.
 */
async function computeNextContractNumber(orgId: string): Promise<string> {
  const rows = await db.contract.findMany({ where: { tenant: tenantScope(orgId) }, select: { number: true } })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (n > max) max = n }
  }
  return String(max + 1).padStart(3, "0")
}

/** Возвращает следующий свободный номер договора (для предпросмотра автонумерации). */
export async function getNextContractNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    return { ok: true, number: await computeNextContractNumber(orgId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить номер" }
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
  opts?: { send?: boolean; landlordSign?: boolean; autoNumber?: boolean },
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

    // Запрет дубля: у арендатора не должно быть второго незавершённого договора.
    const existing = await db.contract.findFirst({
      where: { tenantId: tenant.id, type: { not: "ADDENDUM" }, status: { in: ["DRAFT", "SENT", "VIEWED", "SIGNED_BY_TENANT", "SIGNED"] } },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: { number: true },
    })
    if (existing) {
      return { ok: false, error: `У этого арендатора уже есть договор № ${existing.number}. Новый создать нельзя — измените условия через ДС или расторгните старый, затем создайте заново.` }
    }

    const a = assemble(builderState)
    if (a.validation.hard.length) {
      return { ok: false, error: "Договор содержит ошибки: " + a.validation.hard.join("; ") }
    }

    // Автонумерация считается на момент создания (атомарнее, чем клиентский предпросмотр).
    let number: string
    if (opts?.autoNumber) {
      number = await computeNextContractNumber(orgId)
    } else {
      const rawNum = (builderState.meta.contractNumber || "").trim()
      number = rawNum && rawNum !== "___" ? rawNum : "Б/Н"
    }
    const contract = await db.contract.create({
      data: {
        tenantId,
        number,
        type: "STANDARD",
        content: renderContractText(builderState),
        status: "DRAFT",
        startDate: builderState.term.startDate ? new Date(builderState.term.startDate) : null,
        endDate: builderState.term.endDate ? new Date(builderState.term.endDate) : null,
        // Снимок состояния — чтобы после подписи перерисовать DOCX с QR /verify/{id}.
        builderState: builderState as unknown as Prisma.InputJsonValue,
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

/**
 * DOCX уже существующего договора с РЕАЛЬНЫМ QR-кодом на страницу проверки
 * /verify/{id}. Доступно после подписи (есть подпись стороны или статус SIGNED).
 * Требует сохранённого снимка builderState (договоры из конструктора).
 */
export async function generateSignedContractDocx(
  contractId: string,
): Promise<{ ok: boolean; fileName?: string; base64?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const contract = await db.contract.findFirst({
      where: { id: contractId, ...contractScope(orgId) },
      select: { id: true, number: true, status: true, signedByLandlordAt: true, signedByTenantAt: true, builderState: true },
    })
    if (!contract) return { ok: false, error: "Договор не найден или нет доступа" }
    if (!contract.builderState) return { ok: false, error: "Нет снимка конструктора (договор создан вне конструктора)" }
    const signedAny = !!contract.signedByLandlordAt || !!contract.signedByTenantAt || contract.status === "SIGNED"
    if (!signedAny) return { ok: false, error: "DOCX с QR доступен после подписания" }

    const buf = await buildSignedContractDocxBuffer(contract)
    if (!buf) return { ok: false, error: "Нет снимка конструктора (договор создан вне конструктора)" }
    const num = (contract.number || "договор").replace(/[^\w.-]+/g, "_")
    return { ok: true, fileName: `Договор_${num}_подписан.docx`, base64: buf.toString("base64") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сгенерировать" }
  }
}

/** Скачать ПОДПИСАННЫЙ договор строго в PDF (DOCX → конвертер на VPS). Word наружу не отдаём. */
export async function generateSignedContractPdf(
  contractId: string,
): Promise<{ ok: boolean; fileName?: string; base64?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const contract = await db.contract.findFirst({
      where: { id: contractId, ...contractScope(orgId) },
      select: {
        id: true, number: true, status: true, type: true, startDate: true,
        signedByLandlordAt: true, signedByTenantAt: true, builderState: true,
        tenant: { select: { companyName: true } },
      },
    })
    if (!contract) return { ok: false, error: "Договор не найден или нет доступа" }
    if (!contract.builderState) return { ok: false, error: "Нет снимка конструктора (договор создан вне конструктора)" }
    if (!pdfConvertConfigured()) {
      return { ok: false, error: "PDF-конвертер не настроен. Задайте PDF_CONVERT_URL и PDF_CONVERT_SECRET в окружении." }
    }

    const docx = await buildSignedContractDocxBuffer(contract)
    if (!docx) return { ok: false, error: "Нет снимка конструктора (договор создан вне конструктора)" }
    const num = (contract.number || "договор").replace(/[^\w.-]+/g, "_")
    const pdf = await convertDocxToPdf(docx, `${num}.docx`)

    const dateStr = contract.startDate ? new Date(contract.startDate).toLocaleDateString("ru-RU") : ""
    const docLabel = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор аренды"
    const fileName = `${docLabel} № ${contract.number} — ${contract.tenant.companyName}${dateStr ? ` от ${dateStr}` : ""}.pdf`
      .replace(/[\\/:*?"<>|]+/g, "·")
    return { ok: true, fileName, base64: pdf.toString("base64") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сформировать PDF" }
  }
}
