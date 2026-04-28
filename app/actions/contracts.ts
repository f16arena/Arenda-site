"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireAdmin } from "@/lib/permissions"
import { isContractNumberUnique, suggestContractNumber } from "@/lib/contract-numbering"

export async function setContractPrefix(buildingId: string, formData: FormData) {
  await requireAdmin()
  const prefix = String(formData.get("contractPrefix") ?? "").trim().toUpperCase()
  if (prefix && !/^[A-Z0-9-]{1,10}$/i.test(prefix)) {
    throw new Error("Префикс может содержать только латинские буквы, цифры и дефис, до 10 символов")
  }
  await db.building.update({
    where: { id: buildingId },
    data: { contractPrefix: prefix || null },
  })
  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
}

export async function createContract(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const tenantId = String(formData.get("tenantId") ?? "")
  const number = String(formData.get("number") ?? "").trim()
  const startDate = String(formData.get("startDate") ?? "")
  const endDate = String(formData.get("endDate") ?? "")
  const type = String(formData.get("type") ?? "STANDARD")
  const content = String(formData.get("content") ?? "")

  if (!tenantId) throw new Error("Не указан арендатор")
  if (!number) throw new Error("Не указан номер договора")

  // Найдём здание арендатора для проверки уникальности номера
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      space: { include: { floor: { select: { buildingId: true } } } },
      fullFloors: { select: { buildingId: true }, take: 1 },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  const buildingId = tenant.space?.floor.buildingId ?? tenant.fullFloors[0]?.buildingId
  if (!buildingId) throw new Error("Арендатор не привязан ни к помещению ни к этажу")

  const unique = await isContractNumberUnique(buildingId, number)
  if (!unique) {
    const suggested = await suggestContractNumber(buildingId)
    throw new Error(`Номер «${number}» уже используется в этом здании. Предлагается: ${suggested}`)
  }

  const contract = await db.contract.create({
    data: {
      tenantId,
      number,
      type,
      content: content || `Договор аренды № ${number}`,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: "DRAFT",
    },
  })

  // Обновим контра-счётчик в здании (для подсказки следующего)
  const seqMatch = number.match(/(\d+)$/)
  if (seqMatch) {
    const seq = parseInt(seqMatch[1])
    await db.building.update({
      where: { id: buildingId },
      data: { contractCounter: { set: seq } },
    })
  }

  revalidatePath("/admin/contracts")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { id: contract.id }
}
