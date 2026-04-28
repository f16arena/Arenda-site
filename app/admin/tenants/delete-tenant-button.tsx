"use client"

import { DeleteAction } from "@/components/ui/delete-action"
import { deleteTenant } from "@/app/actions/tenant"

export function DeleteTenantButton({
  tenantId,
  companyName,
  redirectAfter,
}: {
  tenantId: string
  companyName: string
  redirectAfter?: boolean
}) {
  return (
    <DeleteAction
      action={() => deleteTenant(tenantId, { redirectAfter })}
      entity="арендатора"
      description={`Будут удалены все начисления, платежи, договоры и заявки арендатора «${companyName}». Помещение освободится. Это действие нельзя отменить.`}
      successMessage={`Арендатор «${companyName}» удалён`}
    />
  )
}
