import { redirect } from "next/navigation"

// «Отчётность» вошла в «Аналитику» (одна страница вместо трёх вкладок).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams
  redirect(period ? `/admin/analytics?period=${encodeURIComponent(period)}` : "/admin/analytics")
}
