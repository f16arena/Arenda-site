"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, LogIn } from "lucide-react"
import { toast } from "sonner"
import { impersonateOrg } from "@/app/actions/organizations"

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

  return (
    <div className="flex items-center justify-end gap-1.5">
      {hasOwner && isActive && (
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Войти как клиент в «${name}»? Действия записываются в журнал.`)) return
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
          disabled={pending}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-700 disabled:bg-slate-300"
          title="Войти как клиент"
        >
          <LogIn className="h-3 w-3" />
          Войти
        </button>
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
