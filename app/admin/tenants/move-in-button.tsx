"use client"

// «Заселить арендатора» — окно прямо в списке арендаторов: не нужно уходить
// на отдельную страницу и возвращаться назад. Страница /admin/tenants/new
// остаётся для прямых ссылок (например, «Заселить» со свободного помещения).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Wand2 } from "lucide-react"
import { ModalShell } from "@/components/ui/modal"
import { TenantWizard } from "./new/tenant-wizard"
import { useT } from "@/lib/i18n/client"

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
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="order-last inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        title={t("adminTenants.wizard.openHint")}
      >
        <Wand2 className="h-4 w-4" />
        {t("adminTenants.wizard.openButton")}
      </button>

      <ModalShell
        open={open}
        onClose={() => { setOpen(false); router.refresh() }}
        title={t("adminTenants.wizard.openButton")}
        className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
      >
        <TenantWizard vacantSpaces={vacantSpaces} onClose={() => { setOpen(false); router.refresh() }} />
      </ModalShell>
    </>
  )
}
