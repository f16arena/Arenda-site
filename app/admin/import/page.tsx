import { redirect } from "next/navigation"

// Обзор импорта повторял вкладки один в один — оставили только вкладки.
export default function ImportHomePage() {
  redirect("/admin/import/tenants")
}
