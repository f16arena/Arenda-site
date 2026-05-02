// Бизнес-инвариант: если у этажа задан fullFloorTenantId, то:
//   1. Никакой Space на этом этаже нельзя назначить другому арендатору.
//   2. Все Space.status принудительно OCCUPIED (не должны выглядеть свободными).
//   3. Чтобы освободить этаж, нужно сначала снять fullFloorTenant.
//
// И обратно: если хотя бы у одного Space на этаже есть индивидуальный Tenant,
// нельзя назначить fullFloorTenant на этот этаж — нужно сначала выселить.

import { db } from "@/lib/db"

export class FullFloorConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FullFloorConflictError"
  }
}

/**
 * Проверить, что Space можно назначить новому арендатору.
 * Если этаж полностью арендован — кидает ошибку с именем full-floor арендатора.
 */
export async function assertSpaceAssignable(spaceId: string): Promise<void> {
  const space = await db.space.findUnique({
    where: { id: spaceId },
    select: {
      number: true,
      floor: {
        select: {
          name: true,
          fullFloorTenantId: true,
          fullFloorTenant: { select: { companyName: true, contractEnd: true } },
        },
      },
    },
  })
  if (!space) throw new FullFloorConflictError("Помещение не найдено")
  if (space.floor.fullFloorTenantId) {
    const co = space.floor.fullFloorTenant?.companyName ?? "—"
    const until = space.floor.fullFloorTenant?.contractEnd
      ? ` (договор до ${space.floor.fullFloorTenant.contractEnd.toLocaleDateString("ru-RU")})`
      : ""
    throw new FullFloorConflictError(
      `Этаж «${space.floor.name}» полностью арендован «${co}»${until}. ` +
        `Нельзя назначить другого арендатора в кабинет ${space.number}, пока действует договор. ` +
        `Сначала снимите «${co}» с этажа.`,
    )
  }
}

/**
 * Проверить, что весь этаж можно отдать одному арендатору.
 * Если хоть одно помещение занято — кидает ошибку с указанием конфликтующего арендатора.
 */
export async function assertFloorAssignableToOneTenant(floorId: string): Promise<void> {
  const occupied = await db.space.findFirst({
    where: { floorId, tenant: { isNot: null } },
    select: {
      number: true,
      tenant: { select: { companyName: true, contractEnd: true } },
    },
  })
  if (occupied) {
    const co = occupied.tenant?.companyName ?? "—"
    const until = occupied.tenant?.contractEnd
      ? ` (договор до ${occupied.tenant.contractEnd.toLocaleDateString("ru-RU")})`
      : ""
    throw new FullFloorConflictError(
      `Нельзя сдать этаж целиком — кабинет ${occupied.number} уже занят «${co}»${until}. ` +
        `Сначала выселите «${co}» из кабинета.`,
    )
  }

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { fullFloorTenantId: true, name: true, fullFloorTenant: { select: { companyName: true } } },
  })
  if (floor?.fullFloorTenantId) {
    const co = floor.fullFloorTenant?.companyName ?? "—"
    throw new FullFloorConflictError(
      `Этаж «${floor.name}» уже сдан целиком арендатору «${co}». Сначала снимите его.`,
    )
  }
}
