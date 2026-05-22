"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { ElementType } from "react"
import {
  Check,
  ClipboardCheck,
  Download,
  FileCheck,
  FileText,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react"
import type { DocumentTenantOption } from "@/lib/document-tenants"

type DocTypeKey = "contract" | "invoice" | "act" | "reconciliation"
type ExtraField = "period" | "range" | null

type DocTypeConfig = {
  key: DocTypeKey
  label: string
  hint: string
  icon: ElementType
  color: string
  /** download — мгновенно скачать DOCX; page — открыть detail-страницу */
  action: "download" | "page"
  field: ExtraField
}

const TYPES: DocTypeConfig[] = [
  {
    key: "contract",
    label: "Договор",
    hint: "Открывается для предпросмотра и подписи ЭЦП",
    icon: FileCheck,
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    action: "page",
    field: null,
  },
  {
    key: "invoice",
    label: "Счёт на оплату",
    hint: "Скачивается DOCX за выбранный период",
    icon: Receipt,
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    action: "download",
    field: "period",
  },
  {
    key: "act",
    label: "АВР",
    hint: "Скачивается DOCX за выбранный период",
    icon: ClipboardCheck,
    color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
    action: "download",
    field: "period",
  },
  {
    key: "reconciliation",
    label: "Акт сверки",
    hint: "Открывается для предпросмотра и печати",
    icon: FileText,
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    action: "page",
    field: "range",
  },
]

const currentPeriod = () => new Date().toISOString().slice(0, 7)
const defaultFrom = () => `${new Date().getFullYear()}-01`
const defaultTo = () => `${new Date().getFullYear()}-12`

export function CreateDocumentModal({
  tenants,
  defaultOpen = false,
}: {
  tenants: DocumentTenantOption[]
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  // Открытие по ?create=1, в т.ч. при навигации с уже смонтированной страницы.
  // Корректируем state во время рендера при смене пропса (паттерн React вместо эффекта).
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen)
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen)
    if (defaultOpen) setOpen(true)
  }
  const [type, setType] = useState<DocTypeKey>("contract")
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [period, setPeriod] = useState(currentPeriod)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [pending, setPending] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const config = TYPES.find((t) => t.key === type)!
  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(
      (t) =>
        t.companyName.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        (t.spaceNumber ?? "").toLowerCase().includes(q)
    )
  }, [tenants, query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const id = window.setTimeout(() => searchRef.current?.focus(), 50)
    return () => {
      document.removeEventListener("keydown", onKey)
      window.clearTimeout(id)
    }
  }, [open])

  function reset() {
    setType("contract")
    setTenantId(null)
    setQuery("")
    setPeriod(currentPeriod())
    setFrom(defaultFrom())
    setTo(defaultTo())
    setPending(false)
  }

  function close() {
    setOpen(false)
  }

  function submit() {
    if (!tenantId) return
    const tid = encodeURIComponent(tenantId)

    if (config.action === "download") {
      const url =
        type === "invoice"
          ? `/api/invoices/generate?tenantId=${tid}&period=${period}`
          : `/api/acts/generate?tenantId=${tid}&period=${period}`
      setPending(true)
      // attachment-ответ скачивается без ухода со страницы
      window.location.href = url
      window.setTimeout(() => {
        close()
        reset()
      }, 800)
      return
    }

    const url =
      type === "reconciliation"
        ? `/admin/documents/new/reconciliation?tenantId=${tid}&from=${from}&to=${to}`
        : `/admin/documents/new/contract?tenantId=${tid}`
    close()
    router.push(url)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus className="h-4 w-4" />
        Создать документ
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Создать документ</h3>
              <button
                onClick={close}
                aria-label="Закрыть"
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {/* Тип документа */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => {
                  const Icon = t.icon
                  const active = t.key === type
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors ${
                        active
                          ? "border-blue-500 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-500/10"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{t.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">{config.hint}</p>

              {/* Арендатор */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Арендатор
                </label>
                {tenants.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    В этом здании нет арендаторов.
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск по названию, имени, кабинету…"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                      />
                    </div>
                    <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">Ничего не найдено</p>
                      ) : (
                        filtered.map((t) => {
                          const active = t.id === tenantId
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTenantId(t.id)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                active
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <span className="truncate">
                                {t.companyName}
                                <span className="text-slate-400 dark:text-slate-500">
                                  {" · "}
                                  {t.userName}
                                  {t.spaceNumber ? ` · Каб. ${t.spaceNumber}` : ""}
                                </span>
                              </span>
                              {active && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Доп. поле по типу */}
              {config.field === "period" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Период
                  </label>
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>
              )}
              {config.field === "range" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Период (с — по)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="month"
                      value={from}
                      max={to}
                      onChange={(e) => setFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                    />
                    <span className="text-sm text-slate-400">—</span>
                    <input
                      type="month"
                      value={to}
                      min={from}
                      onChange={(e) => setTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                {selectedTenant ? `Выбрано: ${selectedTenant.companyName}` : "Выберите арендатора"}
              </span>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={close}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50"
                >
                  Отмена
                </button>
                <button
                  onClick={submit}
                  disabled={!tenantId || pending}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {config.action === "download" ? (
                    <>
                      <Download className="h-4 w-4" />
                      {pending ? "Формирую…" : "Скачать DOCX"}
                    </>
                  ) : (
                    "Открыть →"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
