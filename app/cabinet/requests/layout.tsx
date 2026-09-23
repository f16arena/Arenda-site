import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Заявки» кабинета арендатора.
 * Без провайдера useT() вернёт сам ключ вместо текста — компилятор такое не
 * ловит, ключ-то в типе есть.
 */
export default async function CabinetRequestsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "cabinetSupport"])}
    >
      {children}
    </I18nProvider>
  )
}
