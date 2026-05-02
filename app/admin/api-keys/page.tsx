export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Key, Code } from "lucide-react"
import { listApiKeys } from "@/app/actions/api-keys"
import { ApiKeysClient } from "./api-keys-client"

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "OWNER") redirect("/admin")

  const keys = await listApiKeys()

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Key className="h-5 w-5 text-slate-700 dark:text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">API-ключи</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Доступ к данным организации через REST API. Для интеграций с 1С, Excel-скриптами, BI-системами.
          </p>
        </div>
      </div>

      <ApiKeysClient initialKeys={keys.map((k) => ({
        ...k,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }))} />

      {/* Документация */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold">Документация API</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Аутентификация: заголовок <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">Authorization: Bearer ck_...</code> или параметр <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">?api_key=ck_...</code>
        </p>
        <div className="space-y-2 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-3 font-mono">
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">GET /api/v1/tenants</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Список арендаторов</p>
            <p className="text-slate-400 dark:text-slate-500 mt-1">Параметры: limit (1-500), offset, blacklisted=true|false</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-3 font-mono">
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">GET /api/v1/charges</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Список начислений</p>
            <p className="text-slate-400 dark:text-slate-500 mt-1">Параметры: period=YYYY-MM, unpaid=true, tenantId, limit/offset</p>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold mb-1">Безопасность:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-700 dark:text-amber-300">
            <li>Токен показывается ОДИН РАЗ при создании — сохраните его сразу</li>
            <li>Не публикуйте токен в коде на GitHub. Храните в .env / secrets</li>
            <li>Rate-limit: 100 запросов в минуту на ключ</li>
            <li>Отзовите ключ если он скомпрометирован</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
