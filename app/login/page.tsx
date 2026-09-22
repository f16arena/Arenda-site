import { ForceLight } from "@/components/force-light"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { parseHost, ROOT_HOST } from "@/lib/host"
import { LoginForm } from "./login-form"
import { I18nProvider } from "@/lib/i18n/client"
import { LocaleSwitcher } from "@/components/i18n/locale-switcher"
import { getLocale } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

export const dynamic = "force-dynamic"

// Server-component обёртка вокруг формы логина.
// Если пользователь уже залогинен — редиректит на правильный поддомен/раздел:
//   - platform owner → /superadmin (на root)
//   - tenant → https://<slug>.commrent.kz/cabinet
//   - staff (owner/admin/...) → https://<slug>.commrent.kz/admin
//
// Если уже на нужном поддомене — обычный относительный редирект.
export default async function LoginPage() {
  const session = await auth()
  const locale = await getLocale()

  if (session?.user) {
    // Платформенный админ — на /superadmin (всегда на root домене)
    if (session.user.isPlatformOwner) {
      redirect("/superadmin")
    }

    // Узнаём slug организации пользователя
    if (session.user.organizationId) {
      const org = await db.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { slug: true },
      }).catch(() => null)

      if (org?.slug) {
        const target = session.user.role === "TENANT" ? "/cabinet" : "/admin"
        const h = await headers()
        const host = parseHost(h.get("host"))

        // Если уже на нужном поддомене — относительный редирект
        if (host.kind === "subdomain" && host.slug === org.slug) {
          redirect(target)
        }

        // Иначе — абсолютный редирект на slug-поддомен
        // (cookie domain=.commrent.kz сохранит сессию)
        const proto = h.get("x-forwarded-proto") ?? "https"
        redirect(`${proto}://${org.slug}.${ROOT_HOST}${target}`)
      }
    }
  }

  return (
    <div className="relative min-h-screen bg-[#f6f8fb] flex items-center justify-center p-4">
      <ForceLight />
      <I18nProvider locale={locale} messages={pickNamespaces(dictionaries[locale], ["common", "auth"])}>
        {/* Переключатель языка нужен и до входа: человек должен увидеть
            привычный язык раньше, чем введёт пароль. */}
        <div className="absolute right-4 top-4">
          <LocaleSwitcher />
        </div>
        <LoginForm />
      </I18nProvider>
    </div>
  )
}
