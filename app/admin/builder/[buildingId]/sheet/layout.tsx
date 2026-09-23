import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Лист чертежа: к словарю конструктора добавляется свой раздел с текстами
 * листа (штамп, выноски, ведомости). Он вынесен отдельно, потому что нужен
 * только здесь, а словарь редактора и без него упирался в бюджет размера.
 */
export default async function BuilderSheetLayout({
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
        "adminObjects",
        "adminBuilder",
        "adminBuilderSheet",
      ])}
    >
      {children}
    </I18nProvider>
  )
}
