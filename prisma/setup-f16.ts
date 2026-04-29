// One-time скрипт: оставляет реальную org_f16 как основную для БЦ F16
// и меняет её slug на "bcf16" (длина 5 — проходит валидацию для регистрации).
// Удаляет дублирующую пустую организацию, созданную при seed.
import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log("Cleaning up organizations...")

  const realOrg = await db.organization.findFirst({
    where: { slug: "f16" },
    include: { _count: { select: { buildings: true, users: true } } },
  })
  if (!realOrg) {
    console.log("✗ org with slug=f16 not found — nothing to do")
    return
  }
  console.log(`Found: "${realOrg.name}" (slug=${realOrg.slug}, buildings=${realOrg._count.buildings}, users=${realOrg._count.users})`)

  const dupOrg = await db.organization.findFirst({
    where: { slug: "bcf16" },
    include: { _count: { select: { buildings: true, users: true } } },
  })
  if (dupOrg) {
    console.log(`Duplicate: "${dupOrg.name}" (slug=bcf16, buildings=${dupOrg._count.buildings}, users=${dupOrg._count.users})`)
    if (dupOrg._count.buildings > 0 || dupOrg._count.users > 0) {
      console.log("⚠️  Дубликат не пустой — пропускаю удаление, разбирайтесь вручную")
    } else {
      await db.organization.delete({ where: { id: dupOrg.id } })
      console.log("✓ Удалён пустой дубликат")
    }
  }

  const updated = await db.organization.update({
    where: { id: realOrg.id },
    data: {
      slug: "bcf16",
      name: realOrg.name.includes("F16") ? realOrg.name : "ТОО \"БЦ F16\"",
    },
  })
  console.log(`✓ Slug изменён: "${updated.name}" → ${updated.slug}`)

  const mainBuilding = await db.building.findFirst({
    where: { organizationId: updated.id },
    orderBy: { createdAt: "asc" },
  })
  if (mainBuilding && !mainBuilding.contractPrefix) {
    await db.building.update({
      where: { id: mainBuilding.id },
      data: {
        contractPrefix: "F16",
        invoicePrefix: "F16",
        actPrefix: "F16",
        reconciliationPrefix: "F16",
      },
    })
    console.log(`✓ Префикс F16 установлен на здании "${mainBuilding.name}"`)
  } else if (mainBuilding) {
    console.log(`✓ Здание "${mainBuilding.name}" уже имеет префикс ${mainBuilding.contractPrefix}`)
  }

  console.log("\n✅ Done!")
  console.log("\nДоступ к рабочей зоне:")
  console.log("  Локально (dev):    http://localhost:3000/admin")
  console.log("  В продакшне:       https://bcf16.commrent.kz/admin")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
