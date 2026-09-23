"use client"

import { useTransition } from "react"
import { AlertTriangle, LogOut } from "lucide-react"
import { stopImpersonating } from "@/app/actions/organizations"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useT } from "@/lib/i18n/client"
import { RichText } from "@/lib/i18n/rich"

export function ImpersonateBanner({ orgName }: { orgName: string }) {
  const { t } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="bg-amber-400 border-b-2 border-amber-500 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <span>
          <RichText template={t("common.banners.impersonate")} vars={{ org: orgName }} />
        </span>
      </div>
      <button
        onClick={() => {
          startTransition(async () => {
            try {
              await stopImpersonating()
              toast.success(t("common.banners.impersonateLeft"))
              router.push("/superadmin")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : t("common.state.error"))
            }
          })
        }}
        disabled={pending}
        className="flex items-center gap-1.5 rounded bg-amber-900 hover:bg-amber-950 px-3 py-1 text-xs font-medium text-amber-50"
      >
        <LogOut className="h-3 w-3" />
        {t("common.banners.impersonateExit")}
      </button>
    </div>
  )
}
