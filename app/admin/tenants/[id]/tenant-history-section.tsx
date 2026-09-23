import { ClipboardList } from "lucide-react"
import { db } from "@/lib/db"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { safeServerValue } from "@/lib/server-fallback"
import { getT } from "@/lib/i18n/server"
import { INTL_LOCALE } from "@/lib/i18n/config"

// Подписи в словаре: модуль знает только коды из журнала.
const KNOWN_ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"]
const KNOWN_ENTITIES = ["tenant", "charge", "payment", "contract", "request", "user"]

export async function TenantHistorySection({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const { t, tp, locale } = await getT()
  const auditLogs = await safeServerValue(
    db.auditLog.findMany({
      where: {
        OR: [
          { entity: "tenant", entityId: tenantId },
          { userId },
          {
            AND: [
              { entity: { in: ["charge", "payment", "contract", "request"] } },
              { details: { contains: tenantId } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        entity: true,
        userName: true,
        userRole: true,
        createdAt: true,
      },
    }),
    [],
    { source: "admin.tenant.history", route: "/admin/tenants/[id]", userId, entity: "tenant", entityId: tenantId },
  )

  if (auditLogs.length === 0) return null

  return (
    <CollapsibleCard
      title={t("adminTenants.history.title")}
      icon={ClipboardList}
      meta={tp("adminTenants.history.meta", auditLogs.length)}
    >
      <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800">
        {auditLogs.map((log) => (
          <li key={log.id} className="px-5 py-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-700 dark:text-slate-300">
                <b>
                  {KNOWN_ACTIONS.includes(log.action)
                    ? t(`adminTenants.history.actions.${log.action}` as "adminTenants.history.actions.CREATE")
                    : log.action}
                </b>{" "}
                {KNOWN_ENTITIES.includes(log.entity)
                  ? t(`adminTenants.history.entities.${log.entity}` as "adminTenants.history.entities.tenant")
                  : log.entity}
              </span>
              <span className="whitespace-nowrap text-slate-400 dark:text-slate-500">
                {new Date(log.createdAt).toLocaleString(INTL_LOCALE[locale], {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {log.userName && (
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {log.userName} · {log.userRole}
              </p>
            )}
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  )
}
