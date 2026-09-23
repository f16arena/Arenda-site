import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Финансы» кабинета арендатора: экран
 * оплаты, документы к оплате, история. Без провайдера useT() вернёт сам ключ
 * вместо текста — компилятор такое не ловит, ключ-то в типе есть.
 */
export default async function CabinetFinancesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], [
        "common",
        "domain",
        "cabinetFinances",
        "cabinetPayment",
        "cabinetPayDocs",
      ])}
    >
      {children}
    </I18nProvider>
  )
}
