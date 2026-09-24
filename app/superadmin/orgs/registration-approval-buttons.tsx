"use client"
import { askText } from "@/components/ui/dialog-host"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { approveOrganizationRegistration, rejectOrganizationRegistration } from "@/app/actions/approvals"
import { useT } from "@/lib/i18n/client"

// Подтверждение/отклонение заявки на регистрацию с обработкой ошибок (тост),
// вместо «голых» server-action форм, где любая ошибка ломала всю страницу.
export function RegistrationApprovalButtons({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      try {
        await approveOrganizationRegistration(orgId)
        toast.success(t("superadmin.orgs.approved", { name: orgName }))
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("superadmin.orgs.approveFailed"))
      }
    })
  }

  async function reject() {
    const fallbackReason = t("superadmin.orgs.rejectDefault")
    const reason = await askText({
      title: t("superadmin.orgs.rejectTitle", { name: orgName }),
      label: t("superadmin.orgs.rejectReason"),
      defaultValue: fallbackReason,
      confirmLabel: t("superadmin.orgs.reject"),
    })
    if (reason === null) return
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("reason", reason.trim() || fallbackReason)
        await rejectOrganizationRegistration(orgId, fd)
        toast.success(t("superadmin.orgs.rejected2", { name: orgName }))
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("superadmin.orgs.rejectFailed"))
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
        {t("superadmin.orgs.approve")}
      </button>
      <button
        onClick={reject}
        disabled={pending}
        className="rounded-md border border-red-300 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
      >
        {t("superadmin.orgs.reject")}
      </button>
    </div>
  )
}
