import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/** Словарь для клиентских диалогов счётчиков (показания, новый счётчик). */
export default async function AdminMetersLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminFinance"])}
    >
      {children}
    </I18nProvider>
  )
}
