import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Словарь для 3D-конструктора: сам редактор, панели и листы чертежей — всё
 * клиентское, без провайдера useT() вернёт ключ вместо текста. Раздел
 * adminBuilder тяжёлый, поэтому он и живёт отдельно: в остальную админку не
 * уезжает, а здесь нужен целиком.
 */
export default async function AdminBuilderLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminObjects", "adminBuilder"])}
    >
      {children}
    </I18nProvider>
  )
}
