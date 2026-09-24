export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"
import { ImageIcon } from "lucide-react"
import { SiteImageUploader } from "./uploader"
import { getT } from "@/lib/i18n/server"

// Изображения публичного сайта (лендинг), редактируемые без передеплоя.
// Доступ — только платформенный владелец.
// key — код слота в базе (SiteImage.slot), не переводится; подписи в словаре.
const SLOTS = [
  { key: "landing-3d", labelKey: "superadmin.siteImages.slots.landing3dLabel", hintKey: "superadmin.siteImages.slots.landing3dHint" },
  { key: "landing-hero", labelKey: "superadmin.siteImages.slots.landingHeroLabel", hintKey: "superadmin.siteImages.slots.landingHeroHint" },
] as const

export default async function SiteImagesPage() {
  const session = await auth()
  if (!session?.user?.isPlatformOwner) redirect("/admin")
  const { t } = await getT()

  const rows = await safeServerValue(
    db.siteImage.findMany({ select: { slot: true, updatedAt: true } }),
    [],
    { source: "superadmin-site-images:list", route: "/superadmin/site-images", userId: session.user.id },
  )
  const versionBySlot = new Map(rows.map((r) => [r.slot, r.updatedAt.getTime()]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <ImageIcon className="h-6 w-6 text-slate-400" />
          {t("superadmin.siteImages.title")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {t("superadmin.siteImages.subtitle")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SLOTS.map((s) => (
          <SiteImageUploader
            key={s.key}
            slot={s.key}
            label={t(s.labelKey)}
            hint={t(s.hintKey)}
            version={versionBySlot.get(s.key) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
