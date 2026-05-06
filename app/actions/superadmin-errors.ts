"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { parseErrorDetails, type ErrorReportDetails } from "@/lib/error-report"
import { requirePlatformOwner } from "@/lib/org"

export type ErrorSupportStatus = "NEW" | "IN_PROGRESS" | "RESOLVED"

const SUPPORT_STATUSES = new Set<ErrorSupportStatus>(["NEW", "IN_PROGRESS", "RESOLVED"])

export async function updateErrorSupportStatus(formData: FormData): Promise<void> {
  const { userId } = await requirePlatformOwner()
  const logId = String(formData.get("logId") ?? "").trim()
  const status = normalizeSupportStatus(String(formData.get("status") ?? ""))
  const note = String(formData.get("note") ?? "").trim().slice(0, 500)

  if (!logId) throw new Error("Не указана ошибка")
  if (!status) throw new Error("Неверный статус ошибки")

  const log = await db.auditLog.findFirst({
    where: { id: logId, action: "ERROR" },
    select: { id: true, entityId: true, details: true },
  })
  if (!log) throw new Error("Ошибка не найдена")

  const details: ErrorReportDetails = parseErrorDetails(log.details)
  const now = new Date().toISOString()
  const nextDetails: ErrorReportDetails = {
    ...details,
    supportStatus: status,
    supportNote: note || details.supportNote || null,
    supportUpdatedAt: now,
    supportUpdatedBy: userId,
    supportResolvedAt: status === "RESOLVED" ? now : null,
  }

  await db.$transaction([
    db.auditLog.update({
      where: { id: log.id },
      data: { details: JSON.stringify(nextDetails) },
    }),
    db.auditLog.create({
      data: {
        userId,
        userName: null,
        userRole: "PLATFORM_OWNER",
        action: "UPDATE",
        entity: "error-support",
        entityId: log.entityId ?? log.id,
        details: JSON.stringify({
          logId: log.id,
          errorId: details.errorId ?? log.entityId ?? log.id,
          status,
          note: note || null,
          at: now,
        }),
      },
    }),
  ])

  revalidatePath("/superadmin/errors")
  revalidatePath("/superadmin")
}

function normalizeSupportStatus(value: string): ErrorSupportStatus | null {
  const normalized = value.toUpperCase() as ErrorSupportStatus
  return SUPPORT_STATUSES.has(normalized) ? normalized : null
}
