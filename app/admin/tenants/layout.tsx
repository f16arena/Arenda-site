import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Арендаторы» (таблица, мастер
 * заселения, окна договоров, реквизитов и условий аренды). Без провайдера
 * useT() в них вернёт ключ вместо текста. В браузер уходят только нужные
 * разделы, не весь словарь админки.
 */
export default async function AdminTenantsLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminTenants"])}
    >
      {children}
    </I18nProvider>
  )
}
