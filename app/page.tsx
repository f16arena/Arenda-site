import type { Metadata } from "next"
import { headers } from "next/headers"
import { LandingV2 } from "@/components/landing/v2/landing"
import { getPricingData } from "@/components/landing/pricing-data"
import { getFoundersRemainingSlots } from "@/lib/pricing"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { parseHost, ROOT_HOST } from "@/lib/host"

// Для залогиненного пользователя считаем адрес его рабочей зоны, чтобы кнопки
// «Войти»/«Демо»/«Начать» вели прямо туда, а не на /login (без петель).
async function resolveDashboardUrl(): Promise<string | null> {
  const session = await auth().catch(() => null)
  if (!session?.user) return null
  if (session.user.isPlatformOwner) return "/superadmin"
  if (!session.user.organizationId) return "/admin"
  const org = await db.organization
    .findUnique({ where: { id: session.user.organizationId }, select: { slug: true } })
    .catch(() => null)
  const target = session.user.role === "TENANT" ? "/cabinet" : "/admin"
  if (!org?.slug) return target
  const h = await headers()
  const host = parseHost(h.get("host"))
  if (host.kind === "subdomain" && host.slug === org.slug) return target
  const proto = h.get("x-forwarded-proto") ?? "https"
  return `${proto}://${org.slug}.${ROOT_HOST}${target}`
}

export const metadata: Metadata = {
  title: "Commrent.kz — операционная система для коммерческой аренды",
  description:
    "Управление коммерческой недвижимостью в Казахстане: договор → подпись ЭЦП (в т.ч. с телефона через eGov) → счёт/АВР → ЭСФ в КГД → оплата. Всё в одном окне.",
}

export default async function Home() {
  const [pricing, founding, editor, dashboardUrl] = await Promise.all([
    getPricingData().catch(() => null),
    getFoundersRemainingSlots().catch(() => null),
    db.siteImage.findUnique({ where: { slot: "landing-3d" }, select: { updatedAt: true } }).catch(() => null),
    resolveDashboardUrl(),
  ])
  const editorImageUrl = editor ? `/api/site-image/landing-3d?v=${editor.updatedAt.getTime()}` : null
  return (
    <>
      {/* Шрифт Onest (как в дизайне) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/google-font-preconnect */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <LandingV2 pricing={pricing} founding={founding} editorImageUrl={editorImageUrl} dashboardUrl={dashboardUrl} />
    </>
  )
}
