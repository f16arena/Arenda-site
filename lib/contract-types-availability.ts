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
 * Тип доступен, если у организации есть объекты такого вида (по Floor.kind).
 * «Помещение» и «размещение оборудования» доступны всегда (база).
 */
export async function availableContractTypesForOrg(
  orgId: string | null | undefined,
): Promise<ContractPlacementType[]> {
  if (!orgId) return ["PREMISES"]

  const floors = await db.floor
    .findMany({
      where: { building: { organizationId: orgId } },
      select: { kind: true },
      distinct: ["kind"],
    })
    .catch(() => [] as Array<{ kind: string | null }>)

  const floorKinds = new Set(floors.map((f) => String(f.kind ?? "FLOOR").toUpperCase()))

  // Помещение — всегда. Размещение оборудования (автоматы/вендинг/банкоматы) —
  // общий кейс без привязки к виду этажа, поэтому доступно всегда.
  const available = new Set<ContractPlacementType>(["PREMISES", "EQUIPMENT"])
  if (floorKinds.has("ROOF")) available.add("ROOF")
  if (floorKinds.has("TERRITORY")) available.add("TERRITORY")

  // Возвращаем в порядке каталога.
  return CONTRACT_PLACEMENT_TYPES.filter((t) => available.has(t.key)).map((t) => t.key)
}
