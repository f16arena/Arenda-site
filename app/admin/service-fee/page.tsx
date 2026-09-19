import { redirect } from "next/navigation"

// Эксплуатационный сбор настраивается у каждого здания в его карточке
// (/admin/buildings/[id]/service-fee — кнопка «Эксплуатационный сбор» в списке
// зданий). Отдельный сводный список дублировал «Здания» и убран из меню;
// старый адрес ведёт туда, чтобы закладки не ломались.
export default function ServiceFeeListPage() {
  redirect("/admin/buildings")
}
