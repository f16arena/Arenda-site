import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей хранилища (загрузка файла, действия со
 * строкой). Без провайдера useT() в них вернёт ключ вместо текста.
 */
export default async function AdminStorageLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminDocs"])}
    >
      {children}
    </I18nProvider>
  )
}
