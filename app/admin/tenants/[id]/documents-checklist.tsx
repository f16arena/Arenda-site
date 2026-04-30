"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Circle, Plus, X, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { addTenantDocument, deleteTenantDocument } from "@/app/actions/tenant-docs"
import { getRequiredDocs, DOC_TYPE_LABELS } from "@/lib/required-docs"
import { DeleteAction } from "@/components/ui/delete-action"

type Doc = { id: string; type: string; name: string; fileUrl: string; createdAt: Date }

export function DocumentsChecklist({
  tenantId,
  legalType,
  documents,
}: {
  tenantId: string
  legalType: string
  documents: Doc[]
}) {
  const required = getRequiredDocs(legalType)
  const uploadedTypes = new Set(documents.map((d) => d.type))
  const completed = required.filter((r) => uploadedTypes.has(r.type)).length

  const [open, setOpen] = useState(false)
  const [type, setType] = useState("OTHER")
  const [pending, startTransition] = useTransition()

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Документы</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {completed} из {required.length} обязательных загружено
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Загрузить
        </button>
      </div>

      <div className="divide-y divide-slate-50">
        {required.map((r) => {
          const uploaded = documents.find((d) => d.type === r.type)
          return (
            <div key={r.type} className="px-5 py-3 flex items-start gap-3">
              {uploaded ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.label}</p>
                {r.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{r.description}</p>
                )}
                {uploaded && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <a
                      href={uploaded.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      {uploaded.name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <DeleteAction
                      action={() => deleteTenantDocument(uploaded.id)}
                      entity="документ"
                      successMessage="Документ удалён"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Other uploaded docs that aren't in the required list */}
        {documents.filter((d) => !required.find((r) => r.type === d.type)).map((d) => (
          <div key={d.id} className="px-5 py-3 flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50/50">
            <CheckCircle2 className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{d.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{DOC_TYPE_LABELS[d.type] ?? d.type}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Открыть <ExternalLink className="h-3 w-3" />
                </a>
                <DeleteAction
                  action={() => deleteTenantDocument(d.id)}
                  entity="документ"
                  successMessage="Документ удалён"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Загрузить документ</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    fd.set("type", type)
                    await addTenantDocument(tenantId, fd)
                    toast.success("Документ добавлен")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип документа *</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                >
                  {required.map((r) => (
                    <option key={r.type} value={r.type}>{r.label}</option>
                  ))}
                  <option value="CONTRACT">Договор аренды</option>
                  <option value="ACT">Акт</option>
                  <option value="INVOICE">Счёт-фактура</option>
                  <option value="OTHER">Прочее</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название *</label>
                <input
                  name="name"
                  required
                  placeholder="Например: Устав ТОО Ромашка от 2025"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Ссылка на файл *</label>
                <input
                  name="fileUrl"
                  required
                  type="url"
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Загрузите файл в Google Drive / Dropbox и вставьте ссылку</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Сохранение..." : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
