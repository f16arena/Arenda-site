import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для клиентских частей раздела «Помещения» (диалоги помещения, фото,
 * объявление на Krisha, очистка здания). Без провайдера useT() в них вернёт
 * ключ вместо текста. В браузер уходят только нужные разделы.
 */
export default async function AdminSpacesLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminObjects"])}
    >
      {children}
    </I18nProvider>
  )
}
