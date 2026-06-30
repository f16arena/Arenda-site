"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import {
  Download, FileText, Archive, Loader2, ChevronDown, ChevronRight,
  List, Folder, Trash2, Lock, ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteAdminDocument,
  bulkDeleteAdminDocuments,
} from "@/app/actions/documents"
import { formatMoney } from "@/lib/utils"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LandlordSignButton } from "@/components/documents/landlord-sign-button"
import { EsfControl } from "./esf-send-button"

const LANDLORD_SIGNABLE_TYPES = new Set(["ACT", "RECONCILIATION", "INVOICE"])

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "Акт оказанных услуг",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const TYPE_COLORS: Record<string, string> = {
  CONTRACT: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  INVOICE: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ACT: "bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  RECONCILIATION: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  HANDOVER: "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200",
}

export type DocCategory = "active" | "signing" | "draft" | "archive"

export interface DocRow {
  id: string
  type: string
  number: string | null
  tenantName: string
  tenantId: string | null
  period: string | null
  totalAmount: number | null
  generatedAt: Date | string
  source: "contract" | "generated"
  downloadHref: string | null
  /** Ссылка «Открыть» (страница документа), если скачивания нет (договоры). */
  viewHref?: string | null
  /** Категория для под-вкладок: активные / на подпись / черновик / архив. */
  category: DocCategory
  /** Для bulk: GeneratedDocument id (без префикса) */
  generatedId?: string
  deleteId?: string
  canDelete?: boolean
  isSigned?: boolean
  /** Статус оплаты для счёта (по начислениям периода): оплачен / долг / нет начислений. */
  paymentStatus?: "paid" | "debt" | "none" | null
  /** Интеграция ИС ЭСФ (для АВР): статус, рег. номер, последняя ошибка */
  esfStatus?: string | null
  esfRegNumber?: string | null
  esfError?: string | null
  /** false — у арендатора отключено выставление ЭСФ (кнопка «В ЭСФ» скрыта). */
  esfEnabled?: boolean
  /** Сверка: статус подтверждения контрагентом (SENT|AGREED|DISPUTED) + комментарий. */
  reconStatus?: string | null
  reconResponseNote?: string | null
}

const RECON_BADGE: Record<string, { label: string; cls: string }> = {
  SENT: { label: "ожидает сверки", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  AGREED: { label: "сверка подтверждена", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  DISPUTED: { label: "расхождение", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
}

function ReconBadge({ row }: { row: DocRow }) {
  if (row.type !== "RECONCILIATION" || !row.reconStatus) return null
  const b = RECON_BADGE[row.reconStatus]
  if (!b) return null
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}
      title={row.reconStatus === "DISPUTED" && row.reconResponseNote ? row.reconResponseNote : undefined}
    >
      {b.label}
    </span>
  )
}

export const DOC_CATEGORY_TABS: { key: DocCategory; label: string }[] = [
  { key: "active", label: "Активные" },
  { key: "signing", label: "Отправлены на подпись" },
  { key: "draft", label: "Черновики" },
  { key: "archive", label: "Архив" },
]

export function DocumentsTable({
  rows,
  emptyHint,
  canSign = false,
  canExportZip = false,
  canEsf = false,
}: {
  rows: DocRow[]
  emptyHint: string
  /** Право на подпись ЭЦП (NCALayer) — кнопка «Подписать». */
  canSign?: boolean
  canEsf?: boolean
  /** Право скачивать ZIP-архив документов — кнопка «Скачать ZIP». */
  canExportZip?: boolean
}) {
  // Локальный state — позволяет оптимистично убирать удалённые строки сразу,
  // без ожидания router.refresh(). Если сервер вернул ошибку — возвращаем строку
  // обратно. Синхронизация с свежими props через паттерн «adjusting state during
  // render» (React 18+ docs/learn/you-might-not-need-an-effect): React сам
  // дорендерит без cascading-эффектов. Раньше использовался useEffect →
  // ESLint правило react-hooks/set-state-in-effect ругалось.
  const [prevRows, setPrevRows] = useState(rows)
  const [localRows, setLocalRows] = useState<DocRow[]>(rows)
  if (prevRows !== rows) {
    setPrevRows(rows)
    setLocalRows(rows)
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [groupBy, setGroupBy] = useState<"none" | "tenant">("none")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [cat, setCat] = useState<DocCategory>("active")

  // Счётчики по категориям (для подписей под-вкладок).
  const catCounts = useMemo(() => {
    const c: Record<DocCategory, number> = { active: 0, signing: 0, draft: 0, archive: 0 }
    for (const r of localRows) c[r.category] = (c[r.category] ?? 0) + 1
    return c
  }, [localRows])

  // Строки активной под-вкладки.
  const catRows = useMemo(() => localRows.filter((r) => r.category === cat), [localRows, cat])

  // Группируем по tenantName (или "Без контрагента")
  const grouped = useMemo(() => {
    if (groupBy !== "tenant") return null
    const map = new Map<string, { tenantId: string | null; rows: DocRow[] }>()
    for (const r of catRows) {
      const key = r.tenantName || "Без контрагента"
      if (!map.has(key)) map.set(key, { tenantId: r.tenantId, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [groupBy, catRows])

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setCollapsedGroups(next)
  }

  // Только сгенерированные доки (с скачиваемым файлом) можно выделять — в текущей вкладке
  const selectableRows = catRows.filter((r) => r.generatedId)
  // Для bulk delete нужны строки с deleteId и canDelete — это уже сужает выборку.
  const deletableSelected = localRows.filter(
    (r) => r.generatedId && selected.has(r.generatedId) && r.deleteId && r.canDelete,
  )

  function toggle(genId: string) {
    const next = new Set(selected)
    if (next.has(genId)) next.delete(genId)
    else next.add(genId)
    setSelected(next)
  }

  function toggleAll() {
    if (selected.size === selectableRows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableRows.map((r) => r.generatedId!)))
    }
  }

  function downloadArchive() {
    if (selected.size === 0) return
    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/bulk-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected) }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || "Не удалось собрать архив")
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `documents_${new Date().toISOString().slice(0, 10)}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success(`Скачан архив из ${selected.size} документов`)
        setSelected(new Set())
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  function performDelete(row: DocRow) {
    if (!row.deleteId || !row.canDelete) return
    const deleteId = row.deleteId
    const source = row.source
    setDeletingRowId(row.id)

    // Оптимистично убираем строку из localRows. Если придёт ошибка —
    // вернём snapshot обратно.
    const snapshot = localRows
    setLocalRows((prev) => prev.filter((r) => r.id !== row.id))
    if (row.generatedId) {
      const next = new Set(selected)
      next.delete(row.generatedId)
      setSelected(next)
    }

    startTransition(async () => {
      const result = await deleteAdminDocument({ source, id: deleteId })
      setDeletingRowId(null)
      if (!result.ok) {
        // Откатываем оптимистичное удаление.
        setLocalRows(snapshot)
        toast.error(result.error ?? "Не удалось удалить документ")
        return
      }
      // router.refresh() не вызываем — RSC сам подхватит изменения
      // через revalidatePath в server action. При следующем переходе
      // на страницу будет свежее. Локально мы уже синхронны.
      // Жёсткое удаление — отмены нет (восстановить нечего).
      toast.success(
        result.removedCharges
          ? `Документ удалён · также убрано начислений (долгов): ${result.removedCharges}`
          : "Документ удалён навсегда",
      )
    })
  }

  function performBulkDelete() {
    if (deletableSelected.length === 0) return
    const inputs = deletableSelected
      .map((r) => ({ source: r.source, id: r.deleteId! }))
    const deletedIds = new Set(deletableSelected.map((r) => r.id))
    const snapshot = localRows
    setBulkDeleting(true)

    // Оптимистично убираем все.
    setLocalRows((prev) => prev.filter((r) => !deletedIds.has(r.id)))
    setSelected(new Set())

    startTransition(async () => {
      const result = await bulkDeleteAdminDocuments(inputs)
      setBulkDeleting(false)
      if (result.succeeded > 0 && result.failed === 0) {
        toast.success(`Удалено ${result.succeeded} ${result.succeeded === 1 ? "документ" : "документов"}`)
        return
      }
      if (result.succeeded > 0 && result.failed > 0) {
        // Частичный успех — возвращаем неудачные обратно в список.
        const failedIds = new Set(result.results.filter((r) => !r.ok).map((r) => r.id))
        const failedRows = snapshot.filter((r) => r.deleteId && failedIds.has(r.deleteId))
        setLocalRows((prev) => [...failedRows, ...prev])
        toast.warning(
          `Удалено ${result.succeeded}, не удалось — ${result.failed}. Проверьте права доступа.`,
        )
        return
      }
      // Полный провал — откатываем всё.
      setLocalRows(snapshot)
      toast.error("Не удалось удалить документы. Возможно, не хватает прав.")
    })
  }

  function renderAmount(r: DocRow) {
    if (r.totalAmount == null && (!r.paymentStatus || r.paymentStatus === "none")) return <>—</>
    const badge = r.paymentStatus && r.paymentStatus !== "none" ? (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
        {r.paymentStatus === "paid" ? "оплачен" : "долг"}
      </span>
    ) : null
    return (
      <div className="flex items-center justify-end gap-2">
        {badge}
        {r.totalAmount != null ? (
          <span>
            {formatMoney(r.totalAmount)}
            {r.type === "CONTRACT" && <span className="ml-0.5 text-xs font-normal text-slate-400 dark:text-slate-500">/мес</span>}
          </span>
        ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
      </div>
    )
  }

  function renderActions(row: DocRow) {
    const isDeleting = deletingRowId === row.id && pending
    return (
      <div className="flex items-center justify-end gap-2">
        {canSign && row.source === "generated" && row.generatedId && LANDLORD_SIGNABLE_TYPES.has(row.type) && (
          <LandlordSignButton documentId={row.generatedId} />
        )}
        {/* ИС ЭСФ (КГД): выписываем счёт-фактуру (ЭСФ) ТОЛЬКО со счёта.
            Электронный АВР не отправляем — по словам бухгалтера он блокирует
            выписку ЭСФ до подписания контрагентом (а его обычно не подписывают);
            АВР остаётся печатным документом. */}
        {canEsf && row.source === "generated" && row.generatedId && row.type === "INVOICE" && row.esfEnabled !== false && (
          <EsfControl
            documentId={row.generatedId}
            status={row.esfStatus ?? null}
            regNumber={row.esfRegNumber ?? null}
            error={row.esfError ?? null}
            kind="invoice"
          />
        )}
        {row.isSigned && row.deleteId && (
          <Link
            href={`/verify/${row.deleteId}`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
            title="Кто подписал — страница проверки ЭЦП"
          >
            <ShieldCheck className="h-3 w-3" /> Подписи
          </Link>
        )}
        {row.downloadHref ? (
          <a
            href={row.downloadHref}
            download
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <Download className="h-3 w-3" />
            Скачать
          </a>
        ) : (
          <Link
            href={row.viewHref ?? (row.tenantId ? `/admin/tenants/${row.tenantId}` : "/admin/documents")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <FileText className="h-3 w-3" />
            Открыть
          </Link>
        )}
        {row.deleteId && row.canDelete ? (
          <ConfirmDialog
            variant="danger"
            requireText="удалить"
            title={`Удалить ${TYPE_LABELS[row.type] ?? "документ"}${row.number ? ` № ${row.number}` : ""} навсегда?`}
            description={
              (row.isSigned
                ? "Документ уже подписан. Удаление подписанного документа доступно только владельцу. "
                : "") +
              "Документ и его подписи будут удалены из базы НАВСЕГДА — восстановить нельзя. Если нужен с изменениями, создайте заново."
            }
            confirmLabel="Удалить навсегда"
            onConfirm={() => performDelete(row)}
            trigger={
              <button
                type="button"
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25"
                title={row.isSigned ? "Удалить подписанный документ может только владелец" : "Удалить ошибочно созданный документ"}
              >
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Удалить
              </button>
            }
          />
        ) : row.deleteId && row.isSigned ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            title="Подписанный документ может удалить только владелец"
          >
            <Lock className="h-3 w-3" />
            Подписан
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Под-вкладки по статусу */}
      <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {DOC_CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setCat(t.key); setSelected(new Set()) }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              cat === t.key
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${cat === t.key ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>{catCounts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Вид:</span>
        <button
          onClick={() => setGroupBy("none")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            groupBy === "none"
              ? "bg-slate-900 dark:bg-slate-700 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          Список
        </button>
        <button
          onClick={() => setGroupBy("tenant")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            groupBy === "tenant"
              ? "bg-slate-900 dark:bg-slate-700 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          По контрагенту
        </button>
      </div>

      {/* Bulk action bar. В тёмной теме оборачиваем в slate-800 + border,
          иначе bg-slate-900 сливается с тёмным фоном страницы. */}
      {selected.size > 0 && (
        <div className="bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
          <p className="text-sm font-medium">
            Выбрано: {selected.size} {selected.size === 1 ? "документ" : "документов"}
            {deletableSelected.length < selected.size && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">
                (можно удалить: {deletableSelected.length})
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-300 hover:text-white"
              disabled={pending || bulkDeleting}
            >
              Снять выделение
            </button>
            {canExportZip && (
              <button
                onClick={downloadArchive}
                disabled={pending || bulkDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                {pending && !bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Скачать ZIP
              </button>
            )}
            {deletableSelected.length > 0 && (
              <ConfirmDialog
                variant="danger"
                requireText="удалить"
                title={`Удалить ${deletableSelected.length} ${deletableSelected.length === 1 ? "документ" : "документов"} навсегда?`}
                description={
                  `Выбранные документы и их подписи будут удалены из базы НАВСЕГДА. Подписанные могут удалить только владельцы.${
                    deletableSelected.length < selected.size
                      ? ` Документы без права на удаление (${selected.size - deletableSelected.length}) останутся.`
                      : ""
                  } Восстановить нельзя.`
                }
                confirmLabel="Удалить навсегда"
                onConfirm={performBulkDelete}
                trigger={
                  <button
                    type="button"
                    disabled={pending || bulkDeleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  >
                    {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Удалить выбранные
                  </button>
                }
              />
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="w-10 px-3 py-3 text-center">
                {selectableRows.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === selectableRows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < selectableRows.length
                    }}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                )}
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Номер</th>
              {groupBy !== "tenant" && (
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Контрагент</th>
              )}
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Сумма</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Создан</th>
              <th className="px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {/* Grouped view: рендерим заголовок группы + строки */}
            {grouped !== null && grouped.map(([groupName, group]) => {
              const isCollapsed = collapsedGroups.has(groupName)
              const groupTotal = group.rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
              return (
                <>
                  <tr key={`g-${groupName}`} className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-800">
                    <td colSpan={8} className="px-3 py-2">
                      <button
                        onClick={() => toggleGroup(groupName)}
                        className="w-full flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <Folder className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        {group.tenantId ? (
                          <Link
                            href={`/admin/tenants/${group.tenantId}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {groupName}
                          </Link>
                        ) : (
                          <span>{groupName}</span>
                        )}
                        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-500 dark:text-slate-400">
                          <span>{group.rows.length} док.</span>
                          {groupTotal > 0 && <span>{formatMoney(groupTotal)}</span>}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed && group.rows.map((r) => {
                    const isSelected = r.generatedId ? selected.has(r.generatedId) : false
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-500/15"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <td className="px-3 py-3 text-center">
                          {r.generatedId ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(r.generatedId!)}
                              className="cursor-pointer"
                            />
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                            {TYPE_LABELS[r.type] ?? r.type}
                          </span>
                          <ReconBadge row={r} />
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.number ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.period ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                          {renderAmount(r)}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                          <span suppressHydrationWarning>{new Date(r.generatedAt).toLocaleDateString("ru-RU")}</span>
                        </td>
                        <td className="px-5 py-3 text-right">{renderActions(r)}</td>
                      </tr>
                    )
                  })}
                </>
              )
            })}
            {/* Plain list view */}
            {grouped === null && catRows.map((r) => {
              const isSelected = r.generatedId ? selected.has(r.generatedId) : false
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-500/15"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <td className="px-3 py-3 text-center">
                    {r.generatedId ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(r.generatedId!)}
                        className="cursor-pointer"
                      />
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    <ReconBadge row={r} />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.number ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    {r.tenantId ? (
                      <Link href={`/admin/tenants/${r.tenantId}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                        {r.tenantName}
                      </Link>
                    ) : (
                      r.tenantName
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.period ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                    {renderAmount(r)}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                    <span suppressHydrationWarning>{new Date(r.generatedAt).toLocaleDateString("ru-RU")}</span>
                  </td>
                  <td className="px-5 py-3 text-right">{renderActions(r)}</td>
                </tr>
              )
            })}
            {catRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <FileText className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    {localRows.length === 0 ? emptyHint : "В этой категории документов нет"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
