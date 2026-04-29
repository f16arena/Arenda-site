// Создаёт/обновляет владельца конкретной организации.
//
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/add-org-owner.ts <slug> <email> <password> [name]
//
// Пример:
//   node node_modules/tsx/dist/cli.mjs prisma/add-org-owner.ts bcf16 bolat_z@mail.ru ВашПароль "Болат З"
import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  const [, , slug, email, password, name] = process.argv
  if (!slug || !email || !password) {
    console.error("Usage: <script> <org-slug> <email> <password> [name]")
    process.exit(1)
  }

  const org = await db.organization.findUnique({ where: { slug } })
  if (!org) {
    console.error(`✗ Организация slug=${slug} не найдена`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  const existing = await db.user.findFirst({ where: { email } })

  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        organizationId: org.id,
        isActive: true,
        role: "OWNER",
        ...(name ? { name } : {}),
      },
      select: { id: true, name: true, email: true, role: true, organizationId: true },
    })
    console.log(`✓ Обновлён: ${updated.email} (role=${updated.role}, orgId=${updated.organizationId})`)
  } else {
    const created = await db.user.create({
      data: {
        name: name ?? "Владелец",
        email,
        password: hash,
        role: "OWNER",
        organizationId: org.id,
        isActive: true,
        isPlatformOwner: false,
      },
      select: { id: true, name: true, email: true },
    })
    console.log(`✓ Создан владелец: ${created.email} в "${org.name}" (slug=${org.slug})`)
  }

  console.log("\nЛогин:")
  console.log(`  email:    ${email}`)
  console.log(`  password: ${"*".repeat(password.length)}`)
  console.log(`  переход:  /admin (после входа)`)
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
