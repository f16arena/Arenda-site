export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import type { Prisma } from "@/app/generated/prisma/client"
import { auth } from "@/auth"
import { deleteStoredFile } from "@/app/actions/storage"
import { DeleteAction } from "@/components/ui/delete-action"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { requireSection } from "@/lib/acl"
import { getAccessibleBuildingIdsForSession, isOwnerLike } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { db } from "@/lib/db"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import {
  Archive,
  Building2,
  Download,
  Eye,
  FileArchive,
  FileText,
  Filter,
  HardDrive,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react"

const PAGE_SIZE = 30

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "Все",
  TENANT_DOCUMENT: "Документы арендаторов",
  PAYMENT_RECEIPT: "Чеки оплат",
  DOCUMENT_TEMPLATE: "Шаблоны",
  GENERATED_DOCUMENT: "Сгенерированные",
  OTHER: "Прочее",
}

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

  const { orgId } = await requireOrgAccess()
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
    db.storedFile.count({ where: fileWhere }),
    db.storedFile.aggregate({
      where: baseWhere,
      _count: { _all: true },
      _sum: { originalSize: true, compressedSize: true },
    }),
    db.storedFile.groupBy({
      by: ["category"],
      where: baseWhere,
      _count: { _all: true },
      _sum: { originalSize: true },
    }).catch(() => []),
    db.tenant.findMany({
      where: tenantOptionsWhere,
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 100,
    }),
    db.building.findMany({
      where: { id: { in: visibleBuildingIds }, organizationId: orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const queryParams = {
    q: search,
    category: selectedCategory,
    tenantId: selectedTenantId,
    deleted: showDeleted ? "1" : null,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Хранилище</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Файлы этой организации: документы арендаторов, чеки оплат и будущие архивы. Доступ разделён по SaaS-организации и зданиям.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Изоляция включена
          </div>
          <p className="mt-1 text-xs">
            Владелец видит только свою организацию, сотрудники - только доступные здания.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={HardDrive} label="Файлов" value={String(stats._count._all)} />
        <MetricCard icon={Archive} label="Исходный размер" value={formatBytes(stats._sum.originalSize ?? 0)} />
        <MetricCard icon={FileArchive} label="В БД после сжатия" value={formatBytes(stats._sum.compressedSize ?? 0)} />
        <MetricCard icon={Building2} label="Зданий в доступе" value={String(buildingOptions.length)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {["ALL", "TENANT_DOCUMENT", "PAYMENT_RECEIPT", "DOCUMENT_TEMPLATE", "GENERATED_DOCUMENT", "OTHER"].map((category) => {
          const count = category === "ALL"
            ? stats._count._all
            : categoryStats.find((item) => item.category === category)?._count._all ?? 0
          const active = selectedCategory === category
          return (
            <Link
              key={category}
              href={hrefFor({ ...queryParams, category, page: null })}
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition",
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400/50 dark:bg-blue-500/10 dark:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50",
              ].join(" ")}
            >
              {CATEGORY_LABELS[category]}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {count}
              </span>
            </Link>
          )
        })}
        <Link
          href={hrefFor({ ...queryParams, deleted: showDeleted ? null : "1", page: null })}
          className={[
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition",
            showDeleted
              ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400/50 dark:bg-red-500/10 dark:text-red-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50",
          ].join(" ")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Корзина
        </Link>
      </div>

      <form action="/admin/storage" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_260px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={search}
              placeholder="Поиск по имени файла, арендатору или загрузившему"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
            />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              name="category"
              defaultValue={selectedCategory}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="relative block">
            <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              name="tenantId"
              defaultValue={selectedTenantId || "all"}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
            >
              <option value="all">Все арендаторы</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
              ))}
            </select>
          </label>
          {showDeleted && <input type="hidden" name="deleted" value="1" />}
          <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500">
            Показать
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Файл</th>
                <th className="px-5 py-3">Тип</th>
                <th className="px-5 py-3">Арендатор</th>
                <th className="px-5 py-3">Здание</th>
                <th className="px-5 py-3">Размер</th>
                <th className="px-5 py-3">Загружен</th>
                <th className="px-5 py-3 text-right">Действия</th>
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
                          <p className="max-w-[360px] truncate font-medium text-slate-900 dark:text-slate-100">
                            {file.fileName}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {file.mimeType}
                            {file.compression === "GZIP" && " · сжато"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        {CATEGORY_LABELS[file.category] ?? file.category}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {file.visibility === "TENANT_VISIBLE" ? "видит арендатор" : "только админ"}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      {file.tenant ? (
                        <Link href={`/admin/tenants/${file.tenant.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {file.tenant.companyName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {file.building?.name ?? <span className="text-slate-400">не определено</span>}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{formatBytes(file.originalSize)}</p>
                      <p className="text-xs text-slate-400">{formatBytes(file.compressedSize)} в БД</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{file.createdAt.toLocaleDateString("ru-RU")}</p>
                      <p className="text-xs text-slate-400">{file.uploadedBy?.name ?? file.uploadedBy?.email ?? "система"}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {!showDeleted && (
                          <>
                            <a
                              href={`/api/storage/${file.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                              title="Открыть"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <a
                              href={`/api/storage/${file.id}?download=1`}
                              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                              title="Скачать"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            {linked ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                связан
                              </span>
                            ) : (
                              <DeleteAction
                                action={deleteStoredFile.bind(null, file.id)}
                                entity="файл"
                                description="Файл будет перенесён в корзину. Если он связан с документом или оплатой, система заблокирует удаление."
                                successMessage="Файл перенесён в корзину"
                              />
                            )}
                          </>
                        )}
                        {showDeleted && (
                          <span className="text-xs text-slate-400">
                            удалён {file.deletedAt?.toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {files.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    Файлов по выбранным условиям нет.
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
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof HardDrive
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function normalizeCategory(value: string) {
  const category = value.toUpperCase()
  return CATEGORY_LABELS[category] ? category : "ALL"
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

function formatBytes(bytes: number) {
  if (!bytes) return "0 Б"
  const units = ["Б", "КБ", "МБ", "ГБ"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)} ${units[unit]}`
}
