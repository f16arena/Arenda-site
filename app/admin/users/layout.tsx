import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Пользователи и доступ» (диалоги
 * создания и правки, личные права, сброс пароля). Без провайдера useT() в них
 * вернёт ключ вместо текста.
 */
export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "adminSettings"])}
    >
      {children}
    </I18nProvider>
  )
}
