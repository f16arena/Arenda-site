"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FilePlus2, Upload } from "lucide-react"
import { createExternalContract } from "@/app/actions/external-contract"
import { Button } from "@/components/ui/button"

// Внешний договор (PDF контрагента) — для арендаторов, не принимающих нашу
// редакцию (вышки Beeline/Altel, камеры Сергек). Загружаем готовый PDF.
export function ExternalContractButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
  const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <FilePlus2 className="h-3.5 w-3.5" /> Внешний договор (PDF)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Внешний договор (PDF)</h3>
              <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                Договор контрагента, подписанный офлайн. Конструктор и ЭЦП не нужны — просто прикрепите PDF.
              </p>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    fd.set("tenantId", tenantId)
                    await createExternalContract(fd)
                    toast.success("Внешний договор добавлен")
                    setOpen(false)
                    router.refresh()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div>
                <label className={labelCls}>Номер договора *</label>
                <input name="number" required placeholder="например, BEE-2026/14" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Начало</label>
                  <input name="startDate" type="date" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Окончание</label>
                  <input name="endDate" type="date" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>PDF договора *</label>
                <input name="file" type="file" accept="application/pdf" required className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs dark:file:bg-slate-800 dark:file:text-slate-200`} />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Только PDF, до 10 МБ.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> {pending ? "Загрузка..." : "Добавить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
