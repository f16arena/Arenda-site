// Меняет email платформенного админа.
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/change-platform-email.ts <oldEmail> <newEmail>
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
  const [, , oldEmail, newEmail] = process.argv
  if (!oldEmail || !newEmail) {
    console.error("Usage: <script> <oldEmail> <newEmail>")
    process.exit(1)
  }

  // Проверим что новый email не занят другим
  const conflict = await db.user.findUnique({ where: { email: newEmail } })
  if (conflict) {
    console.error(`✗ Email ${newEmail} уже используется другим пользователем (${conflict.name})`)
    process.exit(1)
  }

  const user = await db.user.findUnique({ where: { email: oldEmail } })
  if (!user) {
    console.error(`✗ Не найден пользователь с email ${oldEmail}`)
    process.exit(1)
  }

  await db.user.update({
    where: { id: user.id },
    data: { email: newEmail },
  })

  console.log(`✓ Email изменён: ${oldEmail} → ${newEmail}`)
  console.log(`  Платформенный админ: ${user.isPlatformOwner ? "да" : "нет"}`)
  console.log(`  Имя: ${user.name}`)
  console.log(`  Пароль не изменён`)
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
