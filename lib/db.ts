import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Для serverless (Vercel) — минимальный pool на инстанс.
  // Каждый serverless invocation использует 1 connection и быстро освобождает.
  // Total = vercel_instances × max. Supabase Session Pooler лимит ~15 коннектов.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
