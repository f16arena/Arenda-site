import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентской матрицы прав (разделы, точные действия, личные
 * исключения). Без провайдера useT() в ней вернёт ключ вместо текста.
 */
export default async function AdminRolesLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminSettings"])}
    >
      {children}
    </I18nProvider>
  )
}
