import "server-only"
import { db } from "@/lib/db"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { type AvrState, type AvrPartyType, type AvrItem, defaultAvrState, periodEndDate } from "@/lib/avr-engine"
import { getActiveContractForTenant, buildContractPositions, NO_ACTIVE_CONTRACT_ERROR } from "@/lib/active-contract"

export function avrPartyType(legalType: string | null | undefined): AvrPartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  return "too"
}

const CHARGE_TYPE_LABEL: Record<string, string> = {
  RENT: "Аренда нежилого помещения",
  CLEANING: "Уборка помещения",
  SERVICE_FEE: "Эксплуатационные расходы",
  SERVICE_FEE_INDEXED: "Эксплуатационные расходы (с индексацией)",
  SERVICE_DELIVERED: "Оказанные услуги",
  PENALTY: "Пеня",
  DEPOSIT: "Гарантийный взнос (депозит)",
  OTHER: "Прочие услуги",
}

/**
 * Собирает AvrState (форма Р-1) по арендатору и периоду: исполнитель =
 * организация, заказчик = арендатор, договор = действующий договор (без него —
 * ошибка), строки — из начислений за месяц, иначе из договора.
 * Общая логика конструктора и автоматической генерации при подписании договора.
 */
export async function buildAvrStateForTenant(
  orgId: string,
  tenantId: string,
  period: string,
): Promise<{ ok: true; state: AvrState } | { ok: false; error: string }> {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Укажите период (месяц)" }

  const [tenant, organization] = await Promise.all([
    db.tenant.findFirst({
      where: { AND: [tenantScope(orgId), { id: tenantId }] },
      select: {
        companyName: true, legalType: true, bin: true, iin: true, legalAddress: true, actualAddress: true,
        directorName: true, directorPosition: true,
        user: { select: { name: true, phone: true, email: true } },
        charges: { where: { period, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true } },
      },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true } }),
  ])
  if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

  // Правило: АВР выставляется только по действующему договору.
  const contract = await getActiveContractForTenant(tenantId)
  if (!contract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

  const req = organizationToRequisites(organization)
  const s = defaultAvrState()
  s.period = period
  const now = new Date()
  s.meta.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  s.executor = {
    type: avrPartyType(req.legalType),
    name: req.fullName,
    binIin: req.taxId || req.bin || req.iin,
    address: req.legalAddress,
    comm: [req.phone, req.email].filter(Boolean).join(", "),
    signatory: req.directorShort || req.director,
    position: req.directorPosition || "Директор",
  }
  s.customer = {
    type: avrPartyType(tenant.legalType),
    name: tenant.companyName,
    binIin: tenant.bin || tenant.iin || "",
    address: tenant.legalAddress || tenant.actualAddress || "",
    comm: [tenant.user?.phone, tenant.user?.email].filter(Boolean).join(", "),
    signatory: tenant.directorName || tenant.user?.name || "",
    position: tenant.directorPosition || "Директор",
  }

  // Реквизиты договора — строго из действующего договора (не из черновиков).
  s.contractRef.number = contract.number
  const contractDate = contract.startDate ?? contract.signedAt
  if (contractDate) s.contractRef.date = new Date(contractDate).toISOString().slice(0, 10)

  // Строки: начисления за период; если их ещё нет — собираем по договору
  // (аренда + эксплуатационные расходы + уборка/доп. услуги).
  const date = periodEndDate(period)
  const items: AvrItem[] = []
  for (const c of tenant.charges) {
    items.push({ name: c.description || CHARGE_TYPE_LABEL[c.type] || c.type, date, report: "", unit: "усл.", qty: 1, price: Math.round(c.amount) })
  }
  if (items.length === 0) {
    const positions = await buildContractPositions(tenantId, period, contract)
    for (const p of positions) {
      items.push({ name: p.name, date, report: "", unit: "усл.", qty: 1, price: p.amount })
    }
  }
  if (items.length === 0) {
    items.push({ name: `Аренда нежилого помещения за ${period}`, date, report: "", unit: "мес", qty: 1, price: 0 })
  }
  s.items = items

  s.vat = { enabled: !!organization?.isVatPayer, rate: coerceKzVatRate(organization?.vatRate, DEFAULT_KZ_VAT_RATE) }

  return { ok: true, state: s }
}
