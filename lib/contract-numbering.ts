import { db } from "./db"

/**
 * Генерирует следующий уникальный номер договора для здания.
 * Формат: {PREFIX}-{YEAR}-{SEQ4} (например F16-2026-001)
 *
 * Логика:
 * 1. Берёт префикс из Building.contractPrefix (или генерит из имени)
 * 2. Находит максимальный sequence среди номеров этого здания за текущий год
 * 3. Возвращает следующий номер
 *
 * НЕ инкрементирует счётчик в БД — это «предложение» номера.
 * Реальный инкремент произойдёт при создании Contract в БД (если потребуется).
 */
export async function suggestContractNumber(buildingId: string): Promise<string> {
  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: { name: true, contractPrefix: true },
  })

  const prefix = building?.contractPrefix || generatePrefixFromName(building?.name ?? "X")
  const year = new Date().getFullYear()

  // Получим все этажи здания
  const floorIds = (await db.floor.findMany({
    where: { buildingId },
    select: { id: true },
  })).map((f) => f.id)

  if (floorIds.length === 0) {
    return formatNumber(prefix, year, 1)
  }

  // Все договоры арендаторов в этом здании за текущий год
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

  // Парсим существующие номера и находим максимальную последовательность
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

function formatNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
}

function generatePrefixFromName(name: string): string {
  // "F16 Arena" → "F16A", "Plaza Center" → "PC", "Test" → "TEST"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase()
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 4) || "BC"
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Проверяет уникальность номера договора в пределах здания.
 * Возвращает true если номер свободен.
 */
export async function isContractNumberUnique(
  buildingId: string,
  number: string,
  excludeContractId?: string,
): Promise<boolean> {
  const floorIds = (await db.floor.findMany({
    where: { buildingId },
    select: { id: true },
  })).map((f) => f.id)

  if (floorIds.length === 0) return true

  const existing = await db.contract.findFirst({
    where: {
      number,
      ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      tenant: {
        OR: [
          { space: { floorId: { in: floorIds } } },
          { fullFloors: { some: { id: { in: floorIds } } } },
        ],
      },
    },
    select: { id: true },
  })

  return !existing
}
