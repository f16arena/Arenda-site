"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { Prisma } from "@/app/generated/prisma/client"
import { assemble, type ContractState } from "@/lib/contract-engine"
import { renderContractDocx } from "@/lib/contract-engine/docx"

// Server actions конструктора договоров (Фаза 3). Работают с НОВОЙ таблицей
// contract_drafts, не трогая contracts / document_templates / подпись.

export interface SaveDraftInput {
  id?: string
  name: string
  builderState: ContractState
  tenantId?: string | null
}

export interface DraftListItem {
  id: string
  name: string
  status: string
  tenantId: string | null
  updatedAt: Date
}

export async function saveContractDraft(input: SaveDraftInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const session = await auth()
    const { orgId } = await requireOrgAccess()

    const data = {
      name: input.name?.trim() || "Без названия",
      builderState: input.builderState as unknown as Prisma.InputJsonValue,
      tenantId: input.tenantId ?? null,
    }

    let id = input.id
    if (id) {
      // обновляем только в пределах своей организации
      const res = await db.contractDraft.updateMany({
        where: { id, organizationId: orgId, deletedAt: null },
        data,
      })
      if (res.count === 0) return { ok: false, error: "Черновик не найден" }
    } else {
      const created = await db.contractDraft.create({
        data: { ...data, organizationId: orgId, createdById: session?.user?.id ?? null },
        select: { id: true },
      })
      id = created.id
    }

    revalidatePath("/admin/settings/document-templates")
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить" }
  }
}

export async function listContractDrafts(): Promise<DraftListItem[]> {
  const { orgId } = await requireOrgAccess()
  const rows = await db.contractDraft.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, tenantId: true, updatedAt: true },
    take: 100,
  })
  return rows
}

export async function loadContractDraft(
  id: string,
): Promise<{ ok: boolean; name?: string; builderState?: ContractState; error?: string }> {
  const { orgId } = await requireOrgAccess()
  const row = await db.contractDraft.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: { name: true, builderState: true },
  })
  if (!row) return { ok: false, error: "Черновик не найден" }
  return { ok: true, name: row.name, builderState: row.builderState as unknown as ContractState }
}

export async function deleteContractDraft(id: string): Promise<{ ok: boolean }> {
  await requireCapabilityAndFeature("documents.uploadTemplate")
  const { orgId } = await requireOrgAccess()
  await db.contractDraft.updateMany({
    where: { id, organizationId: orgId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath("/admin/settings/document-templates")
  return { ok: true }
}

/**
 * Серверная генерация DOCX из переданного состояния конструктора. Возвращает
 * base64 (клиент инициирует скачивание). Блокирует генерацию при hard-ошибках.
 * Архивация в GeneratedDocument — отдельная фаза интеграции (5).
 */
export async function generateContractDocx(
  builderState: ContractState,
): Promise<{ ok: boolean; fileName?: string; base64?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()

    const a = assemble(builderState)
    if (a.validation.hard.length) {
      return { ok: false, error: "Договор содержит ошибки: " + a.validation.hard.join("; ") }
    }

    const buf = await renderContractDocx(builderState)
    const num = (builderState.meta.contractNumber || "draft").replace(/[^\w.-]+/g, "_")
    return { ok: true, fileName: `Договор_${num}.docx`, base64: buf.toString("base64") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сгенерировать" }
  }
}
