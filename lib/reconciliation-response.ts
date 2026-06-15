import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { getTenantAdminContactIdsForUser } from "@/lib/tenant-admin-contact"

// Общее ядро ответа арендатора на акт сверки (подтвердить / заявить расхождение).
// Используется и веб-экшеном (app/actions/reconciliation-response.ts), и
// мобильным эндпоинтом — единая логика, чтобы веб и мобайл не расходились.
export async function respondReconciliationByUser(
  userId: string,
  documentId: string,
  agree: boolean,
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const tenant = await db.tenant.findUnique({
    where: { userId },
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

  const adminIds = await getTenantAdminContactIdsForUser(userId)
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

  return { success: true }
}
