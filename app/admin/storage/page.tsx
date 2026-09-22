export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import type { Prisma } from "@/app/generated/prisma/client"
import { auth } from "@/auth"
import { FileRowActions, UploadFileButton } from "./storage-actions"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { requireSection } from "@/lib/acl"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { getAccessibleBuildingIdsForSession, isOwnerLike } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { db } from "@/lib/db"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { safeServerValue } from "@/lib/server-fallback"
import { PageHeader, StatCard, Card } from "@/components/ui/page"
import { getT, getLocale } from "@/lib/i18n/server"
import { formatDateShortL, formatNumberL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"
import {
  Archive,
  FileArchive,
  FileText,
  HardDrive,
  Receipt,
  Search,
  Trash2,
  Users,
} from "lucide-react"

const PAGE_SIZE = 30

// Виды файлов: подписи берём из словаря (adminDocs.storage.categories),
// здесь — только значения и их порядок в фильтре.
const CATEGORY_KEYS = ["ALL", "TENANT_DOCUMENT", "PAYMENT_RECEIPT", "DOCUMENT_TEMPLATE", "GENERATED_DOCUMENT", "OTHER"] as const
type CategoryKey = (typeof CATEGORY_KEYS)[number]

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  TENANT_DOCUMENT: FileText,
  PAYMENT_RECEIPT: Receipt,
  DOCUMENT_TEMPLATE: FileArchive,
  GENERATED_DOCUMENT: Archive,
  OTHER: FileArchive,
}

export default async function StoragePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string | string[]
    category?: string | string[]
    tenantId?: string | string[]
    deleted?: string | string[]
    page?: string | string[]
  }>
}) {
  await requireSection("documents", "view")
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const locale = await getLocale()
  const { t } = await getT(locale)
  // Единицы размера — из словаря, число — по правилам языка.
  const sizeUnits = [
    t("adminDocs.storage.bytes.b"),
    t("adminDocs.storage.bytes.kb"),
    t("adminDocs.storage.bytes.mb"),
    t("adminDocs.storage.bytes.gb"),
  ]
  const size = (bytes: number) => formatBytes(locale, sizeUnits, bytes)
  // Вид файла из базы — строка: если в словаре такого вида нет, показываем как есть.
  const categoryLabel = (category: string) => {
    const key = `adminDocs.storage.categories.${category}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? category : label
  }
  const { orgId } = await requireOrgAccess()
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canDeleteFiles = caps.has("storage.delete")
  const canUpload = caps.has("storage.upload")
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/storage", orgId, userId: session.user.id })
  const resolved = await searchParams
  const search = one(resolved?.q).trim()
  const selectedCategory = normalizeCategory(one(resolved?.category))
  const selectedTenantId = one(resolved?.tenantId)
  const showDeleted = one(resolved?.deleted) === "1"
  const page = normalizePage(resolved?.page)

  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)

  const ownerLike = isOwnerLike(session.user.role, session.user.isPlatformOwner)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const restrictByBuildings = !!currentBuildingId || !ownerLike

  const tenantBuildingWhere: Prisma.TenantWhereInput = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      { buildingId: { in: visibleBuildingIds } },
    ],
  }

  const scopeWhere: Prisma.StoredFileWhereInput | null = restrictByBuildings
    ? visibleBuildingIds.length > 0
      ? {
          OR: [
            { buildingId: { in: visibleBuildingIds } },
            { tenant: tenantBuildingWhere },
          ],
        }
      : { id: "__no_access__" }
    : null

  const baseWhere: Prisma.StoredFileWhereInput = {
    AND: [
      { organizationId: orgId },
      showDeleted ? { deletedAt: { not: null } } : { deletedAt: null },
      ...(scopeWhere ? [scopeWhere] : []),
    ],
  }

  const fileWhere: Prisma.StoredFileWhereInput = {
    AND: [
      baseWhere,
      selectedCategory !== "ALL" ? { category: selectedCategory } : {},
      selectedTenantId && selectedTenantId !== "all" ? { tenantId: selectedTenantId } : {},
      search
        ? {
            OR: [
              { fileName: { contains: search, mode: "insensitive" } },
              { tenant: { companyName: { contains: search, mode: "insensitive" } } },
              { uploadedBy: { name: { contains: search, mode: "insensitive" } } },
              { uploadedBy: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  }

  const tenantOptionsWhere: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    ...(restrictByBuildings ? tenantBuildingWhere : {}),
  }

  const [files, total, stats, categoryStats, tenantOptions, buildingOptions] = await Promise.all([
    safe(
      "admin.storage.files",
      db.storedFile.findMany({
        where: fileWhere,
        orderBy: { createdAt: "desc" },
        skip: pageSkip(page, PAGE_SIZE),
        take: PAGE_SIZE,
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          extension: true,
          originalSize: true,
          compressedSize: true,
          compression: true,
          ownerType: true,
          category: true,
          visibility: true,
          createdAt: true,
          deletedAt: true,
          building: { select: { id: true, name: true } },
          tenant: { select: { id: true, companyName: true } },
          uploadedBy: { select: { name: true, email: true } },
          tenantDocument: { select: { id: true, name: true, type: true } },
          _count: { select: { paymentReports: true } },
        },
      }),
      [],
    ),
    safe("admin.storage.total", db.storedFile.count({ where: fileWhere }), 0),
    safe(
      "admin.storage.stats",
      db.storedFile.aggregate({
        where: baseWhere,
        _count: { _all: true },
        _sum: { originalSize: true, compressedSize: true },
      }),
      { _count: { _all: 0 }, _sum: { originalSize: 0, compressedSize: 0 } },
    ),
    safe(
      "admin.storage.categoryStats",
      db.storedFile.groupBy({
        by: ["category"],
        where: baseWhere,
        _count: { _all: true },
        _sum: { originalSize: true },
      }),
      [],
    ),
    safe(
      "admin.storage.tenantOptions",
      db.tenant.findMany({
        where: tenantOptionsWhere,
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
        take: 100,
      }),
      [],
    ),
    safe(
      "admin.storage.buildingOptions",
      db.building.findMany({
        where: { id: { in: visibleBuildingIds }, organizationId: orgId, isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      [],
    ),
  ])

  const queryParams = {
    q: search,
    category: selectedCategory,
    tenantId: selectedTenantId,
    deleted: showDeleted ? "1" : null,
  }

  const deletedCount = await safe(
    "admin.storage.deletedCount",
    db.storedFile.count({ where: { AND: [{ organizationId: orgId }, { deletedAt: { not: null } }, ...(scopeWhere ? [scopeWhere] : [])] } }),
    0,
  )
  const unlinkedCount = await safe(
    "admin.storage.unlinked",
    db.storedFile.count({ where: { AND: [baseWhere, { tenantId: null }, { buildingId: null }] } }),
    0,
  )

  return (
    <div className="space-y-5">
      <PageHeader
        icon={HardDrive}
        tone="slate"
        title={t("adminDocs.storage.title")}
        subtitle={t("adminDocs.storage.subtitle")}
        actions={canUpload ? <UploadFileButton tenants={tenantOptions.map((tenant) => ({ id: tenant.id, name: tenant.companyName }))} buildings={buildingOptions} /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label={t("adminDocs.storage.stats.files")} value={formatNumberL(locale, stats._count._all)} tone="blue" />
        <StatCard
          icon={HardDrive}
          label={t("adminDocs.storage.stats.space")}
          value={size(stats._sum.compressedSize ?? 0)}
          sub={t("adminDocs.storage.stats.spaceSub", { size: size(stats._sum.originalSize ?? 0) })}
          tone="slate"
        />
        <StatCard
          icon={Users}
          label={t("adminDocs.storage.stats.unlinked")}
          value={formatNumberL(locale, unlinkedCount)}
          sub={unlinkedCount > 0 ? t("adminDocs.storage.stats.unlinkedSub") : t("adminDocs.storage.stats.unlinkedOk")}
          tone={unlinkedCount > 0 ? "amber" : "emerald"}
        />
        <StatCard
          icon={Trash2}
          label={t("adminDocs.storage.stats.trash")}
          value={formatNumberL(locale, deletedCount)}
          sub={deletedCount > 0 ? t("adminDocs.storage.stats.trashSub") : t("adminDocs.storage.stats.trashEmpty")}
          tone="slate"
          href={deletedCount > 0 ? hrefFor({ ...queryParams, deleted: showDeleted ? null : "1", page: null }) : undefined}
        />
      </div>

      {/* Поиск и фильтр по арендатору */}
      <form action="/admin/storage" className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={search}
            placeholder={t("adminDocs.storage.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <select
          name="tenantId"
          defaultValue={selectedTenantId || "all"}
          className="h-10 w-56 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="all">{t("adminDocs.storage.allTenants")}</option>
          {tenantOptions.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
          ))}
        </select>
        <input type="hidden" name="category" value={selectedCategory} />
        {showDeleted && <input type="hidden" name="deleted" value="1" />}
        <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500">
          {t("adminDocs.storage.find")}
        </button>
      </form>

      {/* Вид файлов */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_KEYS.map((category) => {
          const count = category === "ALL"
            ? stats._count._all
            : categoryStats.find((item) => item.category === category)?._count._all ?? 0
          const active = selectedCategory === category
          return (
            <Link
              key={category}
              href={hrefFor({ ...queryParams, category, page: null })}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400/50 dark:bg-blue-500/10 dark:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
              }`}
            >
              {t(`adminDocs.storage.categories.${category}`)}
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{count}</span>
            </Link>
          )
        })}
        <Link
          href={hrefFor({ ...queryParams, deleted: showDeleted ? null : "1", page: null })}
          className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            showDeleted
              ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400/50 dark:bg-red-500/10 dark:text-red-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {showDeleted
            ? t("adminDocs.storage.showWorking")
            : deletedCount > 0
              ? t("adminDocs.storage.trashWithCount", { count: deletedCount })
              : t("adminDocs.storage.trash")}
        </Link>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">{t("adminDocs.storage.columns.file")}</th>
                <th className="px-5 py-3">{t("adminDocs.storage.columns.owner")}</th>
                <th className="px-5 py-3">{t("adminDocs.storage.columns.uploadedBy")}</th>
                <th className="px-5 py-3 text-right">{t("adminDocs.storage.columns.size")}</th>
                <th className="px-5 py-3 text-right">{t("adminDocs.storage.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.map((file) => {
                const Icon = CATEGORY_ICONS[file.category] ?? FileArchive
                const linked = !!file.tenantDocument || file._count.paymentReports > 0
                return (
                  <tr key={file.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <div className="flex min-w-[260px] items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[360px] truncate font-medium text-slate-900 dark:text-slate-100">{file.fileName}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {categoryLabel(file.category)}
                            {file.visibility === "TENANT_VISIBLE" ? t("adminDocs.storage.tenantVisible") : ""}
                            {linked ? t("adminDocs.storage.linked") : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {file.tenant ? (
                        <Link href={`/admin/tenants/${file.tenant.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {file.tenant.companyName}
                        </Link>
                      ) : file.building ? (
                        <span className="text-slate-600 dark:text-slate-300">{file.building.name}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">{t("adminDocs.storage.notLinked")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{file.uploadedBy?.name ?? file.uploadedBy?.email ?? t("adminDocs.storage.system")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {showDeleted && file.deletedAt
                          ? t("adminDocs.storage.deletedAt", { date: formatDateShortL(locale, file.deletedAt) })
                          : formatDateShortL(locale, file.createdAt)}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{size(file.originalSize)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <FileRowActions fileId={file.id} deleted={showDeleted} canDelete={canDeleteFiles} linked={linked} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    {showDeleted ? t("adminDocs.storage.trashEmpty") : t("adminDocs.storage.noFiles")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          basePath="/admin/storage"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          params={queryParams}
        />
      </Card>
    </div>
  )
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function normalizeCategory(value: string): CategoryKey {
  const category = value.toUpperCase() as CategoryKey
  return CATEGORY_KEYS.includes(category) ? category : "ALL"
}

function hrefFor(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value || value === "ALL" || value === "all") continue
    query.set(key, String(value))
  }
  const qs = query.toString()
  return qs ? `/admin/storage?${qs}` : "/admin/storage"
}

/** Размер файла: число по правилам языка, единица — подпись из словаря. */
function formatBytes(locale: Locale, units: string[], bytes: number) {
  if (!bytes) return `0 ${units[0]}`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${formatNumberL(locale, value, value >= 10 ? 0 : 1)} ${units[unit]}`
}
