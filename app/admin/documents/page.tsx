import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Plus, FileText } from "lucide-react"
import Link from "next/link"

export default async function DocumentsPage() {
  const contracts = await db.contract.findMany({
    include: { tenant: true },
    orderBy: { createdAt: "desc" },
  })

  const typeLabel: Record<string, string> = {
    STANDARD: "Договор аренды",
    EXTENSION: "Пролонгация",
    ACT: "Акт сверки",
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Документы</h1>
          <p className="text-sm text-slate-500 mt-0.5">{contracts.length} документов</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/documents/templates"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-4 w-4" />
            Шаблон договора
          </Link>
          <button className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Создать документ
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {["Все", "Черновики", "Отправлены", "Подписаны", "Архив"].map((t) => (
          <button key={t} className="rounded-lg px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Документ</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Арендатор</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Период</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Статус</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Подписан</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">№{c.number}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{c.tenant.companyName}</td>
                <td className="px-5 py-3.5 text-slate-500">{typeLabel[c.type] ?? c.type}</td>
                <td className="px-5 py-3.5 text-slate-500">
                  {c.startDate && c.endDate
                    ? `${new Date(c.startDate).toLocaleDateString("ru-RU")} — ${new Date(c.endDate).toLocaleDateString("ru-RU")}`
                    : "—"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[c.status])}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">
                  {c.signedAt ? new Date(c.signedAt).toLocaleDateString("ru-RU") : "—"}
                </td>
                <td className="px-5 py-3.5">
                  <button className="text-xs text-blue-600 hover:underline">Открыть</button>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Документы не созданы</p>
                  <p className="text-xs text-slate-400 mt-1">Используйте шаблоны для быстрого создания</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
