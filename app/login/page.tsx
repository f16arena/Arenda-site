import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { parseHost, ROOT_HOST } from "@/lib/host"
import { LoginForm } from "./login-form"

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center p-4">
      <LoginForm />
    </div>
  )
}
