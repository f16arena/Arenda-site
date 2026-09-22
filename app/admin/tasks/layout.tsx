import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для формы новой задачи (клиентский диалог). Без провайдера useT()
 * в ней вернёт ключ вместо текста. В браузер уходят только нужные разделы.
 */
export default async function AdminTasksLayout({ children }: { children: React.ReactNode }) {
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
