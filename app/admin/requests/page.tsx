export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, REQUEST_TYPE_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { DeleteAction } from "@/components/ui/delete-action"
import { deleteRequest } from "@/app/actions/requests"

export default async function RequestsPage() {
  const requests = await db.request.findMany({
    select: {
      id: true, title: true, description: true, type: true,
      priority: true, status: true, createdAt: true,
      tenant: { select: { id: true, companyName: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Заявки арендаторов</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {requests.filter((r) => r.status === "NEW").length} новых
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {["Все", "Новые", "В работе", "Выполнены"].map((label) => (
          <button
            key={label}
            className="rounded-lg px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Заявка</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Арендатор</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Приоритет</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Статус</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Дата</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/requests/${r.id}`} className="block">
                    <p className="font-medium text-slate-900 hover:text-blue-600">{r.title}</p>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{r.description}</p>
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{r.tenant.companyName}</td>
                <td className="px-5 py-3.5 text-slate-500">
                  {REQUEST_TYPE_LABELS[r.type] ?? r.type}
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[r.priority])}>
                    {PRIORITY_LABELS[r.priority] ?? r.priority}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[r.status])}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">
                  {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-5 py-3.5">
                  <DeleteAction
                    action={deleteRequest.bind(null, r.id)}
                    entity="заявку"
                    successMessage="Заявка удалена"
                  />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <ClipboardList className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Нет заявок</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
