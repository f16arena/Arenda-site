"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { unassignFullFloor } from "@/app/actions/floor-assignment"
import { useT } from "@/lib/i18n/client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function UnassignFloorButton({
  floorId,
  floorName,
  tenantName,
}: {
  floorId: string
  floorName: string
  tenantName: string
}) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  const handle = () => {
    startTransition(async () => {
      try {
        await unassignFullFloor(floorId)
        toast.success(t("adminObjects.unassignFloor.done", { tenant: tenantName, floor: floorName }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminObjects.unassignFloor.failed"))
      }
    })
  }

  return (
    <ConfirmDialog
      variant="danger"
      title={t("adminObjects.unassignFloor.title", { tenant: tenantName, floor: floorName })}
      description={t("adminObjects.unassignFloor.text")}
      confirmLabel={t("adminObjects.unassignFloor.confirm")}
      cancelLabel={t("common.actions.cancel")}
      onConfirm={handle}
      trigger={
        <button
          disabled={pending}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60 transition-colors"
        >
          {pending ? t("adminObjects.unassignFloor.pending") : t("adminObjects.unassignFloor.confirm")}
        </button>
      }
    />
  )
}
