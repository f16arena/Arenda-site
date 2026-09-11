"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GitBranch } from "lucide-react"
import { toast } from "sonner"
import { createContractVersion } from "@/app/actions/contracts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока создаётся версия — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая версия договора № {contractNumber}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Текущая версия (v{currentVersion}) будет архивирована. Новая версия v{currentVersion + 1}
              {" "}создастся в статусе DRAFT — её нужно будет отправить на подпись отдельно.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата начала</label>
              <Input type="date" name="startDate" defaultValue={defaultStartDate ?? ""} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата окончания</label>
              <Input type="date" name="endDate" defaultValue={defaultEndDate ?? ""} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Содержимое договора копируется из предыдущей версии. Изменить можно
              позже через редактирование договора.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="flex-1">
                Отмена
              </Button>
              <Button type="submit" loading={pending} className="flex-1">
                {pending ? "Создание…" : "Создать версию"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
