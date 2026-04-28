"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"

export async function addTenantDocument(tenantId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

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
  const doc = await db.tenantDocument.findUnique({
    where: { id: documentId },
    select: { tenantId: true },
  })
  if (!doc) throw new Error("Документ не найден")

  await db.tenantDocument.delete({ where: { id: documentId } })
  revalidatePath(`/admin/tenants/${doc.tenantId}`)
}
