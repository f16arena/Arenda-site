export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { CheckCircle } from "lucide-react"
import { RespondButton } from "./complaint-actions"

const statusLabel: Record<string, string> = {
  NEW: "Новая",
  REVIEWED: "Рассмотрена",
  RESOLVED: "Решена",
}
const statusColor: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  REVIEWED: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
}

export default async function ComplaintsPage() {
  const complaints = await db.complaint.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Жалобы и предложения</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {complaints.filter((c) => c.status === "NEW").length} новых
        </p>
      </div>

      <div className="space-y-3">
        {complaints.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-900">
                    {c.user?.name ?? c.name ?? "Аноним"}
                  </p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {statusLabel[c.status] ?? c.status}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{c.text}</p>
                {c.response && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 border-l-2 border-slate-300">
                    <span className="text-xs text-slate-400 block mb-1">Ответ администратора:</span>
                    {c.response}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              {c.status !== "RESOLVED" && (
                <RespondButton complaintId={c.id} hasResponse={!!c.response} />
              )}
            </div>
          </div>
        ))}

        {complaints.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <CheckCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Жалоб нет</p>
          </div>
        )}
      </div>
    </div>
  )
}
