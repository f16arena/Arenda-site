import "dotenv/config"
import { db } from "../lib/db"

async function main() {
  const floors = await db.floor.findMany({
    where: {
      OR: [
        { name: { contains: "одвал", mode: "insensitive" } },
        { name: { contains: "0 этаж", mode: "insensitive" } },
        { number: { in: [-1, 0] } },
      ],
    },
    select: {
      id: true,
      number: true,
      name: true,
      buildingId: true,
      building: { select: { name: true } },
      _count: { select: { spaces: true } },
    },
    orderBy: [{ buildingId: "asc" }, { number: "asc" }],
  })

  console.log(`Найдено ${floors.length} этажей:`)
  for (const f of floors) {
    console.log(
      `  [${f.id}] здание «${f.building.name}» · number=${f.number} · "${f.name}" · помещений: ${f._count.spaces}`,
    )
  }

  // Группировка по зданию
  const byBuilding = new Map<string, typeof floors>()
  for (const f of floors) {
    const arr = byBuilding.get(f.buildingId) ?? []
    arr.push(f)
    byBuilding.set(f.buildingId, arr)
  }
  console.log(`\nКонфликты (несколько подвальных этажей в одном здании):`)
  for (const [bId, list] of byBuilding) {
    if (list.length > 1) {
      console.log(`  Здание ${list[0].building.name} (${bId}): ${list.length} этажей`)
      list.forEach((f) =>
        console.log(`    - "${f.name}" (number=${f.number}) · spaces=${f._count.spaces}`),
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
