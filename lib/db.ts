import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Pool — настройки специфичны для Supabase pooler из удалённого региона (Sydney).
  // Каждый serverless invocation быстро освобождает соединение в idle.
  // Total = vercel_instances × max. Supabase pooler лимит ~15 (Pro plan — выше).
  const isServerless = !!process.env.VERCEL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // В serverless каждый инстанс короткоживущий — 1 коннекта достаточно.
    // В dev/long-running — 5 для параллельных запросов.
    max: isServerless ? 1 : 5,
    idleTimeoutMillis: 10_000,
    // Sydney регион далеко (RTT ~200мс из РК): 30 сек на установку TLS.
    connectionTimeoutMillis: 30_000,
    // Постгресовый statement timeout — защита от вечно висящих запросов.
    statement_timeout: 30_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
