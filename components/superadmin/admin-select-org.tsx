import { I18nProvider } from "@/lib/i18n/client"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"
import { getLocale } from "@/lib/i18n/server"
import { AdminSelectOrgView, type SelectableOrg } from "./admin-select-org-view"

export type { SelectableOrg }

/**
 * Выбор организации платформенным администратором.
 *
 * Экран показывается вместо каркаса /admin, то есть выше него нет ни одного
 * I18nProvider — поэтому раздел словаря подключаем здесь. Разметка и кнопки
 * живут в клиентском AdminSelectOrgView: ему нужны useTransition и router.
 */
export async function AdminSelectOrg({ orgs, userName }: { orgs: SelectableOrg[]; userName: string }) {
  const locale = await getLocale()

  return (
    <I18nProvider locale={locale} messages={pickNamespaces(dictionaries[locale], ["common", "superadmin"])}>
      <AdminSelectOrgView orgs={orgs} userName={userName} />
    </I18nProvider>
  )
}
