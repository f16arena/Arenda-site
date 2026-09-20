"use client"

// Кнопка «Загрузить файл» и действия со строкой файла. Раньше хранилище было
// только для просмотра: положить файл можно было лишь из карточки арендатора,
// а из корзины ничего не возвращалось.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Download, Eye, RotateCcw, Trash2, Upload } from "lucide-react"
import { restoreStoredFile, uploadToStorage, deleteStoredFile } from "@/app/actions/storage"
import { ActionMenu } from "@/components/ui/action-menu"
import { ModalShell } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect } from "@/components/ui/field"
import { FIELD_CLS } from "@/lib/ui-fields"
import { askConfirm } from "@/components/ui/dialog-host"

type Option = { id: string; name: string }

export function UploadFileButton({ tenants, buildings }: { tenants: Option[]; buildings: Option[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <>
      <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setOpen(true)}>Загрузить файл</Button>
      <ModalShell open={open} onClose={() => setOpen(false)} title="Загрузить файл" className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <form
          action={(fd) => startTransition(async () => {
            const r = await uploadToStorage(fd)
            if (r.error) { toast.error(r.error); return }
            toast.success("Файл загружен")
            setOpen(false)
            router.refresh()
          })}
          className="space-y-4 p-5"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Загрузить файл</h2>
          <Field label="Файл" hint="PDF, фото, Word или Excel — до 10 МБ">
            <input name="file" type="file" required className={FIELD_CLS} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" />
          </Field>
          <Field label="Арендатор" hint="если файл относится к конкретному арендатору">
            <NativeSelect name="tenantId" defaultValue="">
              <option value="">Не привязывать</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Здание">
            <NativeSelect name="buildingId" defaultValue={buildings.length === 1 ? buildings[0].id : ""}>
              <option value="">Не привязывать</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" name="visibility" value="TENANT_VISIBLE" />
            Показать арендатору в его кабинете
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" loading={pending}>Загрузить</Button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

export function FileRowActions({
  fileId,
  deleted,
  canDelete,
  linked,
}: {
  fileId: string
  deleted: boolean
  canDelete: boolean
  /** файл связан с документом или оплатой — удалять нельзя */
  linked: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (deleted) {
    return (
      <ActionMenu
        tone="icon"
        ariaLabel="Действия с файлом"
        label="⋯"
        align="end"
        width="w-56"
        items={[
          {
            label: "Вернуть из корзины",
            icon: <RotateCcw className="h-4 w-4 text-slate-400" />,
            disabled: pending || !canDelete,
            onSelect: () => startTransition(async () => {
              const r = await restoreStoredFile(fileId)
              if (r.error) { toast.error(r.error); return }
              toast.success("Файл возвращён")
              router.refresh()
            }),
          },
        ]}
      />
    )
  }

  return (
    <ActionMenu
      tone="icon"
      ariaLabel="Действия с файлом"
      label="⋯"
      align="end"
      width="w-56"
      items={[
        { label: "Открыть", icon: <Eye className="h-4 w-4 text-slate-400" />, href: `/api/storage/${fileId}` },
        { label: "Скачать", icon: <Download className="h-4 w-4 text-slate-400" />, href: `/api/storage/${fileId}?download=1`, download: true },
        ...(canDelete && !linked
          ? [{
              label: "В корзину",
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              separatorBefore: true,
              disabled: pending,
              onSelect: () => {
                void (async () => {
                  if (!(await askConfirm({ title: "Убрать файл в корзину?", description: "Оттуда его можно вернуть.", confirmLabel: "В корзину", danger: true }))) return
                  startTransition(async () => {
                    const r = await deleteStoredFile(fileId)
                    if (r.error) { toast.error(r.error); return }
                    toast.success("Файл в корзине")
                    router.refresh()
                  })
                })()
              },
            }]
          : []),
      ]}
    />
  )
}
