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
  console.time("connect+query")
  const orgs = await db.organization.findMany({
    select: { id: true, name: true, slug: true, _count: { select: { buildings: true } } },
  })
  console.timeEnd("connect+query")
  console.log("Organizations:")
  for (const o of orgs) console.log(`  - ${o.name} (slug=${o.slug}, buildings=${o._count.buildings})`)
}

main().catch((e) => {
  console.error("ERROR:", e.message)
  process.exit(1)
}).finally(() => db.$disconnect())
