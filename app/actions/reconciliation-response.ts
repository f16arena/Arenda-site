"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { respondReconciliationByUser } from "@/lib/reconciliation-response"

// Ответ арендатора на акт сверки: подтвердить взаиморасчёты или заявить
// расхождение с комментарием. Логика — в lib/reconciliation-response (общая с
// мобильным эндпоинтом).
export async function respondToReconciliation(
  documentId: string,
  agree: boolean,
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Не авторизованы" }

  const result = await respondReconciliationByUser(session.user.id, documentId, agree, note)
  if ("success" in result) {
    revalidatePath("/cabinet/documents")
    revalidatePath("/admin/documents")
  }
  return result
}
