"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, LogIn } from "lucide-react"
import { toast } from "sonner"
import { impersonateOrg } from "@/app/actions/organizations"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function OrgRowActions({
  id,
  name,
  hasOwner,
  isActive,
}: {
  id: string
  name: string
  hasOwner: boolean
  isActive: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(id)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center justify-end gap-1.5" suppressHydrationWarning>
        {hasOwner && isActive && <span className="h-7 w-16 rounded-md bg-slate-100 dark:bg-slate-800" />}
        <span className="h-7 w-20 rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {hasOwner && isActive && (
        <ConfirmDialog
          title={`Войти как клиент в «${name}»?`}
          description="Все действия в режиме клиента записываются в журнал."
          confirmLabel="Войти"
          onConfirm={() => {
            startTransition(async () => {
              try {
                await impersonateOrg(id)
                toast.success("Входим как клиент...")
                router.push("/admin")
                router.refresh()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Не удалось войти как клиент")
              }
            })
          }}
          trigger={
            <button
              type="button"
              disabled={pending}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-700 disabled:bg-slate-300"
              title="Войти как клиент"
            >
              <LogIn className="h-3 w-3" />
              Войти
            </button>
          }
        />
      )}
      <Link
        href={`/superadmin/orgs/${id}`}
        className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        <ExternalLink className="h-3 w-3" />
        Открыть
      </Link>
    </div>
  )
}
