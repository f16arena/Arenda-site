import { db } from "./db"

/**
 * Универсальная нумерация документов по зданию.
 *
 * 4 типа: договор аренды, счёт-фактура, акт оказанных услуг, акт сверки.
 * Каждое здание имеет свой префикс и счётчик для каждого типа — нумерация
 * независима между зданиями и между организациями.
 *
 * Формат номера: {PREFIX}-{YEAR}-{SEQ4}, например F16-2026-001.
 */

export type DocumentKind = "contract" | "invoice" | "act" | "reconciliation"

export const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  contract: "Договор аренды",
  invoice: "Счёт-фактура",
  act: "Акт оказанных услуг",
  reconciliation: "Акт сверки",
}

// Стандартные суффиксы префиксов по типу — добавляются автоматически,
// если пользователь не задал явный префикс.
const DEFAULT_KIND_SUFFIX: Record<DocumentKind, string> = {
  contract: "",        // F16-2026-001
  invoice: "СФ",       // F16-СФ-2026-001
  act: "АОУ",          // F16-АОУ-2026-001
  reconciliation: "АС", // F16-АС-2026-001
}

type PrefixField = "contractPrefix" | "invoicePrefix" | "actPrefix" | "reconciliationPrefix"
type CounterField = "contractCounter" | "invoiceCounter" | "actCounter" | "reconciliationCounter"

const KIND_FIELDS: Record<DocumentKind, { prefix: PrefixField; counter: CounterField }> = {
  contract:       { prefix: "contractPrefix",       counter: "contractCounter" },
  invoice:        { prefix: "invoicePrefix",        counter: "invoiceCounter" },
  act:            { prefix: "actPrefix",            counter: "actCounter" },
  reconciliation: { prefix: "reconciliationPrefix", counter: "reconciliationCounter" },
}

interface BuildingNumbering {
  name: string
  contractPrefix: string | null
  contractCounter: number
  invoicePrefix: string | null
  invoiceCounter: number
  actPrefix: string | null
  actCounter: number
  reconciliationPrefix: string | null
  reconciliationCounter: number
}

/**
 * Генерирует короткий префикс из названия здания.
 *
 * - "БЦ F16" → "F16" (берём латинскую часть, если есть)
 * - "Plaza Center" → "PC"
 * - "Алматы Сити" → "АС"
 * - "Test" → "TEST"
 */
export function generatePrefixFromName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "BC"

  // Если в названии есть латинско-цифровой токен длиной ≥2 — используем его
  const latinToken = trimmed.match(/[A-Za-z][A-Za-z0-9]{1,9}/)
  if (latinToken) return latinToken[0].toUpperCase()

  // Иначе берём первые буквы каждого слова (или первые 4 буквы первого)
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase()
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 4) || "BC"
}

/**
 * Возвращает эффективный префикс с учётом типа документа.
 * Если пользовательский префикс задан — используется он + суффикс типа.
 * Если не задан — генерируется из имени здания + суффикс типа.
 */
export function effectivePrefix(
  building: Pick<BuildingNumbering, "name" | PrefixField>,
  kind: DocumentKind,
): string {
  const userPrefix = building[KIND_FIELDS[kind].prefix]
  const base = userPrefix || generatePrefixFromName(building.name)
  const suffix = DEFAULT_KIND_SUFFIX[kind]
  return suffix ? `${base}-${suffix}` : base
}

function formatNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Возвращает следующий предложенный номер документа для здания.
 *
 * Для договоров: ищет максимальную последовательность среди существующих Contract,
 * чтобы номер не пересекался с уже использованными.
 *
 * Для остальных типов: использует Building.{kind}Counter + 1.
 * При фактическом создании документа счётчик нужно инкрементировать
 * через {@link commitNumber}.
 */
export async function suggestDocumentNumber(
  buildingId: string,
  kind: DocumentKind,
): Promise<string> {
  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: {
      name: true,
      contractPrefix: true,
      contractCounter: true,
      invoicePrefix: true,
      invoiceCounter: true,
      actPrefix: true,
      actCounter: true,
      reconciliationPrefix: true,
      reconciliationCounter: true,
    },
  })
  if (!building) throw new Error("Здание не найдено")

  const prefix = effectivePrefix(building, kind)
  const year = new Date().getFullYear()

  if (kind === "contract") {
    return suggestContractNumberFromExisting(buildingId, prefix, year)
  }

  const seq = (building[KIND_FIELDS[kind].counter] as number) + 1
  return formatNumber(prefix, year, seq)
}

/**
 * Договоры — особый случай: ищем по существующим записям Contract,
 * чтобы поддержать любые номера, введённые вручную.
 */
async function suggestContractNumberFromExisting(
  buildingId: string,
  prefix: string,
  year: number,
): Promise<string> {
  const floorIds = (await db.floor.findMany({
    where: { buildingId },
    select: { id: true },
  })).map((f) => f.id)

  if (floorIds.length === 0) return formatNumber(prefix, year, 1)

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year + 1, 0, 1)

  const contracts = await db.contract.findMany({
    where: {
      createdAt: { gte: yearStart, lt: yearEnd },
      tenant: {
        OR: [
          { space: { floorId: { in: floorIds } } },
          { fullFloors: { some: { id: { in: floorIds } } } },
        ],
      },
    },
    select: { number: true },
  })

  const re = new RegExp(`^${escapeRegex(prefix)}-${year}-(\\d+)$`, "i")
  let maxSeq = 0
  for (const c of contracts) {
    const m = c.number.match(re)
    if (m) {
      const n = parseInt(m[1])
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n
    }
  }
  return formatNumber(prefix, year, maxSeq + 1)
}

/**
 * Атомарно инкрементирует счётчик типа документа в здании.
 * Вызывать при фактическом создании/печати документа.
 *
 * Для договоров: счётчик хранит максимально использованную последовательность —
 * после createContract он обновляется отдельно (см. app/actions/contracts.ts).
 */
export async function commitDocumentNumber(
  buildingId: string,
  kind: DocumentKind,
): Promise<number> {
  const counterField = KIND_FIELDS[kind].counter
  const updated = await db.building.update({
    where: { id: buildingId },
    data: { [counterField]: { increment: 1 } },
    select: { [counterField]: true },
  })
  return (updated[counterField] as unknown as number) ?? 0
}
