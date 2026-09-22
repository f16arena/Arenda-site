"use client"

import { useMemo, useCallback, useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, FileText, UsersRound, Antenna } from "lucide-react"
import { tenantTaxIdValue } from "@/lib/tenant-identity"
import { DeleteTenantButton } from "./delete-tenant-button"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TONE_CHIP, TONE_BADGE, type Tone } from "@/lib/ui-tones"
import { cn } from "@/lib/utils"
import { shortCompanyName } from "@/lib/company-name"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"

export interface TenantRow {
  id: string
  companyName: string
  legalType: string
  bin: string | null
  iin: string | null
  category: string | null
  user: { name: string; phone: string | null; email: string | null }
  space: { id: string; number: string; area: number; floor: { name: string; ratePerSqm: number } } | null
  tenantSpaces: Array<{
    isPrimary: boolean
    space: { id: string; number: string; area: number; floor: { name: string; ratePerSqm: number } }
  }>
  // Этажи где арендатор сдан целиком — может быть несколько
  fullFloors: Array<{ id: string; name: string; totalArea: number | null; fixedMonthlyRent: number | null }>
  // Размещение без помещения (крышные: вышки/камеры)
  placementNote: string | null
  debt: number
  /** Аренда в месяц по условиям арендатора */
  rent: number
  /** Окончание договора (ISO) */
  contractEnd: string | null
  hasSignedContract: boolean
  contractStatus: string | null
}

/** Переводчик из useT() — таблица тащит его в свои вспомогательные функции. */
type Translate = ReturnType<typeof useT>["t"]

type SortKey = "companyName" | "legalType" | "space" | "area" | "debt" | "phone" | "rent" | "contractEnd"
type SortDir = "asc" | "desc"

const SORT_KEYS: SortKey[] = ["companyName", "legalType", "space", "area", "debt", "phone", "rent", "contractEnd"]
function parseSortKey(value: string | null): SortKey {
  return value && (SORT_KEYS as string[]).includes(value) ? (value as SortKey) : "companyName"
}

/** Название правовой формы: ключи adminTenants.legalTypes, иначе — код как есть. */
function legalTypeLabel(t: Translate, legalType: string): string {
  const key = `adminTenants.legalTypes.${legalType}` as Parameters<Translate>[0]
  const label = t(key)
  return label === key ? legalType : label
}

export function TenantsTable({ tenants, canDelete = false }: { tenants: TenantRow[]; canDelete?: boolean }) {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { t, tp } = useT()
  const locale = useLocale()

  const search = sp.get("q") ?? ""
  const legalFilter = sp.get("legal") ?? ""
  const debtFilter = sp.get("debt") ?? ""
  const contractFilter = sp.get("contract") ?? ""
  const sortKey = parseSortKey(sp.get("sort"))
  const sortDir: SortDir = sp.get("dir") === "desc" ? "desc" : "asc"

  // Локальный буфер ввода поиска: чтобы инпут отвечал мгновенно, а в URL писали с debounce.
  // URL — источник истины; локальный стейт догоняет, не вызывая setState внутри useEffect-синхро.
  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef<number | null>(null)

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString())
      if (value === null || value === "") next.delete(key)
      else next.set(key, value)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [sp, router, pathname],
  )

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      updateParam("q", value || null)
    }, 250)
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [])

  // Если URL изменился извне (например, навигация назад) — отображаем актуальное значение.
  // Используем простой ключ на input через value, синхронизированный к URL когда буфер пуст.
  const displayedSearch = searchInput === "" && search !== "" ? search : searchInput

  const filtered = useMemo(() => {
    let list = tenants
    if (search) {
      const lower = search.toLowerCase()
      list = list.filter(
        (row) => {
          const taxId = tenantTaxIdValue({ legalType: row.legalType, bin: row.bin, iin: row.iin })
          return (
            row.companyName.toLowerCase().includes(lower) ||
            taxId.includes(search) ||
            row.user.name.toLowerCase().includes(lower) ||
            row.user.phone?.includes(search) ||
            row.user.email?.toLowerCase().includes(lower)
          )
        }
      )
    }
    if (legalFilter) list = list.filter((row) => row.legalType === legalFilter)
    if (debtFilter === "debt") list = list.filter((row) => row.debt > 0)
    if (debtFilter === "ok") list = list.filter((row) => row.debt === 0)
    if (contractFilter === "none") list = list.filter((row) => !row.hasSignedContract)
    if (contractFilter === "expiring") list = list.filter((row) => contractState(row.contractEnd) === "soon")

    // Сортировка
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "companyName":
          cmp = a.companyName.localeCompare(b.companyName, locale)
          break
        case "legalType":
          cmp = a.legalType.localeCompare(b.legalType)
          break
        case "space": {
          const av = tenantSpaceLabel(t, a)
          const bv = tenantSpaceLabel(t, b)
          cmp = av.localeCompare(bv, undefined, { numeric: true })
          break
        }
        case "area":
          cmp = tenantArea(a) - tenantArea(b)
          break
        case "debt":
          cmp = a.debt - b.debt
          break
        case "phone":
          cmp = (a.user.phone ?? "").localeCompare(b.user.phone ?? "")
          break
        case "rent":
          cmp = a.rent - b.rent
          break
        case "contractEnd":
          cmp = (a.contractEnd ?? "9999").localeCompare(b.contractEnd ?? "9999")
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [tenants, search, legalFilter, debtFilter, contractFilter, sortKey, sortDir, locale, t])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const nextDir = sortDir === "asc" ? "desc" : "asc"
      const params = new URLSearchParams(sp.toString())
      params.set("sort", key)
      params.set("dir", nextDir)
      router.replace(`${pathname}?${params.toString()}`)
    } else {
      const params = new URLSearchParams(sp.toString())
      params.set("sort", key)
      params.delete("dir") // дефолт asc
      router.replace(`${pathname}?${params.toString()}`)
    }
  }

  function exportCSV() {
    const rows = [
      [
        t("adminTenants.table.export.company"),
        t("adminTenants.table.export.type"),
        t("adminTenants.table.export.taxId"),
        t("adminTenants.table.export.contactPerson"),
        t("adminTenants.table.export.phone"),
        t("adminTenants.table.export.email"),
        t("adminTenants.table.export.space"),
        t("adminTenants.table.export.floor"),
        t("adminTenants.table.export.areaM2"),
        t("adminTenants.table.export.debt"),
      ],
      ...filtered.map((row) => [
        row.companyName,
        legalTypeLabel(t, row.legalType),
        tenantTaxIdValue({ legalType: row.legalType, bin: row.bin, iin: row.iin }),
        row.user.name,
        row.user.phone ?? "",
        row.user.email ?? "",
        row.fullFloors.length > 0
          ? t("adminTenants.table.export.fullFloor", { floors: row.fullFloors.map((f) => f.name).join(", ") })
          : tenantSpaceLabel(t, row),
        row.fullFloors.length > 0
          ? row.fullFloors.map((f) => f.name).join(", ")
          : row.tenantSpaces[0]?.space.floor.name ?? row.space?.floor.name ?? "",
        String(tenantArea(row) || ""),
        String(row.debt),
      ]),
    ]
    const csv = "﻿" + rows.map((r) =>
      r.map((c) => {
        const s = String(c)
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(";")
    ).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${t("adminTenants.table.export.fileName")}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    // Простая печать в PDF через window.print с печатным CSS
    const w = window.open("", "_blank")
    if (!w) return
    const today = formatDateShortL(locale, new Date())
    const tableRows = filtered.map((row) => `
      <tr>
        <td>${row.companyName}</td>
        <td>${legalTypeLabel(t, row.legalType)}</td>
        <td>${tenantTaxIdValue({ legalType: row.legalType, bin: row.bin, iin: row.iin })}</td>
        <td>${row.user.phone ?? row.user.email ?? ""}</td>
        <td>${
          row.fullFloors.length > 0
            ? t("adminTenants.table.export.fullFloor", { floors: row.fullFloors.map((f) => f.name).join(", ") })
            : tenantSpaceLabel(t, row) || "—"
        }</td>
        <td style="text-align:right">${tenantArea(row) ? tenantArea(row).toFixed(0) : "—"} м²</td>
        <td style="text-align:right">${row.debt > 0 ? formatMoneyL(locale, row.debt) : "—"}</td>
      </tr>
    `).join("")
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${t("adminTenants.list.title")} — ${today}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #0f172a; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #64748b; font-size: 12px; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
        th { background: #f8fafc; font-weight: 600; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${t("adminTenants.list.title")}</h1>
      <p>${t("adminTenants.table.export.asOf", { date: today })} · ${tp("adminTenants.table.export.rows", filtered.length)}</p>
      <table>
        <thead><tr>
          <th>${t("adminTenants.table.export.company")}</th>
          <th>${t("adminTenants.table.export.type")}</th>
          <th>${t("adminTenants.table.export.taxId")}</th>
          <th>${t("adminTenants.table.export.contact")}</th>
          <th>${t("adminTenants.table.export.space")}</th>
          <th>${t("adminTenants.table.export.area")}</th>
          <th>${t("adminTenants.table.export.debtShort")}</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <script>setTimeout(() => window.print(), 100);</script>
      </body></html>
    `)
    w.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Filters + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            type="text"
            value={displayedSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("adminTenants.table.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <select
          value={legalFilter}
          onChange={(e) => updateParam("legal", e.target.value || null)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        >
          <option value="">{t("adminTenants.table.allTypes")}</option>
          <option value="IP">{t("adminTenants.legalTypes.IP")}</option>
          <option value="CHSI">{t("adminTenants.legalTypes.CHSI")}</option>
          <option value="TOO">{t("adminTenants.legalTypes.TOO")}</option>
          <option value="AO">{t("adminTenants.legalTypes.AO")}</option>
          <option value="GP">{t("adminTenants.legalTypes.GP")}</option>
          <option value="PHYSICAL">{t("adminTenants.legalTypes.PHYSICAL")}</option>
        </select>
        <select
          value={debtFilter}
          onChange={(e) => updateParam("debt", e.target.value || null)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        >
          <option value="">{t("adminTenants.table.allDebtStates")}</option>
          <option value="debt">{t("adminTenants.table.withDebt")}</option>
          <option value="ok">{t("adminTenants.table.withoutDebt")}</option>
        </select>
        <select
          value={contractFilter}
          onChange={(e) => updateParam("contract", e.target.value || null)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        >
          <option value="">{t("adminTenants.table.allContracts")}</option>
          <option value="expiring">{t("adminTenants.table.expiring60")}</option>
          <option value="none">{t("adminTenants.table.withoutSigned")}</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportCSV}
            title={t("adminTenants.table.exportExcelHint")}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            onClick={exportPDF}
            title={t("adminTenants.table.exportPdfHint")}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("adminTenants.table.shown", { shown: filtered.length, total: tenants.length })}
      </p>

      {/* Мобильные карточки (узкие экраны) — таблица режется, поэтому карточный вид */}
      <div className="space-y-2.5 sm:hidden">
        {filtered.map((row) => (
          <Card key={row.id} className="block p-3.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/tenants/${row.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar name={shortCompanyName(row.companyName)} legalType={row.legalType} size="sm" />
                <span className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">{shortCompanyName(row.companyName)}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{row.category ?? t("adminTenants.table.noCategory")}</p>
                </span>
              </Link>
              <span className="shrink-0">
                <LegalBadge legalType={row.legalType} />
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center"><SpaceCell tenant={row} /></span>
              {tenantArea(row) > 0 && <span>{tenantArea(row).toFixed(0)} м²</span>}
              {row.rent > 0 && (
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {formatMoneyL(locale, row.rent)}{t("common.money.perMonth")}
                </span>
              )}
              <ContractCell tenant={row} />
              {(row.user.phone || row.user.email) && <span className="font-mono">{row.user.phone ?? row.user.email}</span>}
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <DebtPill debt={row.debt} />
              {canDelete && <DeleteTenantButton tenantId={row.id} companyName={row.companyName} />}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="block p-6">
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={tenants.length === 0 ? t("adminTenants.table.empty.noneTitle") : t("adminTenants.table.empty.filterTitle")}
              description={tenants.length === 0 ? t("adminTenants.table.empty.noneShort") : t("adminTenants.table.empty.filterShort")}
            />
          </Card>
        )}
      </div>

      {/* Table (sm и шире) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:block">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/95 supports-[backdrop-filter]:dark:bg-slate-800/70">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <SortHeader k="companyName" label={t("adminTenants.table.columns.tenant")} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="space" label={t("adminTenants.table.columns.space")} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="area" label={t("adminTenants.table.columns.area")} align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="rent" label={t("adminTenants.table.columns.rent")} align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="contractEnd" label={t("adminTenants.table.columns.contractEnd")} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="phone" label={t("adminTenants.table.columns.phone")} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="debt" label={t("adminTenants.table.columns.debt")} align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <Link href={`/admin/tenants/${row.id}`} className="group flex items-center gap-3" title={row.category ? `${row.companyName}\n${row.category}` : row.companyName}>
                    <Avatar name={shortCompanyName(row.companyName)} legalType={row.legalType} />
                    {/* max-w — иначе длинный вид деятельности по ОКЭД растягивает всю таблицу */}
                    <span className="min-w-0 max-w-[340px]">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600">{shortCompanyName(row.companyName)}</p>
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {legalTypeLabel(t, row.legalType)}{row.category ? ` · ${row.category}` : ""}
                      </p>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600 dark:text-slate-400">
                  <SpaceCell tenant={row} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                  {tenantArea(row) ? `${tenantArea(row).toFixed(0)} м²` : "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {row.rent > 0 ? formatMoneyL(locale, row.rent) : <span className="font-normal text-slate-400">—</span>}
                </td>
                <td className="whitespace-nowrap px-5 py-3.5">
                  <ContractCell tenant={row} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                  {row.user.phone ?? row.user.email ?? "—"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <DebtPill debt={row.debt} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/tenants/${row.id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {t("common.actions.open")}
                    </Link>
                    {canDelete && <DeleteTenantButton tenantId={row.id} companyName={row.companyName} />}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-6">
                  {tenants.length === 0 ? (
                    <EmptyState
                      icon={<UsersRound className="h-5 w-5" />}
                      title={t("adminTenants.table.empty.noneTitle")}
                      description={t("adminTenants.table.empty.noneLong")}
                      actions={[
                        { href: "/admin/import/tenants", label: t("adminTenants.table.empty.importExcel") },
                        { href: "/admin/spaces", label: t("adminTenants.table.empty.checkSpaces"), variant: "secondary" },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={<Search className="h-5 w-5" />}
                      title={t("adminTenants.table.empty.filterTitle")}
                      description={t("adminTenants.table.empty.filterLong")}
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function tenantSpaces(tenant: TenantRow) {
  if (tenant.tenantSpaces.length > 0) return tenant.tenantSpaces.map((item) => item.space)
  return tenant.space ? [tenant.space] : []
}

function tenantSpaceLabel(t: Translate, tenant: TenantRow) {
  if (tenant.fullFloors.length > 0) return tenant.fullFloors.map((floor) => floor.name).join(", ")
  const spaces = tenantSpaces(tenant)
  return spaces.map((space) => `${spaceLabel(t, space.number)} · ${floorLabel(t, space.floor.name)}`).join(", ")
}

function tenantArea(tenant: TenantRow) {
  if (tenant.fullFloors.length > 0) {
    return tenant.fullFloors.reduce((sum, floor) => sum + (floor.totalArea ?? 0), 0)
  }
  return tenantSpaces(tenant).reduce((sum, space) => sum + space.area, 0)
}

/** Цвет аватара/бейджа по правовой форме арендатора. */
const LEGAL_TONE: Record<string, Tone> = {
  IP: "blue",
  CHSI: "emerald",
  TOO: "violet",
  AO: "teal",
  GP: "amber",
  PHYSICAL: "slate",
}
function legalTone(legalType: string): Tone {
  return LEGAL_TONE[legalType] ?? "slate"
}

/** Инициалы из названия компании/ФИО — до двух букв. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Кружок-аватар с инициалами, цвет — по правовой форме. */
function Avatar({ name, legalType, size = "md" }: { name: string; legalType: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs"
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", dim, TONE_CHIP[legalTone(legalType)])}>
      {initials(name)}
    </span>
  )
}

function LegalBadge({ legalType }: { legalType: string }) {
  const { t } = useT()
  return (
    <Badge className={TONE_BADGE[legalTone(legalType)]}>
      {legalTypeLabel(t, legalType)}
    </Badge>
  )
}

function DebtPill({ debt }: { debt: number }) {
  const { t } = useT()
  const locale = useLocale()
  if (debt > 0) {
    return (
      <Badge className={cn("font-semibold", TONE_BADGE.red)}>
        {formatMoneyL(locale, debt)}
      </Badge>
    )
  }
  return (
    <Badge className={TONE_BADGE.emerald}>
      {t("adminTenants.table.noDebtBadge")}
    </Badge>
  )
}

function SpaceCell({ tenant }: { tenant: TenantRow }) {
  const { t } = useT()
  if (tenant.fullFloors.length > 0) {
    return (
      <span>
        <span className="font-medium text-violet-700 dark:text-violet-300">
          {tenant.fullFloors.slice(0, 2).map((floor) => floorLabel(t, floor.name)).join(", ")}
        </span>
        {tenant.fullFloors.length > 2 && <span className="ml-1 text-slate-400 dark:text-slate-500">+{tenant.fullFloors.length - 2}</span>}
        <span className="text-slate-400 dark:text-slate-500"> · {t("adminTenants.table.wholeFloor")}</span>
      </span>
    )
  }

  const spaces = tenantSpaces(tenant)
  if (spaces.length === 0) {
    // Крышные арендаторы без помещения — показываем размещение.
    if (tenant.placementNote) {
      return (
        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
          <Antenna className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          {tenant.placementNote}
        </span>
      )
    }
    return <span className="text-slate-400 dark:text-slate-500">{t("adminTenants.table.notAssigned")}</span>
  }

  return (
    <span>
      {spaces.slice(0, 2).map((space, index) => (
        <span key={space.id ?? `${space.number}-${index}`}>
          {index > 0 && <span className="text-slate-400 dark:text-slate-500">, </span>}
          {spaceLabel(t, space.number)}
          <span className="text-slate-400 dark:text-slate-500 ml-1">· {floorLabel(t, space.floor.name)}</span>
        </span>
      ))}
      {spaces.length > 2 && (
        <span className="ml-1 text-slate-400 dark:text-slate-500">+{spaces.length - 2}</span>
      )}
    </span>
  )
}

function SortHeader({
  k, label, align, sortKey, sortDir, onClick,
}: {
  k: SortKey
  label: string
  align?: "right"
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th className={`px-5 py-3 text-${align ?? "left"}`}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 text-xs font-medium ${
          active ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
        } hover:text-slate-700 dark:hover:text-slate-200`}
      >
        {label}
        {active ? (
          sortDir === "asc"
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

// «Каб.» — только у кабинетов с номером («Каб. 101»). Места вроде «Киоск»,
// «Кар-Тел» (антенна) называются как есть.
function spaceLabel(t: Translate, number: string): string {
  return /^\d/.test(number.trim()) ? t("adminTenants.table.spaceLabel", { number }) : number
}

// Этаж с названием-цифрой («3») — «3 этаж» / «3-қабат»
function floorLabel(t: Translate, name: string): string {
  return /^-?\d+$/.test(name.trim()) ? t("adminTenants.table.floorLabel", { name: name.trim() }) : name
}


// Срок договора: истёк / кончается в 60 дней / действует
function contractState(end: string | null): "none" | "expired" | "soon" | "ok" {
  if (!end) return "none"
  const days = (new Date(end).getTime() - Date.now()) / 86_400_000
  if (days < 0) return "expired"
  if (days <= 60) return "soon"
  return "ok"
}

function ContractCell({ tenant }: { tenant: TenantRow }) {
  const { t } = useT()
  const locale: Locale = useLocale()
  if (!tenant.hasSignedContract) {
    const waiting = tenant.contractStatus === "SENT"
      ? t("adminTenants.table.contract.waitingTenant")
      : tenant.contractStatus === "SIGNED_BY_TENANT"
        ? t("adminTenants.table.contract.waitingYou")
        : tenant.contractStatus === "DRAFT"
          ? t("adminTenants.table.contract.draft")
          : t("adminTenants.table.contract.none")
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{waiting}</span>
  }
  const state = contractState(tenant.contractEnd)
  if (state === "none") return <span className="text-xs text-slate-400 dark:text-slate-500">{t("adminTenants.table.contract.noTerm")}</span>
  const d = formatDateShortL(locale, tenant.contractEnd!)
  if (state === "expired") return <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("adminTenants.table.contract.expired", { date: d })}</span>
  if (state === "soon") return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{d}</span>
  return <span className="text-xs text-slate-600 dark:text-slate-300">{d}</span>
}
