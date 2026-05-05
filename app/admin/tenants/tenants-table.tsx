"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, FileText, UsersRound } from "lucide-react"
import { formatMoney, LEGAL_TYPE_LABELS } from "@/lib/utils"
import { tenantTaxIdValue } from "@/lib/tenant-identity"
import { DeleteTenantButton } from "./delete-tenant-button"
import { EmptyState } from "@/components/ui/empty-state"

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
  debt: number
}

type SortKey = "companyName" | "legalType" | "space" | "area" | "debt" | "phone"
type SortDir = "asc" | "desc"

export function TenantsTable({ tenants }: { tenants: TenantRow[] }) {
  const [search, setSearch] = useState("")
  const [legalFilter, setLegalFilter] = useState<string>("")
  const [debtFilter, setDebtFilter] = useState<string>("")
  const [sortKey, setSortKey] = useState<SortKey>("companyName")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const filtered = useMemo(() => {
    let list = tenants
    if (search) {
      const lower = search.toLowerCase()
      list = list.filter(
        (t) => {
          const taxId = tenantTaxIdValue({ legalType: t.legalType, bin: t.bin, iin: t.iin })
          return (
            t.companyName.toLowerCase().includes(lower) ||
            taxId.includes(search) ||
            t.user.name.toLowerCase().includes(lower) ||
            t.user.phone?.includes(search) ||
            t.user.email?.toLowerCase().includes(lower)
          )
        }
      )
    }
    if (legalFilter) list = list.filter((t) => t.legalType === legalFilter)
    if (debtFilter === "debt") list = list.filter((t) => t.debt > 0)
    if (debtFilter === "ok") list = list.filter((t) => t.debt === 0)

    // Сортировка
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "companyName":
          cmp = a.companyName.localeCompare(b.companyName, "ru")
          break
        case "legalType":
          cmp = a.legalType.localeCompare(b.legalType)
          break
        case "space": {
          const av = tenantSpaceLabel(a)
          const bv = tenantSpaceLabel(b)
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
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [tenants, search, legalFilter, debtFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  function exportCSV() {
    const rows = [
      ["Компания", "Тип", "БИН/ИИН", "Контактное лицо", "Телефон", "Email", "Помещение", "Этаж", "Площадь м²", "Задолженность"],
      ...filtered.map((t) => [
        t.companyName,
        LEGAL_TYPE_LABELS[t.legalType] ?? t.legalType,
        tenantTaxIdValue({ legalType: t.legalType, bin: t.bin, iin: t.iin }),
        t.user.name,
        t.user.phone ?? "",
        t.user.email ?? "",
        t.fullFloors.length > 0
          ? `Этаж целиком: ${t.fullFloors.map((f) => f.name).join(", ")}`
          : tenantSpaceLabel(t),
        t.fullFloors.length > 0
          ? t.fullFloors.map((f) => f.name).join(", ")
          : t.tenantSpaces[0]?.space.floor.name ?? t.space?.floor.name ?? "",
        String(tenantArea(t) || ""),
        String(t.debt),
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
    a.download = `арендаторы_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    // Простая печать в PDF через window.print с печатным CSS
    const w = window.open("", "_blank")
    if (!w) return
    const today = new Date().toLocaleDateString("ru-RU")
    const tableRows = filtered.map((t) => `
      <tr>
        <td>${t.companyName}</td>
        <td>${LEGAL_TYPE_LABELS[t.legalType] ?? t.legalType}</td>
        <td>${tenantTaxIdValue({ legalType: t.legalType, bin: t.bin, iin: t.iin })}</td>
        <td>${t.user.phone ?? t.user.email ?? ""}</td>
        <td>${
          t.fullFloors.length > 0
            ? `Этаж целиком: ${t.fullFloors.map((f) => f.name).join(", ")}`
            : tenantSpaceLabel(t) || "—"
        }</td>
        <td style="text-align:right">${tenantArea(t) ? tenantArea(t).toFixed(0) : "—"} м²</td>
        <td style="text-align:right">${t.debt > 0 ? formatMoney(t.debt) : "—"}</td>
      </tr>
    `).join("")
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Арендаторы — ${today}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #0f172a; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #64748b; font-size: 12px; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
        th { background: #f8fafc; font-weight: 600; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Арендаторы</h1>
      <p>На ${today} · ${filtered.length} записей</p>
      <table>
        <thead><tr>
          <th>Компания</th><th>Тип</th><th>БИН/ИИН</th><th>Контакт</th>
          <th>Помещение</th><th>Площадь</th><th>Долг</th>
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: компания, БИН, ФИО, телефон..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={legalFilter}
          onChange={(e) => setLegalFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        >
          <option value="">Все типы</option>
          <option value="IP">ИП</option>
          <option value="CHSI">ЧСИ</option>
          <option value="TOO">ТОО</option>
          <option value="AO">АО</option>
          <option value="GP">ГП/ГКП</option>
          <option value="PHYSICAL">Физ. лицо</option>
        </select>
        <select
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        >
          <option value="">Все статусы</option>
          <option value="debt">С долгом</option>
          <option value="ok">Без долга</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            title="Экспорт в CSV (открывается в Excel)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button
            onClick={exportPDF}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            title="Экспорт в PDF (через печать)"
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Показано {filtered.length} из {tenants.length}
      </p>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <SortHeader k="companyName" label="Компания" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="legalType" label="Тип" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="space" label="Помещение" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="area" label="Площадь" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="phone" label="Телефон" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="debt" label="Задолженность" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <Link href={`/admin/tenants/${t.id}`} className="block group">
                    <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600">{t.companyName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t.category ?? "Вид деятельности не указан"}</p>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-slate-600 dark:text-slate-400">
                    {LEGAL_TYPE_LABELS[t.legalType] ?? t.legalType}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                  {t.fullFloors.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300">
                        Этаж
                      </span>
                      <span className="font-medium text-violet-900 dark:text-violet-200">
                        {t.fullFloors.map((f) => f.name).join(", ")}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500">· целиком</span>
                    </span>
                  ) : t.space ? (
                    <SpaceCell tenant={t} />
                  ) : (
                    <SpaceCell tenant={t} />
                  )}
                </td>
                <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400">
                  {tenantArea(t) ? `${tenantArea(t).toFixed(0)} м²` : "—"}
                </td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                  {t.user.phone ?? t.user.email ?? "—"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {t.debt > 0 ? (
                    <span className="font-medium text-red-600 dark:text-red-400">{formatMoney(t.debt)}</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs">Нет долга</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Открыть
                    </Link>
                    <DeleteTenantButton tenantId={t.id} companyName={t.companyName} />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-6">
                  {tenants.length === 0 ? (
                    <EmptyState
                      icon={<UsersRound className="h-5 w-5" />}
                      title="Арендаторы еще не добавлены"
                      description="Начните с первого арендатора или загрузите список из Excel. Перед созданием проверьте, что свободные помещения уже заведены по нужному зданию."
                      actions={[
                        { href: "/admin/import/tenants", label: "Импорт Excel" },
                        { href: "/admin/spaces", label: "Проверить помещения", variant: "secondary" },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={<Search className="h-5 w-5" />}
                      title="По фильтрам ничего не найдено"
                      description="Измените поиск, тип арендатора или фильтр долга, чтобы снова увидеть список."
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

function tenantSpaceLabel(tenant: TenantRow) {
  if (tenant.fullFloors.length > 0) return tenant.fullFloors.map((floor) => floor.name).join(", ")
  const spaces = tenantSpaces(tenant)
  return spaces.map((space) => `Каб. ${space.number} · ${space.floor.name}`).join(", ")
}

function tenantArea(tenant: TenantRow) {
  if (tenant.fullFloors.length > 0) {
    return tenant.fullFloors.reduce((sum, floor) => sum + (floor.totalArea ?? 0), 0)
  }
  return tenantSpaces(tenant).reduce((sum, space) => sum + space.area, 0)
}

function SpaceCell({ tenant }: { tenant: TenantRow }) {
  if (tenant.fullFloors.length > 0) {
    return (
      <span>
        {tenant.fullFloors.slice(0, 2).map((floor, index) => (
          <span key={floor.id}>
            {index > 0 && <span className="text-slate-400 dark:text-slate-500">, </span>}
            {floor.name}
          </span>
        ))}
        {tenant.fullFloors.length > 2 && (
          <span className="ml-1 text-slate-400 dark:text-slate-500">+{tenant.fullFloors.length - 2}</span>
        )}
      </span>
    )
  }

  const spaces = tenantSpaces(tenant)
  if (spaces.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500">Не назначено</span>
  }

  return (
    <span>
      {spaces.slice(0, 2).map((space, index) => (
        <span key={space.id ?? `${space.number}-${index}`}>
          {index > 0 && <span className="text-slate-400 dark:text-slate-500">, </span>}
          Каб. {space.number}
          <span className="text-slate-400 dark:text-slate-500 ml-1">· {space.floor.name}</span>
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
