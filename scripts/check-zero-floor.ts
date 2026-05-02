import "dotenv/config"
import { db } from "../lib/db"

async function main() {
  // Все этажи "0 этаж" / number=0
  const zeroFloors = await db.floor.findMany({
    where: { number: 0 },
    select: {
      id: true,
      name: true,
      number: true,
      buildingId: true,
      fullFloorTenantId: true,
      fixedMonthlyRent: true,
      totalArea: true,
      building: { select: { name: true } },
      fullFloorTenant: { select: { id: true, companyName: true } },
      _count: { select: { spaces: true } },
      spaces: {
        select: {
          id: true,
          number: true,
          area: true,
          status: true,
          kind: true,
          tenant: { select: { companyName: true } },
        },
      },
    },
  })

  for (const f of zeroFloors) {
    console.log(`\n=== Этаж "${f.name}" в здании "${f.building.name}" ===`)
    console.log(`  id=${f.id}`)
    console.log(`  totalArea=${f.totalArea}`)
    console.log(`  fullFloorTenantId=${f.fullFloorTenantId}`)
    console.log(`  fullFloorTenant=${f.fullFloorTenant?.companyName ?? "null"}`)
    console.log(`  fixedMonthlyRent=${f.fixedMonthlyRent}`)
    console.log(`  Помещений: ${f._count.spaces}`)
    for (const sp of f.spaces) {
      console.log(`    Каб. ${sp.number} · ${sp.area} м² · ${sp.kind} · ${sp.status} · арендатор: ${sp.tenant?.companyName ?? "—"}`)
    }
  }

  // Tenants кто числится full-floor
  const fullFloorTenants = await db.tenant.findMany({
    where: { fullFloors: { some: {} } },
    select: {
      id: true,
      companyName: true,
      spaceId: true,
      fullFloors: {
        select: { id: true, name: true, building: { select: { name: true } } },
      },
    },
  })
  console.log(`\n=== Арендаторы с full-floor: ${fullFloorTenants.length} ===`)
  for (const t of fullFloorTenants) {
    console.log(
      `  ${t.companyName} → этажи: ${t.fullFloors.map((f) => `"${f.name}" (${f.building.name})`).join(", ")} · spaceId=${t.spaceId ?? "null"}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
