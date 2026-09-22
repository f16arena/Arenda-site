export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Key, Code } from "lucide-react"
import { listApiKeys } from "@/app/actions/api-keys"
import { ApiKeysClient } from "./api-keys-client"
import { PageHeader, Card } from "@/components/ui/page"
import { getT } from "@/lib/i18n/server"

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "OWNER") redirect("/admin")

  const { t } = await getT()
  const keys = await listApiKeys()

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        icon={Key}
        tone="slate"
        title={t("adminSettings.apiKeys.title")}
        subtitle={t("adminSettings.apiKeys.subtitle")}
      />

      <ApiKeysClient initialKeys={keys.map((k) => ({
        ...k,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }))} />

      {/* Документация */}
      <Card icon={Code} title={t("adminSettings.apiKeys.docsTitle")}>
        <div className="space-y-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t("adminSettings.apiKeys.authBefore")} <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">Authorization: Bearer ck_...</code> {t("adminSettings.apiKeys.authMiddle")} <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">?api_key=ck_...</code>
        </p>
        <div className="space-y-2 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-3 font-mono">
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">GET /api/v1/tenants</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">{t("adminSettings.apiKeys.tenantsTitle")}</p>
            <p className="text-slate-400 dark:text-slate-500 mt-1">{t("adminSettings.apiKeys.tenantsParams")}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-3 font-mono">
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">GET /api/v1/charges</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">{t("adminSettings.apiKeys.chargesTitle")}</p>
            <p className="text-slate-400 dark:text-slate-500 mt-1">{t("adminSettings.apiKeys.chargesParams")}</p>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold mb-1">{t("adminSettings.apiKeys.securityTitle")}</p>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-700 dark:text-amber-300">
            <li>{t("adminSettings.apiKeys.security1")}</li>
            <li>{t("adminSettings.apiKeys.security2")}</li>
            <li>{t("adminSettings.apiKeys.security3")}</li>
            <li>{t("adminSettings.apiKeys.security4")}</li>
          </ul>
        </div>
        </div>
      </Card>
    </div>
  )
}
