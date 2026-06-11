import "server-only"
import { db } from "@/lib/db"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { type InvoiceState, type InvoicePartyType, type InvoiceItem, defaultInvoiceState } from "@/lib/invoice-engine"
import { getActiveContractForTenant, buildContractPositions, NO_ACTIVE_CONTRACT_ERROR } from "@/lib/active-contract"

export function invoicePartyType(legalType: string | null | undefined): InvoicePartyType {
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
 * Собирает InvoiceState по арендатору и периоду: продавец = организация,
 * покупатель = арендатор, договор = действующий договор (без него — ошибка),
 * позиции — из начислений за месяц, иначе из договора (аренда +
 * эксплуатационные расходы + уборка/доп. услуги).
 * Общая логика конструктора и автоматической генерации при подписании договора.
 */
export async function buildInvoiceStateForTenant(
  orgId: string,
  tenantId: string,
  period: string,
): Promise<{ ok: true; state: InvoiceState; source: "charges" | "contract" } | { ok: false; error: string }> {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Укажите период (месяц)" }

  const [tenant, organization] = await Promise.all([
    db.tenant.findFirst({
      where: { AND: [tenantScope(orgId), { id: tenantId }] },
      select: {
        companyName: true, legalType: true, bin: true, iin: true, legalAddress: true, actualAddress: true,
        bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { bankName: true, iik: true, bik: true, isPrimary: true } },
        charges: { where: { period, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true } },
      },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true } }),
  ])
  if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

  // Правило: счёт выставляется только по действующему договору.
  const contract = await getActiveContractForTenant(tenantId)
  if (!contract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

  const req = organizationToRequisites(organization)
  const s = defaultInvoiceState()
  s.period = period
  const now = new Date()
  s.meta.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  s.seller = {
    type: invoicePartyType(req.legalType),
    name: req.fullName,
    binIin: req.taxId || req.bin || req.iin,
    address: req.legalAddress,
    bank: req.bank, iik: req.iik, bik: req.bik, kbe: req.kbe, knp: req.knp,
    signatory: req.directorShort || req.director,
    signatoryPosition: req.directorPosition || "Директор",
  }
  const tb = tenant.bankAccounts.find((b) => b.isPrimary) ?? tenant.bankAccounts[0]
  s.buyer = {
    type: invoicePartyType(tenant.legalType),
    name: tenant.companyName,
    binIin: tenant.bin || tenant.iin || "",
    address: tenant.legalAddress || tenant.actualAddress || "",
    bank: tb?.bankName ?? "", iik: tb?.iik ?? "", bik: tb?.bik ?? "",
  }

  // Реквизиты договора — строго из действующего договора (не из черновиков).
  s.contractRef.number = contract.number
  const contractDate = contract.startDate ?? contract.signedAt
  if (contractDate) s.contractRef.date = new Date(contractDate).toISOString().slice(0, 10)

  // Позиции: начисления за период (биллинг — источник истины). Если их ещё нет —
  // собираем по договору: аренда + эксплуатационные расходы (+ уборка, доп. услуги).
  // Депозит — НЕ позиция месячного счёта (отдельный поток «Финансы → Депозиты»):
  // иначе счёт свежеподписанного договора состоял бы из одного депозита без аренды.
  const items: InvoiceItem[] = []
  for (const c of tenant.charges) {
    if (c.type === "DEPOSIT" || c.type === "DEPOSIT_REFUND") continue
    items.push({ name: c.description || CHARGE_TYPE_LABEL[c.type] || c.type, unit: "услуга", qty: 1, price: Math.round(c.amount) })
  }
  const source: "charges" | "contract" = items.length > 0 ? "charges" : "contract"
  if (items.length === 0) {
    const positions = await buildContractPositions(tenantId, period, contract)
    for (const p of positions) {
      items.push({ name: p.name, unit: "услуга", qty: 1, price: p.amount })
    }
  }
  if (items.length === 0) items.push({ name: `Аренда нежилого помещения за ${period}`, unit: "мес", qty: 1, price: 0 })
  s.items = items

  s.vat = { enabled: !!organization?.isVatPayer, rate: coerceKzVatRate(organization?.vatRate, DEFAULT_KZ_VAT_RATE) }

  return { ok: true, state: s, source }
}
