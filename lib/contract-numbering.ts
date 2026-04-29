import { db } from "./db"
import { suggestDocumentNumber } from "./document-numbering"

// Сохраняем старый API для обратной совместимости.
// Логика вынесена в lib/document-numbering.ts.

export async function suggestContractNumber(buildingId: string): Promise<string> {
  return suggestDocumentNumber(buildingId, "contract")
}

/**
 * Проверяет уникальность номера договора в пределах здания.
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
