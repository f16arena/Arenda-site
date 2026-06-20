import type { Metadata } from "next"
import { LandingV2 } from "@/components/landing/v2/landing"
import { getPricingData } from "@/components/landing/pricing-data"
import { getFoundersRemainingSlots } from "@/lib/pricing"
import { db } from "@/lib/db"

export const metadata: Metadata = {
  title: "Commrent.kz — операционная система для коммерческой аренды",
  description:
    "Управление коммерческой недвижимостью в Казахстане: договор → подпись ЭЦП (в т.ч. с телефона через eGov) → счёт/АВР → ЭСФ в КГД → оплата. Всё в одном окне.",
}

export default async function Home() {
  const [pricing, founding, editor] = await Promise.all([
    getPricingData().catch(() => null),
    getFoundersRemainingSlots().catch(() => null),
    db.siteImage.findUnique({ where: { slot: "landing-3d" }, select: { updatedAt: true } }).catch(() => null),
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
      <LandingV2 pricing={pricing} founding={founding} editorImageUrl={editorImageUrl} />
    </>
  )
}
