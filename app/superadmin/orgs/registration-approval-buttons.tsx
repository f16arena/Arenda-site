"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { approveOrganizationRegistration, rejectOrganizationRegistration } from "@/app/actions/approvals"

// Подтверждение/отклонение заявки на регистрацию с обработкой ошибок (тост),
// вместо «голых» server-action форм, где любая ошибка ломала всю страницу.
export function RegistrationApprovalButtons({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      try {
        await approveOrganizationRegistration(orgId)
        toast.success(`Организация «${orgName}» подтверждена`)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось подтвердить")
      }
    })
  }

  function reject() {
    const reason = window.prompt(`Причина отказа для «${orgName}»?`, "Отклонено суперадмином")
    if (reason === null) return
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("reason", reason.trim() || "Отклонено суперадмином")
        await rejectOrganizationRegistration(orgId, fd)
        toast.success(`Заявка «${orgName}» отклонена`)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось отклонить")
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={approve}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        Подтвердить
      </button>
      <button
        onClick={reject}
        disabled={pending}
        className="rounded-md border border-red-300 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
      >
        Отклонить
      </button>
    </div>
  )
}
