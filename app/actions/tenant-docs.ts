"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg, assertTenantDocumentInOrg } from "@/lib/scope-guards"

export async function addTenantDocument(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const type = String(formData.get("type") ?? "OTHER")
  const name = String(formData.get("name") ?? "").trim()
  const fileUrl = String(formData.get("fileUrl") ?? "").trim()

  if (!name) throw new Error("Название документа обязательно")
  if (!fileUrl) throw new Error("Укажите ссылку на файл (Drive, Dropbox и т.д.)")

  await db.tenantDocument.create({
    data: { tenantId, type, name, fileUrl },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function deleteTenantDocument(documentId: string) {
  const { orgId } = await requireOrgAccess()
  await assertTenantDocumentInOrg(documentId, orgId)

  const doc = await db.tenantDocument.findUnique({
    where: { id: documentId },
    select: { tenantId: true },
  })
  if (!doc) throw new Error("Документ не найден")

  await db.tenantDocument.delete({ where: { id: documentId } })
  revalidatePath(`/admin/tenants/${doc.tenantId}`)
}
