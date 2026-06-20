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

  // Schema.org (JSON-LD): помогает поисковикам понять, что это за продукт, и даёт
  // шанс на расширенный сниппет. Стартовую цену берём из БД (минимальный платный
  // помесячный тариф), если доступна.
  const monthlyPeriod = pricing?.periods.find((p) => p.monthsCount === 1) ?? pricing?.periods[0]
  const monthlyPrices =
    pricing && monthlyPeriod
      ? pricing.plans
          .filter((p) => p.code !== "FREE")
          .map((p) => pricing.matrix[p.code]?.[monthlyPeriod.code]?.normal?.basePriceMonthly ?? 0)
          .filter((n) => n > 0)
      : []
  const startingPrice = monthlyPrices.length ? Math.min(...monthlyPrices) : null
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://commrent.kz/#organization",
        name: "Commrent",
        url: "https://commrent.kz",
        logo: "https://commrent.kz/commrent-logo-hero.png",
        description:
          "SaaS-платформа для управления коммерческой арендой в Казахстане: договоры, ЭЦП, счета, ЭСФ в КГД и оплата в одном окне.",
        areaServed: { "@type": "Country", name: "Kazakhstan" },
      },
      {
        "@type": "SoftwareApplication",
        name: "Commrent",
        url: "https://commrent.kz",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "ru",
        description:
          "Операционная система для коммерческой аренды: договор → подпись ЭЦП → счёт/АВР → ЭСФ в КГД → оплата.",
        publisher: { "@id": "https://commrent.kz/#organization" },
        ...(startingPrice
          ? {
              offers: {
                "@type": "Offer",
                price: Math.round(startingPrice),
                priceCurrency: "KZT",
              },
            }
          : {}),
      },
    ],
  }

  return (
    <>
      {/* Структурированные данные для поисковиков (Google/Яндекс) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
