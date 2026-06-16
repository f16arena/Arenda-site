import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createExtendedPrismaClient> | undefined
}

function createPrismaClient() {
  // Pool для Supabase (eu-central-1, Frankfurt). Каждый serverless invocation
  // быстро освобождает соединение в idle. Total = vercel_instances × max.
  //
  // ВАЖНО про max: страницы делают по 6–10 запросов через Promise.all (дашборд,
  // финансы, карточка арендатора). При max=1 эти «параллельные» запросы
  // СЕРИАЛИЗУЮТСЯ на единственном соединении: даже при быстрой БД (запросы <100мс
  // в Postgres) рендер раздувался до 2.7–4с — это был главный источник «долгой
  // загрузки» (телеметрия server_performance_logs + pg_stat_statements, июнь 2026).
  // max=3 даёт реальную параллельность (запас по соединениям большой:
  // max_connections=60, в работе ~6). Через транзакционный pooler (порт 6543)
  // можно поднять и выше — он мультиплексирует клиентские соединения.
  const isServerless = !!process.env.VERCEL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: isServerless ? 3 : 5,
    idleTimeoutMillis: 10_000,
    // 30 сек на установку TLS — запас на сетевые задержки.
    connectionTimeoutMillis: 30_000,
    // Постгресовый statement timeout — защита от вечно висящих запросов.
    statement_timeout: 30_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

// Модели с soft delete (миграция 019). Имена в формате lowerCamelCase, как
// Prisma передаёт `model` в query extensions.
const SOFT_DELETE_MODELS = new Set<string>([
  "Tenant",
  "Charge",
  "Payment",
  "Contract",
  "GeneratedDocument",
])

type SoftDeleteWhere = {
  deletedAt?: unknown
  AND?: unknown
  OR?: unknown
  NOT?: unknown
  [key: string]: unknown
}

// Возвращает true если в where явно упомянут deletedAt — на любом уровне
// верхних логических операторов AND/OR/NOT. В таких случаях extension не
// должен переопределять фильтр (например для `restoreCharge` нужно искать
// soft-deleted записи через `deletedAt: { not: null }`).
function whereMentionsDeletedAt(where: unknown): boolean {
  if (!where || typeof where !== "object") return false
  const w = where as SoftDeleteWhere
  if (Object.prototype.hasOwnProperty.call(w, "deletedAt")) return true
  if (Array.isArray(w.AND)) {
    for (const sub of w.AND) if (whereMentionsDeletedAt(sub)) return true
  } else if (w.AND && whereMentionsDeletedAt(w.AND)) return true
  if (Array.isArray(w.OR)) {
    for (const sub of w.OR) if (whereMentionsDeletedAt(sub)) return true
  }
  if (Array.isArray(w.NOT)) {
    for (const sub of w.NOT) if (whereMentionsDeletedAt(sub)) return true
  } else if (w.NOT && whereMentionsDeletedAt(w.NOT)) return true
  return false
}

function applySoftDeleteFilter(model: string | undefined, args: { where?: unknown }) {
  if (!model || !SOFT_DELETE_MODELS.has(model)) return
  const where = (args.where ?? {}) as SoftDeleteWhere
  // Если where уже фильтрует по deletedAt (включая через AND/OR/NOT) —
  // не перезаписываем. Это позволяет admin-страницам recycle bin
  // показывать удалённые записи через `deletedAt: { not: null }`.
  if (whereMentionsDeletedAt(where)) return
  args.where = { ...where, deletedAt: null }
}

function createExtendedPrismaClient() {
  const base = createPrismaClient()
  return base.$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async findFirst({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async findFirstOrThrow({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async count({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async aggregate({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async groupBy({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        // Update/delete варианты с фильтром — тоже не должны попадать на
        // soft-deleted записи (двойного удаления). updateMany/deleteMany
        // получают тот же фильтр; единичные update/delete работают по
        // unique key и здесь не трогаются (соответствует findUnique).
        async updateMany({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
        async deleteMany({ model, args, query }) {
          applySoftDeleteFilter(model, args)
          return query(args)
        },
      },
    },
  })
}

// findUnique НЕ перехватывается — soft-deleted записи иногда нужно достать
// по id (например для restoreCharge). Если нужен фильтр — добавляйте
// `where: { ..., deletedAt: null }` явно через findFirst.

export const db = globalForPrisma.prisma ?? createExtendedPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db

// Тип транзакционного клиента для $transaction(async (tx) => ...). Расширенный
// клиент имеет другой generic, чем `Prisma.TransactionClient` — поэтому
// helper-функции, принимающие tx, должны использовать именно этот тип.
export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]
