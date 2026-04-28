"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, LogOut } from "lucide-react"
import { exitOrgAsPlatformOwner } from "@/app/actions/organizations"
import { toast } from "sonner"

export function PlatformViewBanner({ orgName }: { orgName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="bg-purple-100 border-b-2 border-purple-300 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-purple-900">
        <Eye className="h-4 w-4" />
        Платформенный просмотр <b>{orgName}</b>. Вы действуете от своего имени.
      </div>
      <button
        onClick={() => {
          startTransition(async () => {
            try {
              await exitOrgAsPlatformOwner()
              router.push("/admin")
              router.refresh()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ошибка")
            }
          })
        }}
        disabled={pending}
        className="flex items-center gap-1.5 rounded bg-purple-700 hover:bg-purple-800 px-3 py-1 text-xs font-medium text-white"
      >
        <LogOut className="h-3 w-3" />
        Покинуть
      </button>
    </div>
  )
}
