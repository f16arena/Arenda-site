import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентской части жалоб (диалог ответа арендатору).
 * Без провайдера useT() в нём вернёт ключ вместо текста.
 */
export default async function AdminComplaintsLayout({ children }: { children: React.ReactNode }) {
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
