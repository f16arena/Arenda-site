import type { Metadata } from "next"
import { LandingScreen } from "@/components/landing/v2/landing-screen"
import { getLocale } from "@/lib/i18n/server"

/**
 * Главная — на государственном языке. Русская версия живёт на /ru и доступна
 * одним нажатием из шапки. Если человек уже выбрал русский, показываем его:
 * выбор пользователя важнее умолчания.
 */
export const metadata: Metadata = {
  // absolute — чтобы не дублировался шаблон «… | Commrent» из layout.
  title: {
    absolute: "Commrent — коммерциялық жылжымайтын мүлікті басқару және жалдауды автоматтандыру",
  },
  description:
    "Commrent — Қазақстандағы жалдауды автоматтандыруға арналған бағдарлама: жалға алушылар мен төлемдер есебі, ЭЦҚ-мен электрондық шарт (телефондағы eGov арқылы да), шот пен акт, МКК-дағы ЭШФ. Жалға берушіге арналған CRM — бәрі бір терезеде.",
  keywords: [
    "жалдауды автоматтандыру",
    "жалдауды басқару бағдарламасы",
    "коммерциялық жылжымайтын мүлікті басқару",
    "жалға алушылар есебі",
    "жалға берушіге CRM",
    "электрондық жалдау шарты",
    "ЭЦҚ-мен жалдау шарты",
    "ЭШФ жалдау",
    "жалға беру Қазақстан",
  ],
  alternates: {
    canonical: "/",
    languages: {
      kk: "/",
      ru: "/ru",
    },
  },
}

export default async function Home() {
  return <LandingScreen locale={await getLocale()} />
}
