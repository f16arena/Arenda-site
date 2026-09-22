import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { cn } from "@/lib/utils"
import { isZoneFloor } from "@/lib/zone-kinds"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale, getT } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

/**
 * Общий каркас карточки этажа: хлебные крошки и данные этажа.
 * Вкладки «Данные / План» убраны вместе со старым редактором: план этажа
 * теперь живёт в конструкторе здания (/admin/buildings/[id]/map).
 *
 * Здесь же провайдер словаря: внутри карточки клиентские формы (настройки
 * этажа, назначение арендатора, диалог помещения) — без него useT() вернёт ключ.
 */
export default async function FloorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const locale = await getLocale()
  const { t } = await getT(locale)
  const { orgId } = await requireOrgAccess()

  const { id } = await params
  try {
    await assertFloorInOrg(id, orgId)
  } catch {
    notFound()
  }

  const floor = await db.floor.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      kind: true,
      building: { select: { name: true } },
    },
  })
  if (!floor) notFound()

  const isZone = isZoneFloor(floor.kind)

  return (
    <I18nProvider
      locale={locale}
      messages={pickNamespaces(dictionaries[locale], ["common", "domain", "adminObjects"])}
    >
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/buildings" className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />{t("adminObjects.floorPage.backToBuildings")}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{floor.building.name}</span>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {floor.name}
          {isZone && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              floor.kind === "ROOF"
                ? "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300"
                : "bg-lime-100 dark:bg-lime-500/20 text-lime-700 dark:text-lime-300",
            )}>
              {floor.kind === "ROOF"
                ? t("adminObjects.floors.roofBadge")
                : t("adminObjects.floors.territoryBadge")}
            </span>
          )}
        </h1>
      </div>

      {children}
    </div>
    </I18nProvider>
  )
}
