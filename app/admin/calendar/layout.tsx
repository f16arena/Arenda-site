import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентской сетки календаря (месяцы, фильтры событий, итоги).
 * Без провайдера useT() в ней вернёт ключ вместо текста.
 */
export default async function AdminCalendarLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminService"])}
    >
      {children}
    </I18nProvider>
  )
}
