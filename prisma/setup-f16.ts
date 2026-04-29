// Идемпотентный скрипт: настраивает основную организацию как БЦ F16 со slug bcf16.
// Работает в любом из состояний:
//   - чистая БД после seed (есть org slug=default)
//   - старая БД с org slug=f16 (legacy)
//   - уже настроенная (есть org slug=bcf16)
import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  // Найдём целевую org (приоритет: bcf16 → f16 → default)
  const candidates = await db.organization.findMany({
    where: { slug: { in: ["bcf16", "f16", "default"] } },
    include: { _count: { select: { buildings: true, users: true } } },
  })
  candidates.sort((a, b) => {
    const order = { bcf16: 0, f16: 1, default: 2 }
    return (order[a.slug as keyof typeof order] ?? 99) - (order[b.slug as keyof typeof order] ?? 99)
  })

  if (candidates.length === 0) {
    console.log("✗ Не найдено ни одной организации с slug bcf16/f16/default")
    return
  }

  const main = candidates[0]
  console.log(`Основная: "${main.name}" (slug=${main.slug}, buildings=${main._count.buildings}, users=${main._count.users})`)

  // Переименовываем в bcf16 (если ещё не)
  if (main.slug !== "bcf16") {
    await db.organization.update({
      where: { id: main.id },
      data: {
        slug: "bcf16",
        name: main.name.includes("F16") ? main.name : 'ТОО "БЦ F16"',
      },
    })
    console.log(`✓ Slug переименован: ${main.slug} → bcf16`)
  } else {
    console.log("✓ Slug уже bcf16")
  }

  // Удаляем дубликаты (если есть)
  const dups = candidates.slice(1).filter((c) => c._count.buildings === 0 && c._count.users === 0)
  for (const d of dups) {
    await db.organization.delete({ where: { id: d.id } })
    console.log(`✓ Удалён пустой дубликат: ${d.name} (slug=${d.slug})`)
  }

  // Настраиваем главное здание
  const mainBuilding = await db.building.findFirst({
    where: { organizationId: main.id },
    orderBy: { createdAt: "asc" },
  })
  if (mainBuilding) {
    const needRename = !mainBuilding.name.includes("F16")
    const needPrefix = !mainBuilding.contractPrefix
    if (needRename || needPrefix) {
      await db.building.update({
        where: { id: mainBuilding.id },
        data: {
          ...(needRename ? { name: "БЦ F16" } : {}),
          ...(needPrefix ? {
            contractPrefix: "F16",
            invoicePrefix: "F16",
            actPrefix: "F16",
            reconciliationPrefix: "F16",
          } : {}),
        },
      })
      console.log(`✓ Здание "${needRename ? "БЦ F16" : mainBuilding.name}" обновлено (prefix=F16)`)
    } else {
      console.log(`✓ Здание "${mainBuilding.name}" уже настроено`)
    }
  }

  // Привязываем orphan users (без organizationId, не платформенные) к bcf16
  const orphans = await db.user.findMany({
    where: { organizationId: null, isPlatformOwner: false },
    select: { id: true, name: true, role: true },
  })
  if (orphans.length > 0) {
    await db.user.updateMany({
      where: { id: { in: orphans.map((u) => u.id) } },
      data: { organizationId: main.id },
    })
    console.log(`✓ Привязано ${orphans.length} orphan users к bcf16 (${orphans.map((u) => `${u.role}:${u.name}`).join(", ")})`)
  }

  console.log("\n✅ Done!")
  console.log("\nДоступ к рабочей зоне:")
  console.log("  В продакшне: https://bcf16.commrent.kz/admin")
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
