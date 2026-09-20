export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { Phone, Plus } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ServerForm } from "@/components/ui/server-form"
import { DeleteAction } from "@/components/ui/delete-action"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/field"
import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"
import {
  addEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
} from "@/app/actions/building"

/**
 * Телефоны аварийных служб по зданию.
 *
 * Раньше их было два места: здесь — только список и кнопка «Добавить», которая
 * ничего не делала, а настоящее редактирование пряталось внизу /admin/settings.
 * Теперь всё здесь: добавить, изменить, удалить.
 */

const CATEGORY_LABELS: Record<string, string> = {
  WATER: "Водоканал",
  ELECTRICITY: "Электросети",
  GAS: "Газовая служба",
  FIRE: "Пожарная служба",
  POLICE: "Полиция",
  AMBULANCE: "Скорая помощь",
  OTHER: "Прочее",
}

export default async function EmergencyPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canEdit = caps.has("settings.updateOrganization")

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const buildingIds = buildingId ? [buildingId] : await getAccessibleBuildingIdsForSession(orgId)

  const building = buildingIds.length > 0
    ? await db.building.findFirst({
        where: { id: { in: buildingIds }, organizationId: orgId },
        select: {
          id: true,
          name: true,
          emergencyContacts: { orderBy: { category: "asc" } },
        },
      })
    : null

  const contacts = building?.emergencyContacts ?? []

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Аварийные службы</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {building
            ? `Телефоны по зданию «${building.name}». Их видят арендаторы в своём кабинете.`
            : "Выберите здание в шапке — телефоны хранятся по каждому зданию отдельно."}
        </p>
      </div>

      {building && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {contacts.length === 0 ? (
            <div className="py-12 text-center">
              <Phone className="mx-auto mb-2 h-8 w-8 text-slate-200 dark:text-slate-700" />
              <p className="text-sm text-slate-400 dark:text-slate-500">Телефоны пока не добавлены</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {contacts.map((contact) => (
                canEdit ? (
                  <ServerForm
                    key={contact.id}
                    action={updateEmergencyContact.bind(null, contact.id)}
                    successMessage="Телефон сохранён"
                    className="grid items-end gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <div>
                      <label className={LABEL_CLS}>{CATEGORY_LABELS[contact.category] ?? contact.category}</label>
                      <input name="name" defaultValue={contact.name} className={FIELD_CLS} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Телефон</label>
                      <input name="phone" defaultValue={contact.phone} className={FIELD_CLS} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">Сохранить</Button>
                      <DeleteAction
                        action={deleteEmergencyContact.bind(null, contact.id)}
                        entity="телефон"
                        successMessage="Телефон удалён"
                      />
                    </div>
                  </ServerForm>
                ) : (
                  <div key={contact.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{contact.name}</p>
                      <p className="text-xs text-slate-400">{CATEGORY_LABELS[contact.category] ?? contact.category}</p>
                    </div>
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{contact.phone}</p>
                  </div>
                )
              ))}
            </div>
          )}

          {canEdit && (
            <ServerForm
              action={addEmergencyContact.bind(null, building.id)}
              successMessage="Телефон добавлен"
              className="grid items-end gap-3 border-t border-dashed border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <div>
                <label className={LABEL_CLS}>Какая служба</label>
                <NativeSelect name="category" defaultValue="WATER">
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <label className={LABEL_CLS}>Название</label>
                <input name="name" placeholder="Например: Диспетчер водоканала" required className={FIELD_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Телефон</label>
                <input name="phone" placeholder="+7…" required className={FIELD_CLS} />
              </div>
              <Button type="submit" size="sm" leftIcon={<Plus className="h-4 w-4" />}>Добавить</Button>
            </ServerForm>
          )}
        </div>
      )}
    </div>
  )
}
