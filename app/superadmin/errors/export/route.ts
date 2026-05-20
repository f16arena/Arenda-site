import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { decodeErrorReport, humanizeErrorReport, parseErrorDetails } from "@/lib/error-report"

export const dynamic = "force-dynamic"

// GET /superadmin/errors/export
// Выгружает ВСЕ зафиксированные ошибки (auditLog action=ERROR) одним JSON-файлом.
// Доступ только платформенному владельцу (requirePlatformOwner редиректит остальных).
export async function GET() {
  await requirePlatformOwner()

  const logs = await db.auditLog.findMany({
    where: { action: "ERROR" },
    orderBy: { createdAt: "desc" },
  })

  const errors = logs.map((log) => {
    const details = parseErrorDetails(log.details)
    const human = humanizeErrorReport(details)
    const decoded = decodeErrorReport(details)
    return {
      // Идентификация
      id: log.id,
      errorCode: details.errorId ?? log.entityId ?? log.id,
      createdAt: log.createdAt.toISOString(),
      // Где и кто
      path: details.path ?? null,
      href: details.href ?? null,
      routeKind: details.routeKind ?? null,
      host: details.host ?? null,
      method: details.method ?? null,
      organizationId: details.organizationId ?? null,
      userName: log.userName ?? null,
      userRole: log.userRole ?? null,
      userId: details.userId ?? null,
      ip: log.ip ?? null,
      userAgent: details.userAgent ?? null,
      referrer: details.referrer ?? null,
      // Классификация (для быстрой группировки)
      title: human.title,
      technicalKind: human.technicalKind,
      severity: decoded.severity,
      // Техника (главное для починки)
      digest: details.digest ?? null,
      sentryEventId: details.sentryEventId ?? null,
      source: details.source ?? null,
      message: details.message ?? null,
      stack: details.stack ?? null,
      context: details.context ?? null,
      // Статус поддержки
      supportStatus: details.supportStatus ?? "NEW",
      supportNote: details.supportNote ?? null,
    }
  })

  const payload = {
    exportedAt: new Date().toISOString(),
    total: errors.length,
    errors,
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="commrent-errors-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
