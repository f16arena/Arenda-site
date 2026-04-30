"use client"

import { useTransition } from "react"
import { AlertTriangle, LogOut } from "lucide-react"
import { stopImpersonating } from "@/app/actions/organizations"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function ImpersonateBanner({ orgName }: { orgName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="bg-amber-400 border-b-2 border-amber-500 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        Вы вошли как поддержка в <b>{orgName}</b>. Все действия записываются в журнал.
      </div>
      <button
        onClick={() => {
          startTransition(async () => {
            try {
              await stopImpersonating()
              toast.success("Вышли из режима поддержки")
              router.push("/superadmin")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ошибка")
            }
          })
        }}
        disabled={pending}
        className="flex items-center gap-1.5 rounded bg-amber-900 hover:bg-amber-950 px-3 py-1 text-xs font-medium text-amber-50"
      >
        <LogOut className="h-3 w-3" />
        Выйти из режима
      </button>
    </div>
  )
}
