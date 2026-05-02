import "dotenv/config"
import { db } from "../lib/db"

/**
 * Для каждого этажа с fullFloorTenantId, у которого нет ни одного RENTABLE
 * помещения — автоматически создаём «Весь этаж» и привязываем арендатора.
 * Это ретроактивно применяет логику, добавленную в assignFullFloor.
 */
async function main() {
  const floors = await db.floor.findMany({
    where: { fullFloorTenantId: { not: null } },
    select: {
      id: true,
      name: true,
      totalArea: true,
      fullFloorTenantId: true,
      building: { select: { name: true } },
      fullFloorTenant: { select: { companyName: true } },
      _count: {
        select: { spaces: { where: { kind: "RENTABLE" } } },
      },
    },
  })

  console.log(`Этажей сданных целиком: ${floors.length}`)

  for (const f of floors) {
    const tenantName = f.fullFloorTenant?.companyName ?? "—"
    if (f._count.spaces > 0) {
      console.log(`✓ "${f.name}" (${f.building.name}) → ${tenantName}: уже есть RENTABLE помещения, пропускаем`)
      continue
    }
    if (!f.totalArea || f.totalArea <= 0) {
      console.log(`⚠ "${f.name}" (${f.building.name}) → ${tenantName}: totalArea не задан, пропускаем`)
      continue
    }
    if (!f.fullFloorTenantId) continue

    const space = await db.space.create({
      data: {
        floorId: f.id,
        number: "all",
        area: f.totalArea,
        status: "OCCUPIED",
        kind: "RENTABLE",
        description: `Весь этаж «${f.name}» — авто-создано миграцией`,
      },
      select: { id: true },
    })
    await db.tenant.update({
      where: { id: f.fullFloorTenantId },
      data: { spaceId: space.id },
    })
    console.log(
      `✓ "${f.name}" (${f.building.name}) → ${tenantName}: создан Каб. all площадью ${f.totalArea} м²`,
    )
  }

  console.log("\nГотово.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
