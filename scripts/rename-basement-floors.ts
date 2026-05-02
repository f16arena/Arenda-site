import "dotenv/config"
import { db } from "../lib/db"

async function main() {
  // 1. Переименовываем «Подвал» в «0 этаж» и нормализуем number = 0
  // 2. Если в том же здании уже есть number=0 (другой этаж) — пропускаем,
  //    нужно решать вручную чтобы не сломать.

  const basements = await db.floor.findMany({
    where: {
      name: { contains: "одвал", mode: "insensitive" },
    },
    select: {
      id: true,
      number: true,
      name: true,
      buildingId: true,
      building: { select: { name: true } },
    },
  })

  console.log(`Найдено ${basements.length} этажей с именем «Подвал»`)

  for (const f of basements) {
    // Проверка конфликта: уже есть number=0 в этом здании?
    const conflict = await db.floor.findFirst({
      where: {
        buildingId: f.buildingId,
        number: 0,
        id: { not: f.id },
      },
      select: { id: true, name: true },
    })

    if (conflict) {
      console.log(
        `⚠ Здание «${f.building.name}» уже имеет number=0 («${conflict.name}»). Пропускаю «${f.name}», нужно решить вручную.`,
      )
      continue
    }

    await db.floor.update({
      where: { id: f.id },
      data: { name: "0 этаж", number: 0 },
    })
    console.log(
      `✓ Здание «${f.building.name}»: «${f.name}» (number=${f.number}) → «0 этаж» (number=0)`,
    )
  }

  console.log("\nГотово.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
