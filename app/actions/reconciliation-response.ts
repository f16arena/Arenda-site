"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { notifyUser } from "@/lib/notify"
import { getTenantAdminContactIdsForUser } from "@/lib/tenant-admin-contact"

// Ответ арендатора на акт сверки: подтвердить взаиморасчёты или заявить
// расхождение с комментарием. Уведомляет администратора(ов) арендатора.
export async function respondToReconciliation(
  documentId: string,
  agree: boolean,
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Не авторизованы" }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, companyName: true },
  })
  if (!tenant) return { error: "Профиль арендатора не найден" }

  const doc = await db.generatedDocument.findFirst({
    where: { id: documentId, tenantId: tenant.id, documentType: "RECONCILIATION", deletedAt: null },
    select: { id: true, number: true, reconStatus: true },
  })
  if (!doc) return { error: "Акт сверки не найден" }
  if (doc.reconStatus === "AGREED" || doc.reconStatus === "DISPUTED") {
    return { error: "Вы уже ответили по этому акту сверки" }
  }

  const cleanNote = (note ?? "").trim().slice(0, 1000)
  if (!agree && !cleanNote) return { error: "Опишите, в чём расхождение" }

  await db.generatedDocument.update({
    where: { id: doc.id },
    data: {
      reconStatus: agree ? "AGREED" : "DISPUTED",
      reconRespondedAt: new Date(),
      reconResponseNote: agree ? null : cleanNote,
    },
  })

  const adminIds = await getTenantAdminContactIdsForUser(session.user.id)
  const docNo = doc.number ? `№ ${doc.number}` : ""
  for (const adminId of adminIds) {
    await notifyUser({
      userId: adminId,
      type: agree ? "RECON_AGREED" : "RECON_DISPUTED",
      title: agree ? "Акт сверки подтверждён" : "Расхождение в акте сверки",
      message: agree
        ? `${tenant.companyName} подтвердил акт сверки ${docNo}.`
        : `${tenant.companyName} заявил расхождение по акту сверки ${docNo}: ${cleanNote}`,
      link: "/admin/documents",
    }).catch(() => {})
  }

  revalidatePath("/cabinet/documents")
  revalidatePath("/admin/documents")
  return { success: true }
}
