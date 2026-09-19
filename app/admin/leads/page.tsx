import { redirect } from "next/navigation"

// Страница «Лиды (CRM)» убрана 19.09.2026 по решению владельца: заявки на аренду
// с формы бронирования и витрины здания приходят уведомлением владельцу и
// администратору здания (lib/rental-inquiry.ts). Старый адрес — на обзор.
export default function LeadsPage() {
  redirect("/admin")
}
