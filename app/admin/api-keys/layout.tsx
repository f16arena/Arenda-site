import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентской части API-ключей (создание ключа, таблица, отзыв).
 * Без провайдера useT() вернёт ключ вместо текста.
 */
export default async function AdminApiKeysLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "adminSettings"])}
    >
      {children}
    </I18nProvider>
  )
}
