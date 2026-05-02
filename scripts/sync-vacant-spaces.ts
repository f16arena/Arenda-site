import "dotenv/config"
import { db } from "../lib/db"

/**
 * Найти все Space со статусом VACANT/MAINTENANCE, у которых остался привязанный
 * Tenant.spaceId, и отвязать. Это чинит инконсистентности когда status был
 * изменён вручную раньше, чем мы стали авто-отвязывать арендатора.
 */
async function main() {
  const inconsistent = await db.space.findMany({
    where: {
      status: { not: "OCCUPIED" },
      tenant: { isNot: null },
    },
    select: {
      id: true,
      number: true,
      status: true,
      floor: { select: { name: true } },
      tenant: { select: { id: true, companyName: true } },
    },
  })

  console.log(`Найдено ${inconsistent.length} неконсистентных помещений:`)
  for (const sp of inconsistent) {
    console.log(
      `  Каб. ${sp.number} (${sp.floor.name}) · ${sp.status} · арендатор: ${sp.tenant?.companyName}`,
    )
  }

  if (inconsistent.length === 0) {
    console.log("✓ Всё в порядке.")
    return
  }

  console.log("\nОтвязываем арендаторов...")
  for (const sp of inconsistent) {
    if (sp.tenant) {
      await db.tenant.update({
        where: { id: sp.tenant.id },
        data: { spaceId: null },
      })
      console.log(
        `✓ «${sp.tenant.companyName}» отвязан от Каб. ${sp.number} (${sp.floor.name})`,
      )
    }
  }

  console.log("\nГотово.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
