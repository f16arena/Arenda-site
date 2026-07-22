"use client"

import { useState, useTransition } from "react"
import { StickyNote, Loader2, Check } from "lucide-react"
import { toast } from "sonner"
import { updateTenantNotes } from "@/app/actions/tenant-notes"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

/**
 * Внутренние заметки по арендатору на карточке: журнал общения, договорённости.
 * Арендатору не видны.
 */
export function TenantNotes({ tenantId, initial }: { tenantId: string; initial: string }) {
  const [value, setValue] = useState(initial)
  const [savedValue, setSavedValue] = useState(initial)
  const [pending, startTransition] = useTransition()
  const dirty = value !== savedValue

  function save() {
    startTransition(async () => {
      const r = await updateTenantNotes(tenantId, value)
      if (!r.ok) { toast.error(r.error); return }
      setSavedValue(value)
      toast.success("Заметки сохранены")
    })
  }

  return (
    <Card className="block p-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          Заметки
          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">видны только вам</span>
        </p>
        {dirty && (
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Сохранить
          </Button>
        )}
      </div>
      <div className="p-4">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Журнал общения и договорённости: «05.06 позвонил — обещал оплатить до 10-го», «просил счёт на другой email»…"
          className="resize-y"
        />
      </div>
    </Card>
  )
}
