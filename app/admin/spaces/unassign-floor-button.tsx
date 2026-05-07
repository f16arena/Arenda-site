"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { unassignFullFloor } from "@/app/actions/floor-assignment"
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
  const [pending, startTransition] = useTransition()

  const handle = () => {
    startTransition(async () => {
      try {
        await unassignFullFloor(floorId)
        toast.success(`«${tenantName}» снят с этажа «${floorName}»`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось снять арендатора")
      }
    })
  }

  return (
    <ConfirmDialog
      variant="danger"
      title={`Снять «${tenantName}» с этажа «${floorName}»?`}
      description={
        "Помещения этажа станут доступны для индивидуальной сдачи. " +
        "Договор с арендатором останется в системе. " +
        "Это действие можно откатить — назначить арендатора на этаж заново в его карточке."
      }
      confirmLabel="Снять с этажа"
      onConfirm={handle}
      trigger={
        <button
          disabled={pending}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60 transition-colors"
        >
          {pending ? "Снятие..." : "Снять с этажа"}
        </button>
      }
    />
  )
}
