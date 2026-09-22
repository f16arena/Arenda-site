import type { Metadata } from "next"
import { LandingScreen } from "@/components/landing/v2/landing-screen"
import { getLocale } from "@/lib/i18n/server"

export const metadata: Metadata = {
  // absolute — чтобы не дублировался шаблон «… | Commrent» из layout.
  title: {
    absolute: "Commrent — автоматизация аренды и управление коммерческой недвижимостью в Казахстане",
  },
  description:
    "Commrent — программа для автоматизации аренды и управления коммерческой недвижимостью в Казахстане: учёт арендаторов и платежей, электронный договор с ЭЦП (в т.ч. с телефона через eGov), счёт/АВР, ЭСФ в КГД. CRM для арендодателя — всё в одном окне.",
  keywords: [
    "автоматизация аренды",
    "программа для управления арендой",
    "управление коммерческой недвижимостью",
    "учёт арендаторов",
    "CRM для арендодателя",
    "электронный договор аренды",
    "договор аренды с ЭЦП",
    "ЭСФ аренда",
    "аренда Казахстан",
  ],
  alternates: {
    canonical: "/",
    // Поисковик должен знать про казахскую версию и не считать её дублем.
    languages: {
      ru: "/",
      kk: "/kk",
    },
  },
}

export default async function Home() {
  // Русская главная, но если человек уже выбрал казахский — показываем его.
  return <LandingScreen locale={await getLocale()} />
}
