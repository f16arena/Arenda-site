import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей страницы договора (отправка на подпись,
 * скачивание подписанного файла, конструктор допсоглашения). Без провайдера
 * useT() в них вернёт ключ вместо текста.
 */
export default async function AdminContractsLayout({ children }: { children: React.ReactNode }) {
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
