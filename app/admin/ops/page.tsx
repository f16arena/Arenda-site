import { redirect } from "next/navigation"

// Легаси-экран «Сегодня» дублировал главную (/admin) — операционные действия
// давно живут там (редизайн, этап 1: одна задача — одно место). Оставлен как
// permanent redirect: старые закладки и ссылки из уведомлений продолжают работать.
export default function OpsPage() {
  redirect("/admin")
}
