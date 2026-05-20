"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Copy, KeyRound, X } from "lucide-react"
import { resetOwnerPassword } from "@/app/actions/superadmin-users"

export function ResetOwnerPasswordButton({ userId, ownerName }: { userId: string; ownerName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function close() {
    setOpen(false)
    setTempPassword(null)
    setCopied(false)
    if (tempPassword) router.refresh()
  }

  function doReset() {
    startTransition(async () => {
      try {
        const { tempPassword } = await resetOwnerPassword(userId)
        setTempPassword(tempPassword)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сбросить пароль")
      }
    })
  }

  async function copy() {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Сбросить пароль
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 p-6 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Сбросить пароль владельцу
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{ownerName}</p>
              </div>
              <button onClick={close} aria-label="Закрыть" className="text-slate-400 hover:text-slate-600 dark:text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!tempPassword ? (
              <div className="px-6 pb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Будет сгенерирован новый временный пароль. Старый пароль перестанет работать,
                  а владелец будет обязан сменить пароль при первом входе.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={close}
                    disabled={pending}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={doReset}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                  >
                    {pending ? "Сбрасываю…" : "Сбросить"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 pb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Новый временный пароль. Скопируйте и передайте владельцу — он показывается только один раз.
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <code className="flex-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{tempPassword}</code>
                  <button
                    onClick={copy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <button
                  onClick={close}
                  className="mt-5 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Готово
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
