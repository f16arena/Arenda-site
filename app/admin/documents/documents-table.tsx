"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { deleteContractDraft } from "@/app/actions/contract-builder"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import {
  Download, FileText, Archive, Loader2, ChevronDown, ChevronRight,
  List, Folder, Trash2, ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteAdminDocument,
  bulkDeleteAdminDocuments,
} from "@/app/actions/documents"
import { useT, useLocale } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LandlordSignButton } from "@/components/documents/landlord-sign-button"
import { EsfControl } from "./esf-send-button"
import { ContractCardButton } from "./contract-card-modal"
import { useRouter } from "next/navigation"
import { signWithNCALayer, signManyWithNCALayer, fetchAsBase64, type KeyStoragePref } from "@/lib/ncalayer"
import { signIssuedDocumentByLandlordEcp } from "@/app/actions/landlord-signatures"
import { NcaKeyTypeSelect } from "@/components/nca-key-type-select"

const LANDLORD_SIGNABLE_TYPES = new Set(["ACT", "RECONCILIATION", "INVOICE"])

type T = ReturnType<typeof useT>["t"]

/** Название вида документа — общее из domain.docTypes. */
function docTypeLabel(t: T, type: string): string {
  const key = `domain.docTypes.${type}` as Parameters<T>[0]
  const label = t(key)
  return label === key ? type : label
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
  /** Подпись вида вместо общего «Договор» (например, «Допсоглашение») */
  typeLabel?: string
  /** Подпись кнопки открытия (у черновика — «Продолжить») */
  viewLabel?: string
  /** Категория для под-вкладок: активные / на подпись / черновик / архив. */
  category: DocCategory
  /** Для bulk: GeneratedDocument id (без префикса) */
  generatedId?: string
  deleteId?: string
  canDelete?: boolean
  /** Черновик конструктора (ContractDraft.id) — удаляется из меню «⋯» */
  draftId?: string
  isSigned?: boolean
  /** Сколько подписей ЭЦП у документа (для статуса в списке; у двусторонних 2 = обе стороны). */
  signatureCount?: number
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

const RECON_BADGE: Record<string, { key: "reconSent" | "reconAgreed" | "reconDisputed"; cls: string }> = {
  SENT: { key: "reconSent", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  AGREED: { key: "reconAgreed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  DISPUTED: { key: "reconDisputed", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
}

// Двусторонние документы (нужны подписи обеих сторон). Счёт — односторонний (только поставщик).
const TWO_SIDED_DOC_TYPES = new Set(["ACT", "RECONCILIATION", "CONTRACT", "HANDOVER"])

/** Бейдж статуса подписи в списке: подписан / подписан обеими сторонами. */
function SignBadge({ row }: { row: DocRow }) {
  const { t } = useT()
  const n = row.signatureCount ?? 0
  if (n === 0) return null
  const twoSided = TWO_SIDED_DOC_TYPES.has(row.type)
  if (twoSided && n < 2) {
    return (
      <Badge className="ml-1.5 px-1.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" title={t("adminDocs.table.badges.waitingSecondTitle")}>
        {t("adminDocs.table.badges.waitingSecond")}
      </Badge>
    )
  }
  return (
    <Badge className="ml-1.5 px-1.5 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" title={t("adminDocs.table.badges.signedTitle")}>
      {t("adminDocs.table.badges.signed")}
    </Badge>
  )
}

function ReconBadge({ row }: { row: DocRow }) {
  const { t } = useT()
  if (row.type !== "RECONCILIATION" || !row.reconStatus) return null
  const b = RECON_BADGE[row.reconStatus]
  if (!b) return null
  return (
    <Badge
      className={`ml-1.5 px-1.5 text-[10px] ${b.cls}`}
      title={row.reconStatus === "DISPUTED" && row.reconResponseNote ? row.reconResponseNote : undefined}
    >
      {t(`adminDocs.table.badges.${b.key}`)}
    </Badge>
  )
}

const DOC_CATEGORY_TABS: DocCategory[] = ["active", "signing", "draft", "archive"]

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
  const { t, tp } = useT()
  const locale = useLocale()
  const [prevRows, setPrevRows] = useState(rows)
  const [localRows, setLocalRows] = useState<DocRow[]>(rows)
  if (prevRows !== rows) {
    setPrevRows(rows)
    setLocalRows(rows)
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  // Групповое подписание ЭЦП: тип ключа (файл/токен) + прогресс.
  const [keyPref, setKeyPref] = useState<KeyStoragePref>("file")
  const [bulkSigning, setBulkSigning] = useState(false)
  const [signProgress, setSignProgress] = useState<{ done: number; total: number } | null>(null)
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

  // Группируем по tenantName (или «Без контрагента»)
  const noCounterparty = t("adminDocs.table.noCounterparty")
  const grouped = useMemo(() => {
    if (groupBy !== "tenant") return null
    const map = new Map<string, { tenantId: string | null; rows: DocRow[] }>()
    for (const r of catRows) {
      const key = r.tenantName || noCounterparty
      if (!map.has(key)) map.set(key, { tenantId: r.tenantId, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [groupBy, catRows, noCounterparty])

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
  // Подписываемые выбранные: сгенерированные АВР/счёт/сверка, ещё не подписанные.
  const signableSelected = localRows.filter(
    (r) => r.generatedId && selected.has(r.generatedId) && r.source === "generated"
      && LANDLORD_SIGNABLE_TYPES.has(r.type) && !r.isSigned,
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
          toast.error(data.error || t("adminDocs.table.toasts.zipFailed"))
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
        toast.success(tp("adminDocs.table.toasts.zipDone", selected.size))
        setSelected(new Set())
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminDocs.table.toasts.error"))
      }
    })
  }

  // Групповое подписание ЭЦП. Сначала пробуем НАСТОЯЩИЙ multisign (модуль basics):
  // один выбор ключа / ввод пароля — на все документы. Если версия NCALayer его не
  // поддерживает — откатываемся на поштучное (старый способ, пароль на каждый).
  async function bulkSign() {
    if (signableSelected.length === 0 || bulkSigning) return
    setBulkSigning(true)
    const queue = signableSelected
    const total = queue.length
    setSignProgress({ done: 0, total })
    let ok = 0
    const failed: string[] = []
    const labelOf = (row: DocRow) => `${docTypeLabel(t, row.type)} ${row.number ?? ""}`.trim()
    const save = async (row: DocRow, signature: string) => {
      const saved = await signIssuedDocumentByLandlordEcp(row.generatedId!, signature)
      if (saved.ok) {
        ok++
        setSelected((prev) => { const next = new Set(prev); next.delete(row.generatedId!); return next })
      } else {
        failed.push(`${labelOf(row)}: ${saved.error ?? t("adminDocs.table.toasts.signSaveFailed")}`)
      }
    }

    try {
      // 1) Скачиваем все выбранные документы (base64).
      const files: string[] = []
      for (const row of queue) files.push(await fetchAsBase64(`/api/documents/archive/${row.generatedId}?raw=1`))

      // 2) Настоящий групповой подпис — один ввод пароля на все.
      const many = await signManyWithNCALayer(files, { storage: keyPref })
      if (many.ok) {
        for (let i = 0; i < queue.length; i++) {
          try { await save(queue[i], many.signatures[i]) }
          catch (e) { failed.push(`${labelOf(queue[i])}: ${e instanceof Error ? e.message : t("adminDocs.table.toasts.signItemError")}`) }
          setSignProgress({ done: i + 1, total })
        }
      } else if (many.code === "USER_CANCELLED" || many.code === "NO_CONNECT" || many.code === "WS_ERROR") {
        // Пользователь отменил или NCALayer недоступен — не откатываемся.
        failed.push(many.error)
      } else {
        // 3) Откат: поштучно (пароль на каждый документ). Показываем реальную причину,
        //    чтобы диагностировать формат multisign конкретной версии NCALayer.
        console.warn("[bulkSign] multisign недоступен:", many.code, many.error)
        toast.message(t("adminDocs.table.toasts.signGroupUnavailable", { reason: `${many.code ?? "?"}: ${many.error}` }))
        for (let i = 0; i < queue.length; i++) {
          const row = queue[i]
          try {
            const res = await signWithNCALayer(files[i], "cms", { tsp: true, storage: keyPref })
            if (!res.ok) {
              failed.push(`${labelOf(row)}: ${res.error}`)
              setSignProgress({ done: i + 1, total })
              if (res.code === "USER_CANCELLED" || res.code === "NO_CONNECT" || res.code === "WS_ERROR") break
              continue
            }
            await save(row, res.signature)
          } catch (e) {
            failed.push(`${labelOf(row)}: ${e instanceof Error ? e.message : t("adminDocs.table.toasts.signItemError")}`)
          }
          setSignProgress({ done: i + 1, total })
        }
      }
    } catch (e) {
      failed.push(e instanceof Error ? e.message : t("adminDocs.table.toasts.signCrashed"))
    }

    setBulkSigning(false)
    setSignProgress(null)
    if (ok > 0) toast.success(t("adminDocs.table.toasts.signDone", { ok, total }))
    if (failed.length > 0) toast.error(t("adminDocs.table.toasts.signFailed", { count: failed.length, first: failed[0] }))
    router.refresh()
  }

  function performDeleteDraft(row: DocRow) {
    if (!row.draftId) return
    const draftId = row.draftId
    const snapshot = localRows
    setLocalRows((prev) => prev.filter((r) => r.id !== row.id))
    startTransition(async () => {
      const result = await deleteContractDraft(draftId).catch(() => ({ ok: false }))
      if (!result.ok) {
        setLocalRows(snapshot)
        toast.error(t("adminDocs.table.toasts.draftDeleteFailed"))
        return
      }
      toast.success(t("adminDocs.table.toasts.draftDeleted"))
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
        toast.error(result.error ?? t("adminDocs.table.toasts.deleteFailed"))
        return
      }
      // router.refresh() не вызываем — RSC сам подхватит изменения
      // через revalidatePath в server action. При следующем переходе
      // на страницу будет свежее. Локально мы уже синхронны.
      // Жёсткое удаление — отмены нет (восстановить нечего).
      toast.success(
        result.removedCharges
          ? t("adminDocs.table.toasts.deletedWithCharges", { count: result.removedCharges })
          : t("adminDocs.table.toasts.deleted"),
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
        toast.success(tp("adminDocs.table.toasts.bulkDeleted", result.succeeded))
        return
      }
      if (result.succeeded > 0 && result.failed > 0) {
        // Частичный успех — возвращаем неудачные обратно в список.
        const failedIds = new Set(result.results.filter((r) => !r.ok).map((r) => r.id))
        const failedRows = snapshot.filter((r) => r.deleteId && failedIds.has(r.deleteId))
        setLocalRows((prev) => [...failedRows, ...prev])
        toast.warning(
          t("adminDocs.table.toasts.bulkPartial", { succeeded: result.succeeded, failed: result.failed }),
        )
        return
      }
      // Полный провал — откатываем всё.
      setLocalRows(snapshot)
      toast.error(t("adminDocs.table.toasts.bulkFailed"))
    })
  }

  function renderAmount(r: DocRow) {
    if (r.totalAmount == null && (!r.paymentStatus || r.paymentStatus === "none")) return <>—</>
    const badge = r.paymentStatus && r.paymentStatus !== "none" ? (
      <Badge className={`px-1.5 text-[10px] ${r.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
        {r.paymentStatus === "paid" ? t("adminDocs.table.badges.paid") : t("adminDocs.table.badges.debt")}
      </Badge>
    ) : null
    return (
      <div className="flex items-center justify-end gap-2">
        {badge}
        {r.totalAmount != null ? (
          <span>
            {formatMoneyL(locale, r.totalAmount)}
            {r.type === "CONTRACT" && <span className="ml-0.5 text-xs font-normal text-slate-400 dark:text-slate-500">{t("common.money.perMonth")}</span>}
          </span>
        ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
      </div>
    )
  }

  // «Удалить счёт на оплату № 12 навсегда?» — вид документа + номер.
  function deleteDocName(row: DocRow) {
    const label = docTypeLabel(t, row.type)
    const name = label === row.type ? t("adminDocs.table.menu.deleteFallback") : label
    return `${name}${row.number ? ` № ${row.number}` : ""}`
  }

  function renderActions(row: DocRow) {
    const isDeleting = deletingRowId === row.id && pending
    return (
      <div className="flex items-center justify-end gap-2">
        {canSign && row.source === "generated" && row.generatedId && LANDLORD_SIGNABLE_TYPES.has(row.type) && !row.isSigned && (
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
        {row.downloadHref ? (
          <a
            href={row.downloadHref}
            download
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <Download className="h-3 w-3" />
            {t("common.actions.download")}
          </a>
        ) : (
          <Link
            href={row.viewHref ?? (row.tenantId ? `/admin/tenants/${row.tenantId}` : "/admin/documents")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <FileText className="h-3 w-3" />
            {row.viewLabel ?? t("common.actions.open")}
          </Link>
        )}
        {/* Остальное — в меню «⋯», чтобы в строке не было четырёх кнопок.
            Подписанный документ из списка не удаляется (решение владельца 19.09.2026). */}
        {(row.draftId || (row.isSigned && row.deleteId) || (row.source === "contract" && row.deleteId) || (row.deleteId && row.canDelete && !row.isSigned)) && (
          // Меню — во всплывающем слое поверх страницы: внутри таблицы с прокруткой
          // оно обрезалось и уезжало вниз под последней строкой.
          <Popover>
            <PopoverTrigger
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label={t("adminDocs.table.menu.more")}
              title={t("adminDocs.table.menu.more")}
            >
              ⋯
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="flex w-52 flex-col items-stretch gap-1 p-1.5"
              // Окно подтверждения удаления открывается из меню — клик в нём не
              // должен закрывать меню, иначе окно исчезнет вместе с ним.
              onInteractOutside={(e) => {
                if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],[role="alertdialog"]')) e.preventDefault()
              }}
            >
              {row.isSigned && row.deleteId && (
                <Link
                  href={`/verify/${row.deleteId}`}
                  target="_blank"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  title={t("adminDocs.table.menu.whoSignedTitle")}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {t("adminDocs.table.menu.whoSigned")}
                </Link>
              )}
              {row.source === "contract" && row.deleteId && (
                <ContractCardButton contractId={row.deleteId} />
              )}
              {row.draftId && (
                <ConfirmDialog
                  variant="danger"
                  title={t("adminDocs.table.menu.deleteDraftTitle")}
                  description={t("adminDocs.table.menu.deleteDraftText")}
                  confirmLabel={t("adminDocs.table.menu.deleteDraft")}
                  onConfirm={() => performDeleteDraft(row)}
                  trigger={
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("adminDocs.table.menu.deleteDraft")}
                    </button>
                  }
                />
              )}
              {row.deleteId && row.canDelete && !row.isSigned && (
                <ConfirmDialog
                  variant="danger"
                  requireText={t("adminDocs.table.menu.deleteWord")}
                  title={t("adminDocs.table.menu.deleteTitle", { doc: deleteDocName(row) })}
                  description={t("adminDocs.table.menu.deleteText")}
                  confirmLabel={t("adminDocs.table.menu.deleteConfirm")}
                  onConfirm={() => performDelete(row)}
                  trigger={
                    <button
                      type="button"
                      disabled={isDeleting}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {t("adminDocs.table.menu.delete")}
                    </button>
                  }
                />
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Под-вкладки по статусу */}
      <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {DOC_CATEGORY_TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setCat(key); setSelected(new Set()) }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              cat === key
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {t(`adminDocs.table.tabs.${key}`)}
            <span className={`ml-1.5 text-xs ${cat === key ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>{catCounts[key]}</span>
          </button>
        ))}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{t("adminDocs.table.view.label")}</span>
        <button
          onClick={() => setGroupBy("none")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            groupBy === "none"
              ? "bg-slate-900 dark:bg-slate-700 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          {t("adminDocs.table.view.list")}
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
          {t("adminDocs.table.view.byTenant")}
        </button>
      </div>

      {/* Bulk action bar. В тёмной теме оборачиваем в slate-800 + border,
          иначе bg-slate-900 сливается с тёмным фоном страницы. */}
      {selected.size > 0 && (
        <div className="bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
          <p className="text-sm font-medium">
            {tp("adminDocs.table.bulk.selected", selected.size)}
            {deletableSelected.length < selected.size && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">
                {t("adminDocs.table.bulk.deletable", { count: deletableSelected.length })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-300 hover:text-white"
              disabled={pending || bulkDeleting || bulkSigning}
            >
              {t("adminDocs.table.bulk.clear")}
            </button>
            {canSign && signableSelected.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <NcaKeyTypeSelect value={keyPref} onChange={setKeyPref} disabled={bulkSigning || pending} />
                <button
                  onClick={bulkSign}
                  disabled={bulkSigning || pending}
                  title={t("adminDocs.table.bulk.signTitle")}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                >
                  {bulkSigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {bulkSigning
                    ? (signProgress && signProgress.done > 0
                        ? t("adminDocs.table.bulk.signProgress", { done: signProgress.done, total: signProgress.total })
                        : t("adminDocs.table.bulk.signing"))
                    : t("adminDocs.table.bulk.sign", { count: signableSelected.length })}
                </button>
              </span>
            )}
            {canExportZip && (
              <button
                onClick={downloadArchive}
                disabled={pending || bulkDeleting || bulkSigning}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                {pending && !bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                {t("adminDocs.table.bulk.zip")}
              </button>
            )}
            {deletableSelected.length > 0 && (
              <ConfirmDialog
                variant="danger"
                requireText={t("adminDocs.table.menu.deleteWord")}
                title={tp("adminDocs.table.bulk.deleteTitle", deletableSelected.length)}
                description={
                  `${t("adminDocs.table.bulk.deleteText")}${
                    deletableSelected.length < selected.size
                      ? t("adminDocs.table.bulk.deleteSkipped", { count: selected.size - deletableSelected.length })
                      : ""
                  }${t("adminDocs.table.bulk.deleteNoUndo")}`
                }
                confirmLabel={t("adminDocs.table.menu.deleteConfirm")}
                onConfirm={performBulkDelete}
                trigger={
                  <button
                    type="button"
                    disabled={pending || bulkDeleting || bulkSigning}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  >
                    {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {t("adminDocs.table.bulk.deleteSelected")}
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
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.type")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.number")}</th>
              {groupBy !== "tenant" && (
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.counterparty")}</th>
              )}
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.period")}</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.amount")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.table.columns.created")}</th>
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
                          <span>{tp("adminDocs.table.groupCount", group.rows.length)}</span>
                          {groupTotal > 0 && <span>{formatMoneyL(locale, groupTotal)}</span>}
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
                          <Badge className={TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}>
                            {r.typeLabel ?? docTypeLabel(t, r.type)}
                          </Badge>
                          <ReconBadge row={r} />
                          <SignBadge row={r} />
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.number ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.period ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                          {renderAmount(r)}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                          <span suppressHydrationWarning>{formatDateShortL(locale, new Date(r.generatedAt))}</span>
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
                    <Badge className={TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}>
                      {r.typeLabel ?? docTypeLabel(t, r.type)}
                    </Badge>
                    <ReconBadge row={r} />
                    <SignBadge row={r} />
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
                    <span suppressHydrationWarning>{formatDateShortL(locale, new Date(r.generatedAt))}</span>
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
                    {localRows.length === 0 ? emptyHint : t("adminDocs.table.emptyCategory")}
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
