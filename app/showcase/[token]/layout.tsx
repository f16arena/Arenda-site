import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Витрина открывается по публичной ссылке и показывает ту же сцену, что и
 * конструктор, — значит ей нужен тот же словарь. Без провайдера useT() в
 * BuilderApp вернул бы ключи вместо подписей.
 */
export default async function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminBuilder"])}
    >
      {children}
    </I18nProvider>
  )
}
