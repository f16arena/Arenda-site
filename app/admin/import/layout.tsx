import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей импорта (выбор файла, превью, результат).
 * Без провайдера useT() в них вернёт ключ вместо текста. В браузер уходят
 * только нужные разделы, не весь словарь админки.
 */
export default async function AdminImportLayout({ children }: { children: React.ReactNode }) {
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
