"use client"

// «Заселить арендатора» — окно прямо в списке арендаторов: не нужно уходить
// на отдельную страницу и возвращаться назад. Страница /admin/tenants/new
// остаётся для прямых ссылок (например, «Заселить» со свободного помещения).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Wand2 } from "lucide-react"
import { ModalShell } from "@/components/ui/modal"
import { TenantWizard } from "./new/tenant-wizard"

type WizardSpace = {
  id: string
  number: string
  area: number
  floorName: string
  ratePerSqm: number
  buildingId: string
  buildingName: string
}

export function MoveInTenantButton({ vacantSpaces }: { vacantSpaces: WizardSpace[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="order-last inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        title="Заселение за 3 шага: контакты → помещение и условия → договор"
      >
        <Wand2 className="h-4 w-4" />
        Заселить арендатора
      </button>

      <ModalShell
        open={open}
        onClose={() => { setOpen(false); router.refresh() }}
        title="Заселить арендатора"
        className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
      >
        <TenantWizard vacantSpaces={vacantSpaces} onClose={() => { setOpen(false); router.refresh() }} />
      </ModalShell>
    </>
  )
}
