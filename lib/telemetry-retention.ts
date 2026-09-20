import "server-only"
import { db } from "@/lib/db"

// Срок хранения служебных логов. Раньше они не чистились: web_vital_metrics
// копились с мая и стали самой большой таблицей базы. Бизнес-данные
// (начисления, оплаты, документы, аудит) здесь не трогаются.
const KEEP_DAYS = {
  webVitals: 30,
  serverPerformance: 30,
  /** аудит действий пользователей — храним год */
  audit: 365,
} as const

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

export async function pruneTelemetry(): Promise<{ webVitals: number; serverPerformance: number; audit: number }> {
  const [webVitals, serverPerformance, audit] = await Promise.all([
    db.webVitalMetric.deleteMany({ where: { createdAt: { lt: daysAgo(KEEP_DAYS.webVitals) } } }).then((r) => r.count).catch(() => 0),
    db.serverPerformanceLog.deleteMany({ where: { createdAt: { lt: daysAgo(KEEP_DAYS.serverPerformance) } } }).then((r) => r.count).catch(() => 0),
    db.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(KEEP_DAYS.audit) } } }).then((r) => r.count).catch(() => 0),
  ])
  return { webVitals, serverPerformance, audit }
}
