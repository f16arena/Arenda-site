export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ImageIcon } from "lucide-react"
import { SiteImageUploader } from "./uploader"

// Изображения публичного сайта (лендинг), редактируемые без передеплоя.
// Доступ — только платформенный владелец.
const SLOTS = [
  { key: "landing-3d", label: "Скриншот 3D-редактора (главная)", hint: "Блок «3D-редактор здания» на лендинге" },
  { key: "landing-hero", label: "Скриншот в hero (главная)", hint: "Зарезервировано: визуал в шапке (если включим)" },
]

export default async function SiteImagesPage() {
  const session = await auth()
  if (!session?.user?.isPlatformOwner) redirect("/admin")

  const rows = await db.siteImage.findMany({ select: { slot: true, updatedAt: true } }).catch(() => [])
  const versionBySlot = new Map(rows.map((r) => [r.slot, r.updatedAt.getTime()]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <ImageIcon className="h-6 w-6 text-slate-400" />
          Изображения сайта
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Скриншоты для публичной главной. Меняются здесь — без передеплоя.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SLOTS.map((s) => (
          <SiteImageUploader
            key={s.key}
            slot={s.key}
            label={s.label}
            hint={s.hint}
            version={versionBySlot.get(s.key) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
