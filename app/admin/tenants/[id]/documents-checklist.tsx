"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Circle, Plus, ExternalLink, FileText } from "lucide-react"
import { toast } from "sonner"
import { addTenantDocument, deleteTenantDocument } from "@/app/actions/tenant-docs"
import { getRequiredDocs, DOC_TYPE_LABELS } from "@/lib/required-docs"
import { DeleteAction } from "@/components/ui/delete-action"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type Doc = { id: string; type: string; name: string; fileUrl: string | null; storageFileId?: string | null; createdAt: Date | string }

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
    <CollapsibleCard
      title="Документы"
      icon={FileText}
      meta={`${completed} из ${required.length} обязательных`}>
      <div className="flex justify-end px-5 py-3 border-b border-slate-50 dark:border-slate-800">
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Загрузить
        </Button>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
                )}
                {uploaded && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <a
                      href={uploaded.fileUrl ?? "#"}
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
          <div key={d.id} className="px-5 py-3 flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50">
            <CheckCircle2 className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{d.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{DOC_TYPE_LABELS[d.type] ?? d.type}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <a
                  href={d.fileUrl ?? "#"}
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт загрузка — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Загрузить документ</DialogTitle>
          </DialogHeader>

          <form
            encType="multipart/form-data"
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
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Тип документа *</label>
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
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название *</label>
              <Input
                name="name"
                required
                placeholder="Например: Устав ТОО Ромашка от 2025"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Файл *</label>
              <input
                name="file"
                required
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white text-sm text-slate-500 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                PDF, JPG, PNG, WebP, DOC, DOCX, XLS или XLSX до 10 МБ. Файл сохранится в БД.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
              <Button type="submit" loading={pending} className="flex-1">
                {pending ? "Сохранение..." : "Добавить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  )
}
