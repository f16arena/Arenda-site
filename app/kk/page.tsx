import { redirect } from "next/navigation"

/**
 * Казахская версия переехала на главную — государственный язык стал основным.
 * Адрес /kk остаётся рабочим: на него уже могли поставить ссылку.
 */
export default function KazakhHomeRedirect() {
  redirect("/")
}
