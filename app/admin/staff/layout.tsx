import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей команды: диалоги сотрудника, зарплата,
 * форма в карточке. Без провайдера useT() в них вернул бы ключ.
 */
export default async function AdminStaffLayout({ children }: { children: React.ReactNode }) {
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
