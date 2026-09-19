import { redirect } from "next/navigation"

// «Финансовый дашборд» вошёл в «Аналитику» (одна страница вместо трёх вкладок).
export default function OwnerDashboardPage() {
  redirect("/admin/analytics")
}
