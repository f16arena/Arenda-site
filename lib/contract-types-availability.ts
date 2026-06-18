import "server-only"

import { db } from "@/lib/db"
import {
  CONTRACT_PLACEMENT_TYPES,
  type ContractPlacementType,
} from "@/lib/contract-placement-types"

/**
 * Доступные типы договоров для организации — «умная видимость» (нюанс владельца):
 * показываем только то, что реально есть, не захламляя список.
 *
 * Тип доступен, если у организации есть объекты такого вида (по Floor.kind) ИЛИ
 * загружен шаблон договора под этот тип. «Помещение» доступно всегда (база).
 */
export async function availableContractTypesForOrg(
  orgId: string | null | undefined,
): Promise<ContractPlacementType[]> {
  if (!orgId) return ["PREMISES"]

  const [floors, tpls] = await Promise.all([
    db.floor
      .findMany({
        where: { building: { organizationId: orgId } },
        select: { kind: true },
        distinct: ["kind"],
      })
      .catch(() => [] as Array<{ kind: string | null }>),
    db.documentTemplate
      .findMany({
        where: { organizationId: orgId, documentType: "CONTRACT", isActive: true },
        select: { placementType: true },
      })
      .catch(() => [] as Array<{ placementType: string | null }>),
  ])

  const floorKinds = new Set(floors.map((f) => String(f.kind ?? "FLOOR").toUpperCase()))
  const tplTypes = new Set(
    tpls.map((t) => t.placementType).filter((x): x is string => !!x),
  )

  const available = new Set<ContractPlacementType>(["PREMISES"])
  if (floorKinds.has("ROOF")) available.add("ROOF")
  if (floorKinds.has("TERRITORY")) available.add("TERRITORY")
  // Любой тип (в т.ч. расширенный) — если под него загружен шаблон.
  for (const t of CONTRACT_PLACEMENT_TYPES) {
    if (tplTypes.has(t.key)) available.add(t.key)
  }

  // Возвращаем в порядке каталога.
  return CONTRACT_PLACEMENT_TYPES.filter((t) => available.has(t.key)).map((t) => t.key)
}
