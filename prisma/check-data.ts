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
  // Найдём пользователя по id из ошибки
  const target = await db.user.findUnique({
    where: { id: "cmojz2cjv000040us5hzl7zxm" },
    select: { id: true, name: true, email: true, phone: true, role: true, isPlatformOwner: true, organizationId: true, isActive: true },
  })
  console.log("Target user (id=cmojz2cjv000040us5hzl7zxm):")
  console.log(target ?? "  NOT FOUND")

  console.log("\nAll OWNER role users:")
  const owners = await db.user.findMany({
    where: { role: "OWNER" },
    select: { id: true, name: true, email: true, phone: true, isPlatformOwner: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  })
  for (const u of owners) {
    const flag = u.isPlatformOwner ? " [PLATFORM]" : ""
    console.log(`  - ${u.email || u.phone || "-"} (${u.name}, orgId=${u.organizationId})${flag}`)
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message)
  process.exit(1)
}).finally(() => db.$disconnect())
