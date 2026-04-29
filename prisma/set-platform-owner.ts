// Создаёт или обновляет платформенного администратора (суперадмина).
//
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/set-platform-owner.ts <email> <password> [name]
//
// Пример:
//   node node_modules/tsx/dist/cli.mjs prisma/set-platform-owner.ts f16arena@gmail.com MyNewPass123 "Арыстан"
//
// Платформенный админ:
//   - imPlatformOwner = true
//   - organizationId = null (он вне организаций)
//   - role = "OWNER"
//   - может выбрать любую org через /superadmin
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
  const [, , emailArg, passwordArg, nameArg] = process.argv
  const email = emailArg?.trim() || "f16arena@gmail.com"
  const password = passwordArg?.trim()
  const name = nameArg?.trim() || "Платформа"

  if (!password || password.length < 6) {
    console.error("Usage: <script> <email> <password (min 6 chars)> [name]")
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)

  const existing = await db.user.findFirst({ where: { email } })

  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        isPlatformOwner: true,
        organizationId: null,
        isActive: true,
        role: "OWNER",
        name,
      },
      select: { id: true, name: true, email: true, isPlatformOwner: true },
    })
    console.log(`✓ Обновлён существующий пользователь: ${updated.email}`)
    console.log(`  isPlatformOwner=${updated.isPlatformOwner} (теперь точно суперадмин)`)
  } else {
    const created = await db.user.create({
      data: {
        name,
        email,
        password: hash,
        role: "OWNER",
        isPlatformOwner: true,
        organizationId: null,
        isActive: true,
      },
      select: { id: true, name: true, email: true },
    })
    console.log(`✓ Создан новый платформенный админ: ${created.email}`)
  }

  console.log("\nЛогин:")
  console.log(`  email:    ${email}`)
  console.log(`  password: ${"*".repeat(password.length)}`)
  console.log("\nПосле входа попадёте в /superadmin.")
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
