"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { tariffScope } from "@/lib/tenant-scope"
import { getT } from "@/lib/i18n/server"

// Переводчик приходит параметром: чистый помощник сам его не добывает.
type Tr = Awaited<ReturnType<typeof getT>>["t"]

async function assertTariffInOrg(id: string, orgId: string, t: Tr) {
  const found = await db.tariff.findFirst({
    where: { id, ...tariffScope(orgId) },
    select: { id: true },
  })
  if (!found) throw new Error(t("actions.tariffs.notFoundOrNoAccess"))
}

export async function createTariff(buildingId: string, formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("finance.manageTariffs")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const type = String(formData.get("type") ?? "OTHER")
  const name = String(formData.get("name") ?? "").trim()
  const rateStr = String(formData.get("rate") ?? "")
  const unit = String(formData.get("unit") ?? t("actions.tariffs.defaultUnit"))
  const description = String(formData.get("description") ?? "").trim()

  if (!name) throw new Error(t("actions.common.nameRequired"))
  if (!rateStr) throw new Error(t("actions.tariffs.rateRequired"))

  await db.tariff.create({
    data: {
      buildingId,
      type,
      name,
      rate: parseFloat(rateStr),
      unit,
      description: description || null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}

export async function updateTariff(tariffId: string, formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("finance.manageTariffs")
  const { orgId } = await requireOrgAccess()
  await assertTariffInOrg(tariffId, orgId, t)

  const name = String(formData.get("name") ?? "").trim()
  const rateStr = String(formData.get("rate") ?? "")
  const unit = String(formData.get("unit") ?? t("actions.tariffs.defaultUnit"))
  const description = String(formData.get("description") ?? "").trim()
  const isActive = formData.get("isActive") === "on"

  if (!name) throw new Error(t("actions.common.nameRequired"))
  if (!rateStr) throw new Error(t("actions.tariffs.rateRequired"))

  await db.tariff.update({
    where: { id: tariffId },
    data: {
      name,
      rate: parseFloat(rateStr),
      unit,
      description: description || null,
      isActive,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}

export async function deleteTariff(tariffId: string) {
  const { t } = await getT()
  await requireCapabilityAndFeature("finance.manageTariffs")
  const { orgId } = await requireOrgAccess()
  await assertTariffInOrg(tariffId, orgId, t)

  await db.tariff.delete({ where: { id: tariffId } })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}
