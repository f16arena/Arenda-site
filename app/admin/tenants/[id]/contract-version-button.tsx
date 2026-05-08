"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, X } from "lucide-react"
import { toast } from "sonner"
import { createContractVersion } from "@/app/actions/contracts"

type Props = {
  contractId: string
  contractNumber: string
  currentVersion: number
  defaultStartDate?: string | null
  defaultEndDate?: string | null
}

/**
 * Кнопка «Создать новую версию». Открывает модалку с датами начала/окончания.
 *
 * TODO: расширить — позволить редактировать содержимое (content/markdown) с
 * предзаполнением из предка, добавить превью diff vs parent. Сейчас минимальный
 * skeleton: создаём новую DRAFT-версию, предка переводим в ARCHIVED.
 * Дальнейший workflow (DRAFT→SENT→SIGNED) запускается через существующие кнопки.
 */
export function ContractVersionButton({ contractId, contractNumber, currentVersion, defaultStartDate, defaultEndDate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const r = await createContractVersion(contractId, formData)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Создана версия № ${currentVersion + 1}`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Создать новую версию (предыдущая будет архивирована)"
        className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-300"
      >
        <GitBranch className="h-3 w-3" />
        Новая версия
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Новая версия договора № {contractNumber}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" title="Закрыть">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form action={onSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Текущая версия (v{currentVersion}) будет архивирована. Новая версия v{currentVersion + 1}
                {" "}создастся в статусе DRAFT — её нужно будет отправить на подпись отдельно.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата начала</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={defaultStartDate ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата окончания</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={defaultEndDate ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Содержимое договора копируется из предыдущей версии. Изменить можно
                позже через редактирование договора.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400"
                  disabled={pending}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {pending ? "Создание…" : "Создать версию"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
