import { Zap } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { updateOrganizationFeatures } from "@/app/actions/organization-settings"
import { additionalChargesEnabled } from "@/lib/org-features"
import { Button } from "@/components/ui/button"

interface Props {
  organization: { id: string; features: string | null }
}

/** Тумблер: показывать ли раздел «Дополнительные начисления» в карточке арендатора. */
export function AdditionalChargesSection({ organization }: Props) {
  const enabled = additionalChargesEnabled(organization.features)
  return (
    <CollapsibleCard title="Дополнительные начисления" icon={<Zap className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm
        action={updateOrganizationFeatures.bind(null, organization.id)}
        successMessage="Настройка сохранена"
        className="p-5 space-y-4"
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="additionalChargesEnabled"
            defaultChecked={enabled}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Показывать раздел «Дополнительные начисления»</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ручные начисления арендатору за свет, воду, отопление и прочие услуги
              (вкладка «Начисления» в карточке арендатора). Если у вас применяются
              эксплуатационные расходы, которые уже включают коммунальные услуги —
              этот раздел можно отключить, чтобы не дублировать.
            </p>
          </div>
        </label>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm">Сохранить</Button>
        </div>
      </ServerForm>
    </CollapsibleCard>
  )
}
