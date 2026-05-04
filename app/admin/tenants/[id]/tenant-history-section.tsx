import { ClipboardList } from "lucide-react"
import { db } from "@/lib/db"
import { CollapsibleCard } from "@/components/ui/collapsible-card"

const actionLabels: Record<string, string> = {
  CREATE: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
  LOGIN: "Вход",
  LOGOUT: "Выход",
}

const entityLabels: Record<string, string> = {
  tenant: "арендатор",
  charge: "начисление",
  payment: "платёж",
  contract: "договор",
  request: "заявка",
  user: "пользователь",
}

export async function TenantHistorySection({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const auditLogs = await db.auditLog.findMany({
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
  }).catch(() => [])

  if (auditLogs.length === 0) return null

  return (
    <CollapsibleCard
      title="История изменений"
      icon={ClipboardList}
      meta={`${auditLogs.length} событий`}
    >
      <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800">
        {auditLogs.map((log) => (
          <li key={log.id} className="px-5 py-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-700 dark:text-slate-300">
                <b>{actionLabels[log.action] ?? log.action}</b>{" "}
                {entityLabels[log.entity] ?? log.entity}
              </span>
              <span className="whitespace-nowrap text-slate-400 dark:text-slate-500">
                {new Date(log.createdAt).toLocaleString("ru-RU", {
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
