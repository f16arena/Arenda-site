import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Финансы» (диалоги оплат, расходов,
 * рассрочки, импорта). Без провайдера useT() в них вернёт ключ вместо текста.
 * В браузер уходят только нужные разделы, не весь словарь админки.
 */
export default async function AdminFinancesLayout({ children }: { children: React.ReactNode }) {
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
