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
      kind: true,
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
  // Общие зоны (коридор, лестница, WC, тех) не сдаются в принципе
  if (space.kind === "COMMON") {
    throw new FullFloorConflictError(
      `Кабинет ${space.number} — общая зона (коридор/лестница/санузел/тех. помещение). ` +
        `Эти помещения не сдаются в аренду. Если ошибка — измените тип помещения на «Арендуемое».`,
    )
  }
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
export async function assertFloorAssignableToOneTenant(floorId: string, allowedTenantId?: string): Promise<void> {
  // Игнорируем COMMON помещения — они не могут быть «заняты» арендатором.
  // Проверяем только RENTABLE.
  const occupiedSpaces = await db.space.findMany({
    where: {
      floorId,
      kind: "RENTABLE",
      OR: [
        { tenant: { isNot: null } },
        { tenantSpaces: { some: {} } },
      ],
    },
    select: {
      number: true,
      tenant: { select: { id: true, companyName: true, contractEnd: true } },
      tenantSpaces: {
        select: { tenant: { select: { id: true, companyName: true, contractEnd: true } } },
        take: 1,
      },
    },
  })
  const occupied = occupiedSpaces.find((space) => {
    const tenant = space.tenant ?? space.tenantSpaces[0]?.tenant ?? null
    return tenant && tenant.id !== allowedTenantId
  })
  if (occupied) {
    const tenant = occupied.tenant ?? occupied.tenantSpaces[0]?.tenant ?? null
    const co = tenant?.companyName ?? "—"
    const until = tenant?.contractEnd
      ? ` (договор до ${tenant.contractEnd.toLocaleDateString("ru-RU")})`
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
  if (floor?.fullFloorTenantId && floor.fullFloorTenantId !== allowedTenantId) {
    const co = floor.fullFloorTenant?.companyName ?? "—"
    throw new FullFloorConflictError(
      `Этаж «${floor.name}» уже сдан целиком арендатору «${co}». Сначала снимите его.`,
    )
  }
}
