"use client"

import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"
import { useMemo, useRef, useState, useTransition, useEffect } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  FileSignature,
  Users,
  Save,
  Download,
  Lightbulb,
  AlertTriangle,
  Info,
  Sparkles,
  FilePlus2,
  Send,
  ShieldCheck,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { signWithNCALayer, type KeyStoragePref } from "@/lib/ncalayer"
import { NcaKeyTypeSelect } from "@/components/nca-key-type-select"
import { getLandlordSignPayload, signContractByLandlordEcp, sendContractForSignature } from "@/app/actions/contract-workflow"
import { Button } from "@/components/ui/button"
import {
  saveContractDraft,
  listContractDrafts,
  loadContractDraft,
  generateContractDocx,
  listConstructorTenants,
  prefillFromTenant,
  createContractFromBuilder,
  getNextContractNumber,
  getContractDefaults,
  saveContractDefaults,
  type DraftListItem,
  type ConstructorTenant,
} from "@/app/actions/contract-builder"
import { CONTRACT_PLACEMENT_TYPES, CORE_CONTRACT_TYPES, isContractPlacementType, type ContractPlacementType } from "@/lib/contract-placement-types"
import { applyContractTypePreset } from "@/lib/contract-type-presets"
import { contractSubtitle } from "@/lib/contract-engine/render"
import { applyContractDefaults, REMEMBERED_FIELDS } from "@/lib/contract-engine/org-defaults"
import { placementFamily } from "@/lib/contract-engine/placement"
import { contractActSubtitle, isPremisesLikeType } from "@/lib/contract-placement-types"
import { PlacementAnnexesView } from "./placement-annexes-view"
import {
  defaultState,
  defaultPlacementTerms,
  assemble,
  advise,
  applyAdvisorFix,
  debtRemainder,
  validRentSteps,
  UTILITY_ORDER,
  UTILITY_LABELS,
  money,
  partyIntro,
  partyRequisites,
  dateLong,
  type ContractState,
  type HandoverAct,
  type Party,
  type PartyType,
  type IndividualSubtype,
  type UtilityKey,
  type UtilityMode,
  type OperatingMethod,
  type PlacementTerms,
  type PlacedEquipment,
  type PlacementElectricity,
  type ValidationIssue,
} from "@/lib/contract-engine"
import { useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import type { Messages } from "@/lib/i18n/messages"
import type { TextKey, Translator } from "@/lib/i18n/translate"

type Mutator = (s: ContractState) => void

const inputCls = FIELD_CLS
const labelCls = LABEL_CLS
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"
const cardCls = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"

// Варианты состояния помещения для Акта приёма-передачи (выпадающий список).
// Значение выбранного пункта печатается в Акте, поэтому остаётся русским.
// в документ — переводит юрист
const CONDITION_OPTIONS = ["не удовлетворительное", "удовлетворительное", "хорошее", "отличное"]

// Справочники держат только ключ: подпись берётся из словаря при отрисовке,
// иначе она застыла бы на языке, который был при загрузке модуля.
const PARTY_TYPES: PartyType[] = ["too", "ip", "individual"]
// Основание полномочий склеивается в преамбулу договора («в лице … действующего
// на основании Устава»), поэтому не переводится.
// в документ — переводит юрист
const BASIS_BY_TYPE: Record<PartyType, string> = {
  too: "Устава",
  ip: "Свидетельства/Уведомления о регистрации ИП",
  individual: "удостоверения личности",
}
// Подтипы физлица: префикс к наименованию + шаблон основания (лицензия). И
// префикс, и основание попадают в преамбулу договора — остаются русскими.
// в документ — переводит юрист
const INDIVIDUAL_SUBTYPES: { v: IndividualSubtype; prefix: string; basis: string }[] = [
  { v: "regular", prefix: "", basis: "удостоверения личности" },
  { v: "chsi", prefix: "Частный судебный исполнитель ", basis: "государственной лицензии № ____ от __.__.____ г." },
  { v: "advokat", prefix: "Адвокат ", basis: "лицензии на занятие адвокатской деятельностью № ____ от __.__.____ г." },
  { v: "notarius", prefix: "Нотариус ", basis: "лицензии на занятие нотариальной деятельностью № ____ от __.__.____ г." },
]
const SUBTYPE_PREFIXES = INDIVIDUAL_SUBTYPES.map((s) => s.prefix).filter(Boolean)
const SUBTYPE_BASES = INDIVIDUAL_SUBTYPES.map((s) => s.basis)
/** Снять известный префикс подтипа с наименования (чтобы не дублировать). */
function stripSubtypePrefix(name: string): string {
  for (const pre of SUBTYPE_PREFIXES) if (name.startsWith(pre)) return name.slice(pre.length)
  return name
}
/** Основание похоже на авто-шаблон (можно перезаписать), а не на введённое вручную. */
function isTemplateBasis(basis: string): boolean {
  return basis.trim() === "" || basis === BASIS_BY_TYPE.individual || SUBTYPE_BASES.includes(basis)
}
const UTILITY_MODES: { v: UtilityMode; labelKey: "included" | "metered" | "operating" }[] = [
  { v: "included", labelKey: "included" },
  { v: "metered_separate", labelKey: "metered" },
  { v: "in_operating_costs", labelKey: "operating" },
]
const PRESETS: { key: "A" | "B" | "C" | "D"; apply: Mutator }[] = [
  { key: "A", apply: (s) => { s.financials.premisesUtilities = { electricity: "metered_separate", coldWater: "included", hotWater: "included", heating: "included", sewerage: "included", garbage: "included" }; s.financials.operatingCosts.method = "none" } },
  { key: "B", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "metered_separate"; s.financials.operatingCosts.method = "fixed_per_sqm"; s.financials.operatingCosts.scope = "common_area" } },
  { key: "C", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "in_operating_costs"; s.financials.operatingCosts.method = "pooled_prorata"; s.financials.operatingCosts.scope = "all_inclusive" } },
  { key: "D", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "included"; s.financials.operatingCosts.method = "none" } },
]

/**
 * Подпись замечания проверки. Валидатор — чистый модуль, работающий и в
 * браузере: языка он не знает и возвращает ключ (lib/contract-engine/validate.ts).
 */
function validationText(t: Translator<Messages>["t"], issue: ValidationIssue): string {
  return t(`contractEngine.validation.${issue.key}` as TextKey<Messages>, issue.vars)
}

const ADV_BOX: Record<string, string> = {
  warn: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
  suggest: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
}

export function ContractConstructor({ embedded = false, initialTenantId, initialDraftId }: { embedded?: boolean; initialTenantId?: string; initialDraftId?: string } = {}) {
  // Старые черновики/договоры могли сохраняться без handoverAct — дополняем дефолтом.
  // Достраиваем дефолты для черновиков, сохранённых до появления новых полей
  // (handoverAct, deposit.enabled, penalty caps) — иначе раздел депозита/поля пени
  // «пропадут» у старых драфтов. Спред дефолта первым, сохранённое перекрывает.
  const withDefaults = (s: ContractState): ContractState => {
    const d = defaultState()
    return {
      ...s,
      handoverAct: s.handoverAct ?? d.handoverAct,
      ...(s.placement ? { placement: { ...defaultPlacementTerms(s.placement.family), ...s.placement } } : {}),
      financials: {
        ...s.financials,
        deposit: { ...d.financials.deposit, ...s.financials?.deposit },
        penalty: { ...d.financials.penalty, ...s.financials?.penalty },
      },
    }
  }
  const { t, tp } = useT()
  const [state, setState] = useState<ContractState>(defaultState)
  const [tab, setTab] = useState<"contract" | "annexes">("contract")
  const [step, setStep] = useState(1)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState(() => t("adminDocs.constructor.untitled"))
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [pending, startTransition] = useTransition()
  const [signing, setSigning] = useState(false)
  const [keyPref, setKeyPref] = useState<KeyStoragePref>("file")

  const set = (mut: Mutator) => setState((prev) => { const n = structuredClone(prev); mut(n); return n })

  const assembly = useMemo(() => assemble(state), [state])
  const advices = useMemo(() => advise(state, assembly.ctx), [state, assembly])
  const hardErrors = assembly.validation.hard

  const [tenants, setTenants] = useState<ConstructorTenant[]>([])
  const [selTenant, setSelTenant] = useState("")
  // Доступные типы договоров (умная видимость по организации). До выбора
  // арендатора показываем базовые; после prefill — фактические для орг.
  const [availableTypes, setAvailableTypes] = useState<ContractPlacementType[]>(CORE_CONTRACT_TYPES)
  // У выбранного арендатора уже есть незавершённый договор → создавать новый нельзя.
  const dupContract = tenants.find((row) => row.id === selTenant)?.existingContract ?? null
  // Контакты арендодателя на выбор: владелец (аккаунт) или администратор (контакты организации).
  const [landlordContacts, setLandlordContacts] = useState<{ owner: { phone: string; email: string }; admin: { phone: string; email: string } } | null>(null)
  // Автонумерация договора (001, 002, …). Выкл — владелец задаёт номер вручную.
  const [autoNumber, setAutoNum] = useState(true)

  const applyAutoNumber = () => {
    getNextContractNumber().then((r) => { if (r.ok && r.number) set((s) => { s.meta.contractNumber = r.number! }) }).catch(() => {})
  }
  const onSetAutoNumber = (v: boolean) => { setAutoNum(v); if (v) applyAutoNumber() }

  const refreshDrafts = () => { listContractDrafts().then(setDrafts).catch(() => {}) }
  useEffect(() => { listContractDrafts().then(setDrafts).catch(() => {}) }, [])
  useEffect(() => { listConstructorTenants().then(setTenants).catch(() => {}) }, [])
  // Условия организации «по умолчанию» — в новый пустой договор. Если уже выбран
  // арендатор или черновик, не трогаем: там свои условия.
  const defaultsApplied = useRef(false)
  useEffect(() => {
    getContractDefaults()
      .then((d) => {
        if (!d || defaultsApplied.current) return
        defaultsApplied.current = true
        setState((prev) => {
          const n = structuredClone(prev)
          applyContractDefaults(n, d)
          return n
        })
      })
      .catch(() => {})
  }, [])
  const [savingDefaults, setSavingDefaults] = useState(false)
  function doSaveDefaults() {
    setSavingDefaults(true)
    saveContractDefaults(state)
      .then((r) => (r.ok ? toast.success(t("adminDocs.constructor.toasts.defaultsSaved")) : toast.error(r.error ?? t("adminDocs.constructor.toasts.saveFailed"))))
      .finally(() => setSavingDefaults(false))
  }
  // Предзаполнить дату договора сегодняшней (только на клиенте — чтобы не ломать гидрацию).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- осознанно: client-only начальное значение, иначе hydration mismatch
    setState((prev) => {
      if (prev.meta.contractDate) return prev
      const d = new Date()
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const n = structuredClone(prev)
      n.meta.contractDate = iso
      return n
    })
  }, [])
  // Предзаполнить номер договора следующим свободным (если включена автонумерация).
  useEffect(() => { if (autoNumber) applyAutoNumber() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Автовыбор арендатора из ?tenantId= (когда конструктор открыт из карточки арендатора).
  // Открыть черновик по ссылке «Продолжить» из списка документов — когда список
  // арендаторов уже загружен (нужен для подстановки арендатора черновика).
  const appliedInitialDraft = useRef(false)
  useEffect(() => {
    if (appliedInitialDraft.current || !initialDraftId || tenants.length === 0) return
    appliedInitialDraft.current = true
    doLoad(initialDraftId)
  }, [tenants, initialDraftId]) // eslint-disable-line react-hooks/exhaustive-deps
  const appliedInitialTenant = useRef(false)
  useEffect(() => {
    if (appliedInitialTenant.current || !initialTenantId) return
    if (!tenants.some((row) => row.id === initialTenantId)) return
    appliedInitialTenant.current = true
    onPickTenant(initialTenantId)
  }, [tenants, initialTenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const row of tenants) {
      const key = row.building ?? t("adminDocs.constructor.step1.noBuilding")
      const list = m.get(key) ?? []
      list.push(row)
      m.set(key, list)
    }
    return [...m.entries()]
  }, [tenants, t])

  function onPickTenant(id: string) {
    setSelTenant(id)
    if (!id) return
    startTransition(async () => {
      const r = await prefillFromTenant(id)
      if (r.ok && r.state) {
        setState(() => {
          const n = withDefaults(r.state!)
          // Пресет по авто-определённому типу (крыша/территория → фикс, без эксп.расходов/уборки).
          if (isContractPlacementType(n.meta.placementType)) applyContractTypePreset(n, n.meta.placementType)
          return n
        })
        setLandlordContacts(r.landlordContacts ?? null)
        if (r.availableTypes?.length) setAvailableTypes(r.availableTypes)
        setDraftName(r.state.tenant.name || t("adminDocs.constructor.untitled"))
        if (autoNumber) applyAutoNumber() // prefill сбрасывает номер — вернуть автономер
        toast.success(t("adminDocs.constructor.toasts.prefilled"))
      } else toast.error(r.error ?? t("adminDocs.constructor.toasts.prefillFailed"))
    })
  }

  function doSave() {
    startTransition(async () => {
      const r = await saveContractDraft({ id: draftId ?? undefined, name: draftName, builderState: state, tenantId: selTenant || undefined })
      if (r.ok) { setDraftId(r.id ?? null); toast.success(t("adminDocs.constructor.toasts.draftSaved")); refreshDrafts() } else toast.error(r.error ?? t("adminDocs.constructor.toasts.saveError"))
    })
  }
  function doLoad(id: string) {
    if (!id) return
    startTransition(async () => {
      const r = await loadContractDraft(id)
      if (r.ok && r.builderState) {
        const loaded = withDefaults(r.builderState)
        defaultsApplied.current = true // условия организации не накладываем поверх черновика
        setState(loaded)
        setDraftId(id)
        setDraftName(r.name ?? t("adminDocs.constructor.untitled"))
        setAutoNum(false)
        // Арендатор черновика — сразу, без перезаполнения из карточки (иначе
        // правки черновика затёрлись бы). Старые черновики без tenantId — по названию.
        const byName = tenants.find((row) => row.name.trim() === (loaded.tenant.name ?? "").trim())
        setSelTenant(r.tenantId ?? byName?.id ?? "")
        toast.success(t("adminDocs.constructor.toasts.draftOpened"))
      } else toast.error(r.error ?? t("adminDocs.constructor.toasts.loadFailed"))
    })
  }
  function doDownload() {
    startTransition(async () => {
      const r = await generateContractDocx(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? t("adminDocs.constructor.toasts.generateFailed")); return }
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      // Имя файла — реквизит документа, остаётся русским (docs/i18n-documents-plan.md).
      link.download = r.fileName ?? "Договор.docx"
      link.click()
      URL.revokeObjectURL(url)
    })
  }
  function doCreate(opts: { send?: boolean; landlordSign?: boolean }) {
    if (!selTenant) { toast.error(t("adminDocs.constructor.toasts.pickTenantFirst")); return }
    startTransition(async () => {
      const r = await createContractFromBuilder(selTenant, state, { ...opts, autoNumber })
      if (!r.ok) { toast.error(r.error ?? t("adminDocs.constructor.toasts.createFailed")); return }
      if (r.error) { toast.error(r.error); return } // создан, но шаг подписи/отправки не удался
      toast.success(
        opts.send
          ? opts.landlordSign
            ? t("adminDocs.constructor.toasts.createdSignedSent")
            : t("adminDocs.constructor.toasts.createdSent")
          : t("adminDocs.constructor.toasts.createdDraft"),
      )
    })
  }

  // Создать → подписать ЭЦП владельца (NCALayer, пароль) → отправить арендатору.
  async function doCreateSignEcpSend() {
    if (!selTenant) { toast.error(t("adminDocs.constructor.toasts.pickTenantFirst")); return }
    setSigning(true)
    try {
      // 1) создаём договор (черновик)
      const created = await createContractFromBuilder(selTenant, state, { autoNumber })
      if (!created.ok || !created.contractId) { toast.error(created.error ?? t("adminDocs.constructor.toasts.createFailed")); return }
      const contractId = created.contractId
      // 2) канонический текст для подписи
      const pl = await getLandlordSignPayload(contractId)
      if (!pl.ok) { toast.error(t("adminDocs.constructor.toasts.signPayloadFailed", { error: String(pl.error) })); return }
      // 3) подпись ЭЦП через NCALayer (запросит пароль к ключу)
      const sig = await signWithNCALayer(pl.payloadB64, "cms", { tsp: true, storage: keyPref })
      if (!sig.ok) { toast.error(t("adminDocs.constructor.toasts.signFailedDraft", { error: sig.error || t("adminDocs.constructor.toasts.signNotDone") })); return }
      // 4) фиксируем подпись владельца
      const saved = await signContractByLandlordEcp(contractId, sig.signature)
      if (!saved.ok) { toast.error(t("adminDocs.constructor.toasts.signSavedFailedDraft", { error: saved.error ?? t("adminDocs.constructor.toasts.signSaveFailed") })); return }
      // 5) отправляем арендатору на подпись
      const sent = await sendContractForSignature(contractId)
      if (!sent.ok) { toast.error(t("adminDocs.constructor.toasts.signedNotSent", { error: String(sent.error) })); return }
      toast.success(t("adminDocs.constructor.toasts.signedAndSent"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("adminDocs.constructor.toasts.signCrashed"))
    } finally {
      setSigning(false)
    }
  }

  const hasTenant = !!selTenant || !!draftId
  // Подписи шагов стоят в один ряд — словарь держит их короткими, здесь только
  // собираем ряд по номеру шага.
  const STEPS = ([1, 2, 3, 4, 5] as const).map((n) => ({
    n,
    title: t(`adminDocs.constructor.steps.s${n}.title` as TextKey<Messages>),
    hint: t(`adminDocs.constructor.steps.s${n}.hint` as TextKey<Messages>),
  }))
  const goTo = (n: number) => { if (n === 1 || hasTenant) setStep(n) }

  return (
    <div className="space-y-5">
      {/* header */}
      {!embedded && (
      <div className="flex items-center gap-3">
        <Link href="/admin/settings" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" aria-label={t("adminDocs.constructor.backToSettings")}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <FileSignature className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            {t("adminDocs.constructor.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.subtitle")}</p>
        </div>
      </div>
      )}

      {/* Шаги */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((s) => {
          const active = step === s.n
          const locked = s.n > 1 && !hasTenant
          const done = hasTenant && s.n < step
          return (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => goTo(s.n)}
                disabled={locked}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-blue-500 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  active ? "bg-blue-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${active ? "text-blue-700 dark:text-blue-300" : "text-slate-800 dark:text-slate-200"}`}>{s.title}</span>
                  <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{s.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Черновик: только когда есть что сохранять */}
      {hasTenant && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input className={`${inputCls} w-56`} value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={t("adminDocs.constructor.draft.namePlaceholder")} aria-label={t("adminDocs.constructor.draft.namePlaceholder")} />
          <Button variant="secondary" size="sm" leftIcon={<Save className="h-4 w-4" />} loading={pending} onClick={doSave}>{t("adminDocs.constructor.draft.save")}</Button>
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0} onClick={doDownload}>{t("adminDocs.constructor.draft.downloadDocx")}</Button>
          {hardErrors.length > 0 && (
            <button type="button" onClick={() => setStep(5)} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" /> {tp("adminDocs.constructor.draft.errors", hardErrors.length)}
            </button>
          )}
          {dupContract && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              {t("adminDocs.constructor.draft.dup", { number: dupContract.number })}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ── форма текущего шага ── */}
        <div className="space-y-4">
          {step === 1 && (
            <>
              <div className={`${cardCls} p-5`}>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminDocs.constructor.step1.withWhom")}</label>
                <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
                  <option value="">{t("adminDocs.constructor.step1.pickTenant")}</option>
                  {tenantGroups.map(([b, list]) => (
                    <optgroup key={b} label={b}>
                      {list.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                {(() => {
                  const ec = tenants.find((row) => row.id === selTenant)?.existingContract
                  if (!ec) return null
                  return (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                      {t("adminDocs.constructor.step1.existing", {
                        number: ec.number,
                        status: t(`common.contractStatus.${ec.status}` as TextKey<Messages>),
                      })}
                    </div>
                  )
                })()}
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.step1.prefillHint")}</p>
                {!hasTenant && drafts.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <label className={labelCls}>{t("adminDocs.constructor.step1.orDraft")}</label>
                    <select className={inputCls} value="" onChange={(e) => doLoad(e.target.value)}>
                      <option value="">{t("adminDocs.constructor.step1.pickDraft")}</option>
                      {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {hasTenant && (
                <div className={`${cardCls} space-y-1 p-5`}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><Users className="h-4 w-4 text-slate-400" /> {t("adminDocs.constructor.step1.parties")}</div>
                  <PartiesStep state={state} set={set} landlordContacts={landlordContacts} />
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <div className={`${cardCls} space-y-1 p-5`}>
              <PremisesStep state={state} set={set} autoNumber={autoNumber} onSetAutoNumber={onSetAutoNumber} availableTypes={availableTypes} />
            </div>
          )}
          {step === 3 && (
            <div className={`${cardCls} space-y-1 p-5`}>
              <FinancialStep state={state} set={set} />
            </div>
          )}
          {step === 4 && (
            <div className={`${cardCls} space-y-1 p-5`}>
              <AnnexesStep state={state} set={set} />
            </div>
          )}
          {step === 5 && (
            <>
              <div className={cardCls}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                  <Sparkles className="h-4 w-4 text-slate-400 dark:text-slate-500" /> {t("adminDocs.constructor.review.title")}
                </div>
                <div className="space-y-2 p-5">
                  {hardErrors.map((issue, i) => (
                    <div key={"h" + i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{validationText(t, issue)}</span>
                    </div>
                  ))}
                  {advices.map((a) => (
                    <div key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${ADV_BOX[a.severity]}`}>
                      {a.severity === "warn" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : a.severity === "suggest" ? <Lightbulb className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
                      <span className="flex-1">{t(`contractEngine.advice.${a.messageKey}` as TextKey<Messages>, a.vars)}</span>
                      {a.fix && (
                        <button onClick={() => set((s) => Object.assign(s, applyAdvisorFix(s, a.fix!)))} className="shrink-0 rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:bg-white/40">{t("adminDocs.constructor.review.fix")}</button>
                      )}
                    </div>
                  ))}
                  {advices.length === 0 && hardErrors.length === 0 && (
                    <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" /> {t("adminDocs.constructor.review.noIssues")}</p>
                  )}
                </div>
              </div>

              <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-5`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminDocs.constructor.review.rememberTitle")}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.review.rememberHint", { fields: REMEMBERED_FIELDS })}</p>
                </div>
                <Button variant="outline" size="sm" leftIcon={<Save className="h-4 w-4" />} loading={savingDefaults} onClick={doSaveDefaults}>{t("adminDocs.constructor.review.remember")}</Button>
              </div>

              <div className={`${cardCls} space-y-3 p-5`}>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminDocs.constructor.review.how")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <NcaKeyTypeSelect value={keyPref} onChange={setKeyPref} disabled={signing || pending} />
                  <Button variant="primary" leftIcon={<ShieldCheck className="h-4 w-4" />} loading={signing} disabled={hardErrors.length > 0 || pending || !!dupContract || !selTenant} onClick={doCreateSignEcpSend}>
                    {t("adminDocs.constructor.review.signSend")}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.review.signHint")}</p>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Button variant="outline" size="sm" leftIcon={<Send className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0 || signing || !!dupContract || !selTenant} onClick={() => doCreate({ send: true })}>{t("adminDocs.constructor.review.sendNoSign")}</Button>
                  <Button variant="outline" size="sm" leftIcon={<FilePlus2 className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0 || signing || !!dupContract || !selTenant} onClick={() => doCreate({})}>{t("adminDocs.constructor.review.createOnly")}</Button>
                </div>
              </div>
            </>
          )}

          {/* Навигация по шагам */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" />} disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>{t("adminDocs.constructor.nav.back")}</Button>
            {step < 5 && (
              <Button variant="primary" size="sm" disabled={!hasTenant} onClick={() => setStep((s) => Math.min(5, s + 1))}>
                {t("adminDocs.constructor.nav.next", { step: STEPS[step].title.toLowerCase() })} <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ── живой предпросмотр ── */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className={cardCls}>
            <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <button onClick={() => setTab("contract")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "contract" ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>{t("adminDocs.constructor.preview.tabContract")}</button>
              <button onClick={() => setTab("annexes")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "annexes" ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>{t("adminDocs.constructor.preview.tabAnnexes")}</button>
              <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.preview.hint")}</span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {tab === "contract" ? <ContractPreview state={state} onPick={hasTenant ? (n) => { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }) } : undefined} /> : <AnnexesPreview state={state} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── small UI ─────────────────────────

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 border-r border-slate-200 py-1.5 text-xs last:border-r-0 dark:border-slate-800 ${value === o.v ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ToggleRow({ on, title, hint, onToggle }: { on: boolean; title: string; hint?: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700">
      <span><b className="block text-[13px] text-slate-900 dark:text-slate-100">{title}</b>{hint && <small className="text-[11.5px] text-slate-500 dark:text-slate-400">{hint}</small>}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}><i className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} /></span>
    </button>
  )
}

// ───────────────────────── steps ─────────────────────────

function PartyForm({ p, role, onChange }: { p: Party; role: string; onChange: (mut: (x: Party) => void) => void }) {
  const { t } = useT()
  const isIndiv = p.type === "individual"
  // Чистое физлицо: выступает от своего имени → нет подписанта/основания/банка,
  // основание = удостоверение личности. ЧСИ/адвокат/нотариус — лицо частной
  // практики, у них остаются основание (лицензия) и банк.
  const isRegular = isIndiv && (!p.individualSubtype || p.individualSubtype === "regular")
  return (
    <div>
      <div className={secTitleCls}>{role}</div>
      <div className="mb-2"><Seg value={p.type} options={PARTY_TYPES.map((v) => ({ v, label: t(`adminDocs.constructor.party.types.${v}` as TextKey<Messages>) }))} onChange={(v) => onChange((x) => { x.type = v; x.basis = BASIS_BY_TYPE[v]; if (v !== "individual") x.individualSubtype = undefined; else if (!x.individualSubtype) x.individualSubtype = "regular" })} /></div>
      {p.type === "individual" && (
        <div className="mb-2">
          <Seg
            value={p.individualSubtype ?? "regular"}
            options={INDIVIDUAL_SUBTYPES.map((sub) => ({ v: sub.v, label: t(`adminDocs.constructor.party.subtypes.${sub.v}` as TextKey<Messages>) }))}
            onChange={(v) => onChange((x) => {
              const meta = INDIVIDUAL_SUBTYPES.find((s) => s.v === v)!
              x.individualSubtype = v
              // префикс к наименованию (без дублирования) + шаблон основания, если оно ещё авто
              x.name = meta.prefix + stripSubtypePrefix(x.name)
              if (isTemplateBasis(x.basis)) x.basis = meta.basis
            })}
          />
        </div>
      )}
      <div className="mb-2"><label className={labelCls}>{isIndiv ? t("adminDocs.constructor.party.fio") : t("adminDocs.constructor.party.name")}</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      {!isIndiv && (
        <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.party.signatory")}</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      )}
      {isRegular ? (
        <>
          {/* Физлицо: ИИН + удостоверение личности (без «основания»/банка). */}
          <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.party.iin")}</label><input className={inputCls} value={p.iin || ""} onChange={(e) => onChange((x) => { x.iin = e.target.value })} /></div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div><label className={labelCls}>{t("adminDocs.constructor.party.idNumber")}</label><input className={inputCls} value={p.idDocNumber ?? ""} onChange={(e) => onChange((x) => { x.idDocNumber = e.target.value })} /></div>
            <div><label className={labelCls}>{t("adminDocs.constructor.party.idIssuedBy")}</label><input className={inputCls} value={p.idDocIssuedBy ?? ""} onChange={(e) => onChange((x) => { x.idDocIssuedBy = e.target.value })} /></div>
            <div><label className={labelCls}>{t("adminDocs.constructor.party.idIssuedAt")}</label><input className={inputCls} placeholder={t("adminDocs.constructor.party.datePlaceholder")} value={p.idDocIssuedAt ?? ""} onChange={(e) => onChange((x) => { x.idDocIssuedAt = e.target.value })} /></div>
            <div><label className={labelCls}>{t("adminDocs.constructor.party.idExpiresAt")}</label><input className={inputCls} placeholder={t("adminDocs.constructor.party.datePlaceholder")} value={p.idDocExpiresAt ?? ""} onChange={(e) => onChange((x) => { x.idDocExpiresAt = e.target.value })} /></div>
          </div>
        </>
      ) : (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {/* ИП/ЧСИ/адвокат/нотариус — по ИИН, ТОО/АО — по БИН; основание = устав/лицензия. */}
          <div><label className={labelCls}>{p.type === "too" ? t("adminDocs.constructor.party.bin") : t("adminDocs.constructor.party.iin")}</label><input className={inputCls} value={(p.type === "too" ? p.bin : p.iin) || ""} onChange={(e) => onChange((x) => { if (x.type === "too") x.bin = e.target.value; else x.iin = e.target.value })} /></div>
          <div><label className={labelCls}>{t("adminDocs.constructor.party.basis")}</label><input className={inputCls} value={p.basis} onChange={(e) => onChange((x) => { x.basis = e.target.value })} /></div>
        </div>
      )}
      <div className="mb-2"><label className={labelCls}>{isIndiv ? t("adminDocs.constructor.party.residence") : t("adminDocs.constructor.party.address")}</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      {!isRegular && (
        <div className="grid grid-cols-3 gap-2">
          <div><label className={labelCls}>{t("adminDocs.constructor.party.iik")}</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
          <div><label className={labelCls}>{t("adminDocs.constructor.party.bank")}</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
          <div><label className={labelCls}>{t("adminDocs.constructor.party.bik")}</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
        </div>
      )}
    </div>
  )
}

type Contacts = { phone: string; email: string }

function contactBtn(active: boolean): string {
  return `flex-1 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition ${
    active
      ? "border-transparent bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
  }`
}

function PartiesStep({ state, set, landlordContacts }: { state: ContractState; set: (m: Mutator) => void; landlordContacts: { owner: Contacts; admin: Contacts } | null }) {
  const { t } = useT()
  const ll = state.landlord
  const sameAs = (c: Contacts) => (c.phone || c.email) !== "" && (ll.phone ?? "") === c.phone && (ll.email ?? "") === c.email
  const applyContacts = (c: Contacts) => set((s) => { s.landlord.phone = c.phone; s.landlord.email = c.email })
  const contactHint = (c: Contacts) => [c.phone, c.email].filter(Boolean).join(" · ") || t("adminDocs.constructor.party.contactsNone")
  return (
    <>
      <PartyForm p={state.landlord} role={t("adminDocs.constructor.party.landlord")} onChange={(mut) => set((s) => mut(s.landlord))} />
      <div className={secTitleCls}>{t("adminDocs.constructor.party.landlordContacts")}</div>
      {landlordContacts && (
        <div className="mb-1.5 flex gap-1.5">
          <button type="button" title={contactHint(landlordContacts.owner)} onClick={() => applyContacts(landlordContacts.owner)} className={contactBtn(sameAs(landlordContacts.owner))}>{t("adminDocs.constructor.party.contactOwner")}</button>
          <button type="button" title={contactHint(landlordContacts.admin)} onClick={() => applyContacts(landlordContacts.admin)} className={contactBtn(sameAs(landlordContacts.admin))}>{t("adminDocs.constructor.party.contactAdmin")}</button>
        </div>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.party.phone")}</label><input className={inputCls} value={ll.phone ?? ""} onChange={(e) => set((s) => { s.landlord.phone = e.target.value })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.party.email")}</label><input className={inputCls} value={ll.email ?? ""} onChange={(e) => set((s) => { s.landlord.email = e.target.value })} /></div>
      </div>
      <PartyForm p={state.tenant} role={t("adminDocs.constructor.party.tenant")} onChange={(mut) => set((s) => mut(s.tenant))} />
      <div className={secTitleCls}>{t("adminDocs.constructor.party.tenantContacts")}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.party.phone")}</label><input className={inputCls} value={state.tenant.phone ?? ""} onChange={(e) => set((s) => { s.tenant.phone = e.target.value })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.party.email")}</label><input className={inputCls} value={state.tenant.email ?? ""} onChange={(e) => set((s) => { s.tenant.email = e.target.value })} /></div>
      </div>
    </>
  )
}

function PremisesStep({ state, set, autoNumber, onSetAutoNumber, availableTypes }: { state: ContractState; set: (m: Mutator) => void; autoNumber: boolean; onSetAutoNumber: (v: boolean) => void; availableTypes: ContractPlacementType[] }) {
  const { t } = useT()
  return (
    <>
      <div className={secTitleCls}>{t("adminDocs.constructor.premises.sectionContract")}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t("adminDocs.constructor.premises.number")} {autoNumber && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">{t("adminDocs.constructor.premises.auto")}</span>}</label>
          <div className="flex gap-1.5">
            <input className={`${inputCls} disabled:opacity-60`} placeholder={t("adminDocs.constructor.egAmount", { value: "001" })} value={state.meta.contractNumber} disabled={autoNumber} onChange={(e) => set((s) => { s.meta.contractNumber = e.target.value })} />
            <button type="button" onClick={() => onSetAutoNumber(!autoNumber)} title={autoNumber ? t("adminDocs.constructor.premises.manualTitle") : t("adminDocs.constructor.premises.autoTitle")} className="shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">
              {autoNumber ? t("adminDocs.constructor.premises.btnManual") : t("adminDocs.constructor.premises.btnAuto")}
            </button>
          </div>
        </div>
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.date")}</label><input type="date" className={inputCls} value={state.meta.contractDate} onChange={(e) => set((s) => { s.meta.contractDate = e.target.value })} /></div>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.start")}</label><input type="date" className={inputCls} value={state.term.startDate} onChange={(e) => set((s) => { s.term.startDate = e.target.value })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.end")}</label><input type="date" className={inputCls} value={state.term.endDate} onChange={(e) => set((s) => { s.term.endDate = e.target.value })} /></div>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.city")}</label><input className={inputCls} value={state.meta.city} onChange={(e) => set((s) => { s.meta.city = e.target.value })} /></div>
        <div>
          <label className={labelCls}>{t("adminDocs.constructor.premises.type")}</label>
          <select
            className={inputCls}
            value={state.meta.placementType ?? "PREMISES"}
            onChange={(e) => { const v = e.target.value; set((s) => { if (isContractPlacementType(v)) applyContractTypePreset(s, v) }) }}
            title={t("adminDocs.constructor.premises.typeHint")}
          >
            {/* Названия типов договора — терминология предмета аренды из
                lib/contract-placement-types.ts: те же слова стоят в подзаголовке
                договора и Акта, поэтому остаются русскими.
                в документ — переводит юрист */}
            {CONTRACT_PLACEMENT_TYPES.filter((row) => availableTypes.includes(row.key)).map((row) => (
              <option key={row.key} value={row.key}>{row.label}</option>
            ))}
          </select>
        </div>
      </div>
      {placementFamily(state) ? <PlacementFields state={state} set={set} /> : (<>
      <div className={secTitleCls}>{t("adminDocs.constructor.premises.section")}</div>
      <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.premises.buildingAddress")}</label><input className={inputCls} value={state.premises.buildingAddress} onChange={(e) => set((s) => { s.premises.buildingAddress = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.placement")}</label><input className={inputCls} value={state.premises.placement} onChange={(e) => set((s) => { s.premises.placement = e.target.value })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.premises.area")}</label><input type="number" className={inputCls} value={state.premises.spaceAreaSqm || ""} onChange={(e) => set((s) => { s.premises.spaceAreaSqm = Number(e.target.value) })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.premises.purpose")}</label><input className={inputCls} value={state.premises.purposeUse} onChange={(e) => set((s) => { s.premises.purposeUse = e.target.value })} /></div>
      <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.premises.buildingArea")} <span className="text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.premises.buildingAreaNote")}</span></label><input type="number" className={inputCls} value={state.building.totalRentableAreaSqm || ""} onChange={(e) => set((s) => { s.building.totalRentableAreaSqm = Number(e.target.value) })} /></div>
      <ToggleRow
        on={state.modules.asIsAcceptanceEnabled === true}
        title={t("adminDocs.constructor.premises.asIs")}
        hint={t("adminDocs.constructor.premises.asIsHint")}
        onToggle={() => set((s) => { s.modules.asIsAcceptanceEnabled = s.modules.asIsAcceptanceEnabled !== true })}
      />
      </>)}
    </>
  )
}

// "YYYY-MM" + n месяцев → "YYYY-MM" (для автоподстановки следующей ступени).
function plusMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number)
  const months = y * 12 + (m - 1) + n
  return `${Math.floor(months / 12)}-${String((months % 12) + 1).padStart(2, "0")}`
}

// База «плата в месяц» следует за первой ступенью графика (клоз депозита и
// синк в карточку при подписании опираются на monthlyRent).
function syncBaseRent(s: ContractState) {
  const v = validRentSteps(s.financials.rentSteps)
  if (v.length) s.financials.monthlyRent = v[0].amount
}

function FinancialStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const { t, locale } = useT()
  const f = state.financials
  const op = f.operatingCosts
  const stepsOn = (f.rentSteps?.length ?? 0) > 0
  const debt = f.debtSettlement
  return (
    <>
      <div className={secTitleCls}>{t("adminDocs.constructor.money.section")}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t("adminDocs.constructor.money.monthly")} {stepsOn && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">{t("adminDocs.constructor.money.fromFirstStep")}</span>}</label>
          <input type="number" className={`${inputCls} disabled:opacity-60`} disabled={stepsOn} value={f.monthlyRent || ""} onChange={(e) => set((s) => { s.financials.monthlyRent = Number(e.target.value) })} />
        </div>
        <div><label className={labelCls}>{t("adminDocs.constructor.money.dueDay")}</label><input type="number" className={inputCls} value={f.paymentDueDay} onChange={(e) => set((s) => { s.financials.paymentDueDay = Number(e.target.value) })} /></div>
      </div>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.vatIncluded} onChange={(e) => set((s) => { s.financials.vatIncluded = e.target.checked })} /> {t("adminDocs.constructor.money.vat")}</label>

      <ToggleRow
        on={stepsOn}
        title={t("adminDocs.constructor.money.stepsTitle")}
        hint={t("adminDocs.constructor.money.stepsHint")}
        onToggle={() => set((s) => {
          if ((s.financials.rentSteps?.length ?? 0) > 0) { s.financials.rentSteps = [] } else {
            const startYm = (s.term.startDate || s.meta.contractDate || "").slice(0, 7)
            const first = /^\d{4}-\d{2}$/.test(startYm) ? startYm : ""
            s.financials.rentSteps = [
              { from: first, amount: s.financials.monthlyRent || 0 },
              { from: first ? plusMonths(first, 12) : "", amount: 0 },
            ]
          }
        })}
      />
      {stepsOn && (
        <div className="mb-2 space-y-1.5">
          {(f.rentSteps ?? []).map((st, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
              <div><label className={labelCls}>{t("adminDocs.constructor.money.stepFrom", { n: i + 1 })}</label><input type="month" className={inputCls} value={st.from} onChange={(e) => set((s) => { s.financials.rentSteps![i].from = e.target.value; syncBaseRent(s) })} /></div>
              <div><label className={labelCls}>{t("adminDocs.constructor.money.stepAmount")}</label><input type="number" className={inputCls} value={st.amount || ""} onChange={(e) => set((s) => { s.financials.rentSteps![i].amount = Number(e.target.value); syncBaseRent(s) })} /></div>
              <button
                type="button"
                title={t("adminDocs.constructor.money.stepRemove")}
                disabled={(f.rentSteps?.length ?? 0) <= 2}
                onClick={() => set((s) => { s.financials.rentSteps!.splice(i, 1); syncBaseRent(s) })}
                className="rounded-md border border-slate-200 px-2.5 py-2 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set((s) => {
              const steps = s.financials.rentSteps ?? (s.financials.rentSteps = [])
              const last = steps[steps.length - 1]
              steps.push({ from: last && /^\d{4}-\d{2}$/.test(last.from) ? plusMonths(last.from, 12) : "", amount: 0 })
            })}
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
          >{t("adminDocs.constructor.money.stepAdd")}</button>
        </div>
      )}

      {!placementFamily(state) && (<>
      <div className={secTitleCls}>{t("adminDocs.constructor.money.presetSection")}</div>
      <div className="grid gap-2">
        {PRESETS.map((pr) => (
          <button key={pr.key} onClick={() => set(pr.apply)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-blue-500/50">
            <b className="block text-[13px] text-slate-900 dark:text-slate-100">{t(`adminDocs.constructor.money.presets.${pr.key}.title` as TextKey<Messages>)}</b>
            <small className="text-[11.5px] text-slate-500 dark:text-slate-400">{t(`adminDocs.constructor.money.presets.${pr.key}.hint` as TextKey<Messages>)}</small>
          </button>
        ))}
      </div>

      <div className={secTitleCls}>{t("adminDocs.constructor.money.utilitiesSection")}</div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        {UTILITY_ORDER.map((k: UtilityKey) => (
          <div key={k} className="grid grid-cols-[1fr_1.4fr] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-800">
            {/* Названия ресурсов берём из lib/contract-engine: этими же словами
                они перечислены в пунктах договора, поэтому остаются русскими.
                в документ — переводит юрист */}
            <span className="text-[12.5px] text-slate-700 dark:text-slate-300">{UTILITY_LABELS[k]}</span>
            <select className={inputCls} value={f.premisesUtilities[k]} onChange={(e) => set((s) => { s.financials.premisesUtilities[k] = e.target.value as UtilityMode })}>
              {UTILITY_MODES.map((m) => <option key={m.v} value={m.v}>{t(`adminDocs.constructor.money.modes.${m.labelKey}` as TextKey<Messages>)}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className={secTitleCls}>{t("adminDocs.constructor.money.operatingSection")}</div>
      <select className={`${inputCls} mb-2`} value={op.method} onChange={(e) => set((s) => { s.financials.operatingCosts.method = e.target.value as OperatingMethod })}>
        <option value="none">{t("adminDocs.constructor.money.opNone")}</option>
        <option value="fixed_per_sqm">{t("adminDocs.constructor.money.opFixed")}</option>
        <option value="pooled_prorata">{t("adminDocs.constructor.money.opPooled")}</option>
      </select>
      {op.method !== "none" && (
        <select className={`${inputCls} mb-2`} value={op.scope} onChange={(e) => set((s) => { s.financials.operatingCosts.scope = e.target.value as "common_area" | "all_inclusive" })}>
          <option value="common_area">{t("adminDocs.constructor.money.scopeCommon")}</option>
          <option value="all_inclusive">{t("adminDocs.constructor.money.scopeAll")}</option>
        </select>
      )}
      {op.method === "fixed_per_sqm" && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>{t("adminDocs.constructor.money.winterRate")}</label><input type="number" className={inputCls} value={op.fixed?.winterRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: Number(e.target.value), summerRate: op.fixed?.summerRate ?? 0 } })} /></div>
          <div><label className={labelCls}>{t("adminDocs.constructor.money.summerRate")}</label><input type="number" className={inputCls} value={op.fixed?.summerRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: op.fixed?.winterRate ?? 0, summerRate: Number(e.target.value) } })} /></div>
        </div>
      )}
      {op.method === "pooled_prorata" && (
        <div><label className={labelCls}>{t("adminDocs.constructor.money.advanceRate")}</label><input type="number" className={inputCls} value={op.pooled?.estimatedRatePerSqm || ""} onChange={(e) => set((s) => { if (s.financials.operatingCosts.pooled) s.financials.operatingCosts.pooled.estimatedRatePerSqm = Number(e.target.value) })} /></div>
      )}
      </>)}

      <div className={secTitleCls}>{t("adminDocs.constructor.money.depositSection")}</div>
      <ToggleRow on={f.deposit.enabled} title={t("adminDocs.constructor.money.depositTitle")} hint={t("adminDocs.constructor.money.depositHint")} onToggle={() => set((s) => { s.financials.deposit.enabled = !s.financials.deposit.enabled })} />
      {f.deposit.enabled && (
        <>
          <div className="mb-1"><label className={labelCls}>{t("adminDocs.constructor.money.amount")}</label><input type="number" className={inputCls} value={f.deposit.amount || ""} onChange={(e) => set((s) => { s.financials.deposit.amount = Number(e.target.value) })} /></div>
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.deposit.installmentAllowed} onChange={(e) => set((s) => { s.financials.deposit.installmentAllowed = e.target.checked })} /> {t("adminDocs.constructor.money.depositInstallment")}</label>
        </>
      )}

      <div className={secTitleCls}>{t("adminDocs.constructor.money.debtSection")}</div>
      <ToggleRow
        on={debt?.enabled === true}
        title={t("adminDocs.constructor.money.debtTitle")}
        hint={t("adminDocs.constructor.money.debtHint")}
        onToggle={() => set((s) => {
          const d = s.financials.debtSettlement ?? (s.financials.debtSettlement = { enabled: false, totalAmount: 0, basisDoc: "", discountPercent: 0, payWithinMonths: 2 })
          d.enabled = !d.enabled
        })}
      />
      {debt?.enabled === true && (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div><label className={labelCls}>{t("adminDocs.constructor.money.debtAmount")}</label><input type="number" className={inputCls} value={debt.totalAmount || ""} onChange={(e) => set((s) => { s.financials.debtSettlement!.totalAmount = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>{t("adminDocs.constructor.money.debtDiscount")}</label><input type="number" min="0" max="99" className={inputCls} value={debt.discountPercent || ""} onChange={(e) => set((s) => { s.financials.debtSettlement!.discountPercent = Number(e.target.value) })} /></div>
          </div>
          {/* Плейсхолдер — образец названия документа-основания, которое печатается в
              разделе о прошлой задолженности. в документ — переводит юрист */}
          <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.money.debtBasis")}</label><input className={inputCls} placeholder="Акт сверки взаимных расчётов № __ от __.__.____ г." value={debt.basisDoc} onChange={(e) => set((s) => { s.financials.debtSettlement!.basisDoc = e.target.value })} /></div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div><label className={labelCls}>{t("adminDocs.constructor.money.debtMonths")}</label><input type="number" min="1" max="36" className={inputCls} value={debt.payWithinMonths || ""} onChange={(e) => set((s) => { s.financials.debtSettlement!.payWithinMonths = Number(e.target.value) })} /></div>
            <div>
              <label className={labelCls}>{t("adminDocs.constructor.money.debtRemainder")}</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-100">
                {debt.totalAmount > 0 ? formatMoneyL(locale, debtRemainder(debt)) : "—"}
              </div>
            </div>
          </div>
          {debt.discountPercent > 0 && (
            <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.money.debtDiscountNote")}</p>
          )}
        </>
      )}

      <div className={secTitleCls}>{t("adminDocs.constructor.money.penaltySection")}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.money.penaltyTenant")}</label><input type="number" step="0.1" min="0" className={inputCls} value={f.penalty.tenantPerDay} onChange={(e) => set((s) => { s.financials.penalty.tenantPerDay = Number(e.target.value) })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.money.penaltyLandlord")}</label><input type="number" step="0.1" min="0" className={inputCls} value={f.penalty.landlordPerDay} onChange={(e) => set((s) => { s.financials.penalty.landlordPerDay = Number(e.target.value) })} /></div>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.money.penaltyTenantCap")}</label><input type="number" step="1" min="0" className={inputCls} value={f.penalty.tenantCapPercent} onChange={(e) => set((s) => { s.financials.penalty.tenantCapPercent = Number(e.target.value) })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.money.penaltyLandlordCap")}</label><input type="number" step="1" min="0" className={inputCls} value={f.penalty.landlordCapPercent} onChange={(e) => set((s) => { s.financials.penalty.landlordCapPercent = Number(e.target.value) })} /></div>
      </div>
      <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.money.penaltyNote")}</p>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.indexation.enabled} onChange={(e) => set((s) => { s.financials.indexation.enabled = e.target.checked })} /> {t("adminDocs.constructor.money.indexation")}</label>
    </>
  )
}

function AnnexesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const { t } = useT()
  const sv = state.financials.additionalServices
  // Режим уборки: фикс ₸/мес или ставка за м². Инициализируем по тому, что заполнено.
  const [cleaningMode, setCleaningMode] = useState<"fixed" | "sqm">(sv.premisesCleaning.ratePerSqm ? "sqm" : "fixed")
  if (placementFamily(state)) return <PlacementAnnexesStep state={state} set={set} />
  return (
    <>
      <div className={secTitleCls}>{t("adminDocs.constructor.annexes.modulesSection")}</div>
      <ToggleRow on={state.modules.actEnabled} title={t("adminDocs.constructor.annexes.act")} hint={t("adminDocs.constructor.annexes.actHint")} onToggle={() => set((s) => { s.modules.actEnabled = !s.modules.actEnabled })} />
      {state.modules.actEnabled && state.modules.asIsAcceptanceEnabled === true && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 my-1 space-y-2 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("adminDocs.constructor.annexes.asIsNote")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([
              ["meterElectricity", "electricity"], ["meterColdWater", "coldWater"],
              ["meterHotWater", "hotWater"],
            ] as [keyof HandoverAct, string][]).map(([key, labelKey]) => (
              <label key={key} className="block">
                <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t(`adminDocs.constructor.annexes.meters.${labelKey}` as TextKey<Messages>)}</span>
                <input className={inputCls} value={state.handoverAct[key]} onChange={(e) => set((s) => { s.handoverAct[key] = e.target.value })} placeholder="—" />
              </label>
            ))}
          </div>
        </div>
      )}
      {state.modules.actEnabled && state.modules.asIsAcceptanceEnabled !== true && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 my-1 space-y-2 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.annexes.conditionNote")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["conditionWalls", "walls"], ["conditionFloor", "floor"], ["conditionCeiling", "ceiling"],
              ["conditionWindowsDoors", "windows"], ["conditionElectrical", "electrical"],
              ["conditionPlumbing", "plumbing"],
            ] as [keyof HandoverAct, string][]).map(([key, labelKey]) => {
              const cur = state.handoverAct[key] ?? ""
              return (
                <label key={key} className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t(`adminDocs.constructor.annexes.conditions.${labelKey}` as TextKey<Messages>)}</span>
                  <select className={inputCls} value={cur} onChange={(e) => set((s) => { s.handoverAct[key] = e.target.value })}>
                    <option value="">{t("adminDocs.constructor.annexes.conditionEmpty")}</option>
                    {/* Сами значения печатаются в Акте, поэтому остаются русскими.
                        в документ — переводит юрист */}
                    {CONDITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    {cur && !CONDITION_OPTIONS.includes(cur) && <option value={cur}>{t("adminDocs.constructor.annexes.conditionCustom", { value: cur })}</option>}
                  </select>
                </label>
              )
            })}
            <label className="block sm:col-span-2">
              <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.annexes.conditions.other")}</span>
              <input className={inputCls} value={state.handoverAct.conditionOther} onChange={(e) => set((s) => { s.handoverAct.conditionOther = e.target.value })} placeholder={t("adminDocs.constructor.annexes.conditionOtherPlaceholder")} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["meterElectricity", "electricity"], ["meterColdWater", "coldWater"],
              ["meterHotWater", "hotWater"], ["keysCount", "keys"],
            ] as [keyof HandoverAct, string][]).map(([key, labelKey]) => (
              <label key={key} className="block">
                <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t(`adminDocs.constructor.annexes.meters.${labelKey}` as TextKey<Messages>)}</span>
                <input className={inputCls} value={state.handoverAct[key]} onChange={(e) => set((s) => { s.handoverAct[key] = e.target.value })} placeholder="—" />
              </label>
            ))}
          </div>
        </div>
      )}
      <ToggleRow on={state.modules.insuranceEnabled} title={t("adminDocs.constructor.annexes.insurance")} hint={t("adminDocs.constructor.annexes.insuranceHint")} onToggle={() => set((s) => { s.modules.insuranceEnabled = !s.modules.insuranceEnabled })} />
      <ToggleRow on={state.modules.signageEnabled} title={t("adminDocs.constructor.annexes.signage")} onToggle={() => set((s) => { s.modules.signageEnabled = !s.modules.signageEnabled })} />
      <ToggleRow on={state.modules.confidentialityEnabled !== false} title={t("adminDocs.constructor.annexes.confidentiality")} hint={t("adminDocs.constructor.annexes.confidentialityHint")} onToggle={() => set((s) => { s.modules.confidentialityEnabled = s.modules.confidentialityEnabled === false })} />
      <ToggleRow on={state.modules.tenantExitOnUnusableEnabled === true} title={t("adminDocs.constructor.annexes.tenantExit")} hint={t("adminDocs.constructor.annexes.tenantExitHint")} onToggle={() => set((s) => { s.modules.tenantExitOnUnusableEnabled = !(s.modules.tenantExitOnUnusableEnabled === true) })} />
      <div className={secTitleCls}>{t("adminDocs.constructor.annexes.servicesSection")}</div>

      <ToggleRow on={sv.premisesCleaning.ordered} title={t("adminDocs.constructor.annexes.cleaning")} onToggle={() => set((s) => { s.financials.additionalServices.premisesCleaning.ordered = !sv.premisesCleaning.ordered })} />
      {sv.premisesCleaning.ordered && (
        <div className="mb-2 -mt-0.5 space-y-1.5 pl-1">
          <Seg
            value={cleaningMode}
            options={[{ v: "fixed", label: t("adminDocs.constructor.annexes.modeFixed") }, { v: "sqm", label: t("adminDocs.constructor.annexes.modeSqm") }]}
            onChange={(m) => {
              setCleaningMode(m)
              set((s) => {
                const c = s.financials.additionalServices.premisesCleaning
                if (m === "fixed") c.ratePerSqm = 0
                else c.monthly = 0
              })
            }}
          />
          {cleaningMode === "fixed" ? (
            <div>
              <label className={labelCls}>{t("adminDocs.constructor.annexes.cleaningMonthly")}</label>
              <input type="number" min="0" step="1000" className={inputCls} value={sv.premisesCleaning.monthly || ""} placeholder={t("adminDocs.constructor.egAmount", { value: 30000 })}
                onChange={(e) => set((s) => { s.financials.additionalServices.premisesCleaning.monthly = Number(e.target.value) || 0 })} />
            </div>
          ) : (
            <div>
              <label className={labelCls}>{t("adminDocs.constructor.annexes.cleaningPerSqm")}</label>
              <input type="number" min="0" step="50" className={inputCls} value={sv.premisesCleaning.ratePerSqm || ""} placeholder={t("adminDocs.constructor.egAmount", { value: 300 })}
                onChange={(e) => set((s) => { s.financials.additionalServices.premisesCleaning.ratePerSqm = Number(e.target.value) || 0 })} />
              {(sv.premisesCleaning.ratePerSqm ?? 0) > 0 && state.premises.spaceAreaSqm > 0 && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {t("adminDocs.constructor.annexes.cleaningApprox", { sum: money(Math.round((sv.premisesCleaning.ratePerSqm ?? 0) * state.premises.spaceAreaSqm)), area: state.premises.spaceAreaSqm })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <ToggleRow on={sv.internet.ordered} title={t("adminDocs.constructor.annexes.internet")} onToggle={() => set((s) => { s.financials.additionalServices.internet.ordered = !sv.internet.ordered })} />
      {sv.internet.ordered && (
        <div className="mb-2 -mt-0.5 pl-1">
          <label className={labelCls}>{t("adminDocs.constructor.annexes.internetMonthly")}</label>
          <input type="number" min="0" step="1000" className={inputCls} value={sv.internet.monthly || ""} placeholder={t("adminDocs.constructor.egAmount", { value: 10000 })}
            onChange={(e) => set((s) => { s.financials.additionalServices.internet.monthly = Number(e.target.value) || 0 })} />
        </div>
      )}

      <ToggleRow on={sv.phone.ordered} title={t("adminDocs.constructor.annexes.phone")} onToggle={() => set((s) => { s.financials.additionalServices.phone.ordered = !sv.phone.ordered })} />
      {sv.phone.ordered && (
        <div className="mb-2 -mt-0.5 pl-1">
          <label className={labelCls}>{t("adminDocs.constructor.annexes.phoneMonthly")}</label>
          <input type="number" min="0" step="500" className={inputCls} value={sv.phone.monthly || ""} placeholder={t("adminDocs.constructor.annexes.byOperator")}
            onChange={(e) => set((s) => { s.financials.additionalServices.phone.monthly = Number(e.target.value) || 0 })} />
        </div>
      )}

      <ToggleRow on={sv.premisesSecurity.ordered} title={t("adminDocs.constructor.annexes.security")} onToggle={() => set((s) => { s.financials.additionalServices.premisesSecurity.ordered = !sv.premisesSecurity.ordered })} />
      {sv.premisesSecurity.ordered && (
        <div className="mb-2 -mt-0.5 pl-1">
          <label className={labelCls}>{t("adminDocs.constructor.annexes.securityMonthly")}</label>
          <input type="number" min="0" step="1000" className={inputCls} value={sv.premisesSecurity.monthly || ""} placeholder={t("adminDocs.constructor.egAmount", { value: 25000 })}
            onChange={(e) => set((s) => { s.financials.additionalServices.premisesSecurity.monthly = Number(e.target.value) || 0 })} />
        </div>
      )}
    </>
  )
}

// ───────────────────────── договор на размещение ─────────────────────────

const ELECTRICITY_OPTIONS: { v: PlacementElectricity; labelKey: "elMeter" | "elFixed" | "elNone" }[] = [
  { v: "meter", labelKey: "elMeter" },
  { v: "fixed", labelKey: "elFixed" },
  { v: "none", labelKey: "elNone" },
]

/** Поля места для договора на размещение (оборудование / территория). */
function PlacementFields({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const { t } = useT()
  // Условия места держим в pl: имя t занято переводчиком.
  const pl = state.placement!
  const eq = pl.family === "equipment"
  const up = (mut: (p: PlacementTerms) => void) => set((s) => { if (s.placement) mut(s.placement) })
  const upRow = (i: number, mut: (e: PlacedEquipment) => void) => up((p) => { mut(p.equipment[i]) })
  return (
    <>
      <div className={secTitleCls}>{eq ? t("adminDocs.constructor.placement.titleEquipment") : t("adminDocs.constructor.placement.titleTerritory")}</div>
      <div className="mb-2"><label className={labelCls}>{eq ? t("adminDocs.constructor.placement.addressBuilding") : t("adminDocs.constructor.placement.addressLand")}</label><input className={inputCls} value={state.premises.buildingAddress} onChange={(e) => set((s) => { s.premises.buildingAddress = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-[1fr_8rem] gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.placement.where")}</label><input className={inputCls} placeholder={eq ? t("adminDocs.constructor.placement.whereEqPlaceholder") : t("adminDocs.constructor.placement.whereTerrPlaceholder")} value={pl.placeDescription} onChange={(e) => up((p) => { p.placeDescription = e.target.value })} /></div>
        <div><label className={labelCls}>{t("adminDocs.constructor.placement.area")}</label><input type="number" step="0.1" min="0" className={inputCls} value={pl.placeAreaSqm || ""} onChange={(e) => up((p) => { p.placeAreaSqm = Number(e.target.value) || 0 })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.placement.purpose")}</label><input className={inputCls} value={state.premises.purposeUse} onChange={(e) => set((s) => { s.premises.purposeUse = e.target.value })} /></div>
      {!eq && (
        <div className="mb-2 grid grid-cols-[1fr_11rem] gap-2">
          {/* Плейсхолдер — образец названия правоустанавливающего документа, который
              печатается в предмете договора. в документ — переводит юрист */}
          <div><label className={labelCls}>{t("adminDocs.constructor.placement.landDocument")}</label><input className={inputCls} placeholder="акт на право частной собственности № ___ от ___" value={pl.landDocument} onChange={(e) => up((p) => { p.landDocument = e.target.value })} /></div>
          <div><label className={labelCls}>{t("adminDocs.constructor.placement.cadastral")}</label><input className={inputCls} value={pl.cadastralNumber} onChange={(e) => up((p) => { p.cadastralNumber = e.target.value })} /></div>
        </div>
      )}
      <div className="mb-2"><label className={labelCls}>{t("adminDocs.constructor.placement.access")}</label><input className={inputCls} value={pl.accessHours} onChange={(e) => up((p) => { p.accessHours = e.target.value })} /></div>

      <div className={secTitleCls}>{t("adminDocs.constructor.placement.electricitySection")}</div>
      <div className="mb-2"><Seg value={pl.electricity} options={ELECTRICITY_OPTIONS.map((o) => ({ v: o.v, label: t(`adminDocs.constructor.placement.${o.labelKey}` as TextKey<Messages>) }))} onChange={(v) => up((p) => { p.electricity = v })} /></div>
      {pl.electricity !== "none" && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {pl.electricity === "meter" && (
            <div><label className={labelCls}>{t("adminDocs.constructor.placement.tariff")}</label><input type="number" min="0" step="0.01" className={inputCls} placeholder={t("adminDocs.constructor.placement.tariffPlaceholder")} value={pl.electricityTariff || ""} onChange={(e) => up((p) => { p.electricityTariff = Number(e.target.value) || 0 })} /></div>
          )}
          {pl.electricity === "fixed" && (
            <div><label className={labelCls}>{t("adminDocs.constructor.placement.fixedMonthly")}</label><input type="number" min="0" className={inputCls} value={pl.electricityFixed || ""} onChange={(e) => up((p) => { p.electricityFixed = Number(e.target.value) || 0 })} /></div>
          )}
          <div><label className={labelCls}>{t("adminDocs.constructor.placement.powerLimit")}</label><input type="number" step="0.1" min="0" className={inputCls} value={pl.powerLimitKw || ""} onChange={(e) => up((p) => { p.powerLimitKw = Number(e.target.value) || 0 })} /></div>
          <div className="col-span-2"><label className={labelCls}>{t("adminDocs.constructor.placement.connectionPoint")}</label><input className={inputCls} placeholder={t("adminDocs.constructor.placement.connectionPlaceholder")} value={pl.connectionPoint} onChange={(e) => up((p) => { p.connectionPoint = e.target.value })} /></div>
        </div>
      )}

      <div className={secTitleCls}>{t("adminDocs.constructor.money.operatingSection")}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("adminDocs.constructor.placement.feeRate")}</label><input type="number" min="0" className={inputCls} placeholder={t("adminDocs.constructor.placement.feeNone")} value={pl.serviceFeePerSqm || ""} onChange={(e) => up((p) => { p.serviceFeePerSqm = Number(e.target.value) || 0 })} /></div>
        <div>
          <label className={labelCls}>{t("adminDocs.constructor.placement.perMonth")}</label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-100">
            {(pl.serviceFeePerSqm ?? 0) > 0 && pl.placeAreaSqm > 0 ? money(Math.round((pl.serviceFeePerSqm ?? 0) * pl.placeAreaSqm)) : "—"}
          </div>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.placement.feeNote")}</p>

      <div className={secTitleCls}>{eq ? t("adminDocs.constructor.placement.equipment") : t("adminDocs.constructor.placement.object")}</div>
      <div className="space-y-2">
        {pl.equipment.map((e, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <div className="mb-1.5 grid grid-cols-[1fr_4rem_auto] gap-1.5">
              <input className={inputCls} placeholder={eq ? t("adminDocs.constructor.placement.eqNamePlaceholder") : t("adminDocs.constructor.placement.objNamePlaceholder")} value={e.name} onChange={(ev) => upRow(i, (x) => { x.name = ev.target.value })} />
              <input type="number" min="1" className={inputCls} title={t("adminDocs.constructor.placement.qty")} value={e.qty || ""} onChange={(ev) => upRow(i, (x) => { x.qty = Number(ev.target.value) || 0 })} />
              <button type="button" onClick={() => up((p) => { p.equipment.splice(i, 1) })} className="rounded-md border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800" title={t("adminDocs.constructor.placement.remove")}>×</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <input className={inputCls} placeholder={t("adminDocs.constructor.placement.model")} value={e.model} onChange={(ev) => upRow(i, (x) => { x.model = ev.target.value })} />
              <input className={inputCls} placeholder={t("adminDocs.constructor.placement.serial")} value={e.serial} onChange={(ev) => upRow(i, (x) => { x.serial = ev.target.value })} />
              <input className={inputCls} placeholder={t("adminDocs.constructor.placement.size")} value={e.size} onChange={(ev) => upRow(i, (x) => { x.size = ev.target.value })} />
              <input type="number" step="0.1" min="0" className={inputCls} placeholder={t("adminDocs.constructor.placement.kw")} value={e.powerKw || ""} onChange={(ev) => upRow(i, (x) => { x.powerKw = Number(ev.target.value) || 0 })} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => up((p) => { p.equipment.push({ name: "", model: "", serial: "", qty: 1, size: "", powerKw: 0 }) })} className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400">
          + {eq ? t("adminDocs.constructor.placement.addEquipment") : t("adminDocs.constructor.placement.addObject")}
        </button>
      </div>
    </>
  )
}

/** Приложения договора на размещение: Акт (состояние места, показания) и Схема. */
function PlacementAnnexesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const { t } = useT()
  // Условия места держим в pl: имя t занято переводчиком.
  const pl = state.placement!
  const up = (mut: (p: PlacementTerms) => void) => set((s) => { if (s.placement) mut(s.placement) })
  return (
    <>
      <div className={secTitleCls}>{t("adminDocs.constructor.placement.annexesSection")}</div>
      <ToggleRow on={state.modules.actEnabled} title={t("adminDocs.constructor.placement.act")} hint={t("adminDocs.constructor.placement.actHint")} onToggle={() => set((s) => { s.modules.actEnabled = !s.modules.actEnabled })} />
      {state.modules.actEnabled && (
        <div className="my-1 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.placement.placeCondition")}</span>
            <input className={inputCls} placeholder={pl.family === "equipment" ? t("adminDocs.constructor.placement.condEqPlaceholder") : t("adminDocs.constructor.placement.condTerrPlaceholder")} value={pl.placeCondition} onChange={(e) => up((p) => { p.placeCondition = e.target.value })} />
          </label>
          {pl.electricity === "meter" && (
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t("adminDocs.constructor.placement.meterReading")}</span>
              <input className={inputCls} value={state.handoverAct.meterElectricity} onChange={(e) => set((s) => { s.handoverAct.meterElectricity = e.target.value })} placeholder="—" />
            </label>
          )}
        </div>
      )}
      <ToggleRow on={pl.schemeEnabled} title={t("adminDocs.constructor.placement.scheme")} hint={t("adminDocs.constructor.placement.schemeHint")} onToggle={() => up((p) => { p.schemeEnabled = !p.schemeEnabled })} />
      <div className={secTitleCls}>{t("adminDocs.constructor.annexes.modulesSection")}</div>
      <ToggleRow on={state.modules.insuranceEnabled} title={t("adminDocs.constructor.placement.liability")} hint={t("adminDocs.constructor.placement.liabilityHint")} onToggle={() => set((s) => { s.modules.insuranceEnabled = !s.modules.insuranceEnabled })} />
      <ToggleRow on={state.modules.confidentialityEnabled !== false} title={t("adminDocs.constructor.annexes.confidentiality")} onToggle={() => set((s) => { s.modules.confidentialityEnabled = s.modules.confidentialityEnabled === false })} />
    </>
  )
}

// ───────────────────────── preview ─────────────────────────
//
// Ниже — предпросмотр самого договора и приложений. Его текст не переводится:
// это тот документ, что уходит арендатору (docs/i18n-documents-plan.md).
// Переведены только подсказки интерфейса («нажмите, чтобы изменить»).
// в документ — переводит юрист

const docTitleCls = "text-center text-base font-bold text-slate-900 dark:text-slate-100"
const docSubCls = "text-center text-slate-500 dark:text-slate-400"
const docTagCls = "text-right text-xs italic text-slate-400 dark:text-slate-500"
const annexTableCls = "w-full border-collapse text-xs [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700"

function ReqColumn({ role, party }: { role: string; party: Party }) {
  return (
    <div>
      <b className="text-slate-900 dark:text-slate-100">{role}:</b>
      <div className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">{partyRequisites(party)}</div>
    </div>
  )
}

// Какой шаг конструктора меняет пункт договора (по стабильному id пункта).
const STEP_BY_CLAUSE: [RegExp, number][] = [
  [/^cl_(rent|prepay|paymethod|indexation|invoice|not_included|sep_|service_fee|svc_|included_in_rent|electricity|other_utilities|deposit|penalty|debt|over_term|liability)/, 3],
  [/^cl_(utilities_clause)/, 3],
  [/^cl_(subject|term|prolongation|preferential|sale_notice|return_act|removal|unclaimed|asis)/, 2],
  [/^cl_/, 4],
]
function stepForClause(id: string): number {
  for (const [re, n] of STEP_BY_CLAUSE) if (re.test(id)) return n
  return 4
}
function ContractPreview({ state, onPick }: { state: ContractState; onPick?: (step: number) => void }) {
  const { t } = useT()
  const a = assemble(state)
  const pickCls = onPick ? "-mx-1.5 cursor-pointer rounded px-1.5 transition hover:bg-blue-50 dark:hover:bg-blue-500/10" : ""
  return (
    <div>
      <div className={`mb-1 ${docTitleCls}`}>ДОГОВОР № {state.meta.contractNumber || "____"}</div>
      <div className={`mb-3 ${docSubCls}`}>{contractSubtitle(state)}</div>
      <div className="mb-3 flex justify-between text-slate-600 dark:text-slate-400">
        <span>{state.meta.city}</span>
        <span>{dateLong(state.meta.contractDate)}</span>
      </div>
      <p
        className={`mb-4 text-justify text-slate-700 dark:text-slate-300 ${pickCls}`}
        onClick={onPick ? () => onPick(1) : undefined}
        title={onPick ? t("adminDocs.constructor.preview.editOnStep", { step: t("adminDocs.constructor.steps.s1.title") }) : undefined}
      >
        {partyIntro(state.landlord, "Арендодатель")}, с одной стороны, и {partyIntro(state.tenant, "Арендатор")}, с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:
      </p>
      {a.sections.map((sec) => (
        <div key={sec.num} className="mb-3">
          <div className="mb-1.5 mt-4 font-semibold text-slate-900 dark:text-slate-100">{sec.num}. {sec.title}</div>
          {sec.items.map((it) => (
            <div
              key={it.id}
              className={`mb-2 text-justify text-slate-700 dark:text-slate-300 ${pickCls}`}
              onClick={onPick ? () => onPick(stepForClause(it.id)) : undefined}
              title={onPick ? t("adminDocs.constructor.preview.editOnStep", { step: t(`adminDocs.constructor.steps.s${stepForClause(it.id)}.title` as TextKey<Messages>) }) : undefined}
            >
              <b className="text-slate-900 dark:text-slate-100">{it.num}.</b> {it.sub && <b>{it.sub} </b>}{it.html}
              {it.children.map((k) => (
                <div key={k.id} className="ml-5 mt-1 text-justify"><b className="text-slate-900 dark:text-slate-100">{k.num}.</b> {k.html}</div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="mb-2 mt-4 font-semibold text-slate-900 dark:text-slate-100">{a.requisitesNum}. Реквизиты и подписи Сторон</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReqColumn role="АРЕНДОДАТЕЛЬ" party={state.landlord} />
        <ReqColumn role="АРЕНДАТОР" party={state.tenant} />
      </div>
    </div>
  )
}

function Annex1Preview({ state, annexNo }: { state: ContractState; annexNo: number }) {
  const p = state.premises
  const h = state.handoverAct
  const asIs = state.modules.asIsAcceptanceEnabled === true
  const hasMeters = !!(h.meterElectricity?.trim() || h.meterColdWater?.trim() || h.meterHotWater?.trim())
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № {annexNo} к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
      <div className={docTitleCls}>АКТ</div>
      <div className={docSubCls}>{contractActSubtitle(state.meta.placementType)}</div>
      <p>{state.landlord.name || "Арендодатель"} (Арендодатель) и {state.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:</p>
      <p>1. Передано {isPremisesLikeType(state.meta.placementType) ? "нежилое помещение" : "место (Помещение)"} по адресу: {p.buildingAddress || "________"}{p.placement ? ", " + p.placement : ""}, общей площадью {p.spaceAreaSqm || "____"} кв. м.</p>
      {asIs ? (
        <>
          <p>2. Помещение находится в фактическом пользовании Арендатора; Арендатор ознакомлен с его действительным состоянием по результатам предшествующей эксплуатации, включая инженерные и отопительные системы и состояние отделки.</p>
          <p>3. Арендатор принимает Помещение в его текущем состоянии («как есть»), подтверждает его соответствие требованиям своей деятельности и не имеет каких-либо претензий по состоянию Помещения, в том числе по скрытым недостаткам.</p>
          {hasMeters && (
            <p>4. Показания счётчиков: электроэнергия {h.meterElectricity?.trim() || "______"} кВт·ч; холодная вода {h.meterColdWater?.trim() || "______"} куб. м; горячая вода {h.meterHotWater?.trim() || "______"} куб. м.</p>
          )}
        </>
      ) : (
        <>
          <p>2. Состояние помещения на момент передачи:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {([
              ["стены", h.conditionWalls], ["пол", h.conditionFloor],
              ["потолок", h.conditionCeiling], ["окна, двери", h.conditionWindowsDoors],
              ["электропроводка, освещение", h.conditionElectrical],
              ["сантехника, отопление", h.conditionPlumbing], ["иное", h.conditionOther],
            ] as [string, string][]).map(([k, v]) => <li key={k}>{k}: {v?.trim() ? v : "____________________"}</li>)}
          </ul>
          <p>3. Показания счётчиков: электроэнергия {h.meterElectricity?.trim() || "______"} кВт·ч; холодная вода {h.meterColdWater?.trim() || "______"} куб. м; горячая вода {h.meterHotWater?.trim() || "______"} куб. м.</p>
          <p>4. Передаваемые ключи: {h.keysCount?.trim() || "____"} комплектов.</p>
          <p>5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет.</p>
        </>
      )}
    </div>
  )
}

function Annex2Preview({ state, annexNo }: { state: ContractState; annexNo: number }) {
  const sv = state.financials.additionalServices
  const rows: [string, boolean, string][] = [
    ["Уборка внутри помещения", sv.premisesCleaning.ordered, sv.premisesCleaning.monthly ? `${money(sv.premisesCleaning.monthly)}/мес` : sv.premisesCleaning.ratePerSqm ? `${money(sv.premisesCleaning.ratePerSqm)} за кв. м/мес` : "____/мес"],
    ["Стационарный телефон", sv.phone.ordered, sv.phone.monthly ? `${money(sv.phone.monthly)}/мес` : "по тарифам оператора"],
    ["Интернет (Wi-Fi)", sv.internet.ordered, sv.internet.monthly ? `${money(sv.internet.monthly)}/мес` : "____/мес"],
    ["Охрана помещения", sv.premisesSecurity.ordered, sv.premisesSecurity.monthly ? `${money(sv.premisesSecurity.monthly)}/мес` : "____/мес"],
  ]
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № {annexNo} к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
      <div className={docTitleCls}>ЗАЯВЛЕНИЕ</div>
      <div className={docSubCls}>на дополнительные услуги</div>
      <p>Арендатор: {state.tenant.name || "________"}. Помещение: {state.premises.buildingAddress || "________"}, {state.premises.spaceAreaSqm || "____"} кв. м.</p>
      <table className={annexTableCls}>
        <thead><tr><th>№</th><th>Услуга</th><th>Тариф</th><th>Заказ</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r[0]}><td>{i + 1}</td><td>{r[0]}</td><td>{r[2]}</td><td className="text-center">{r[1] ? "✓" : "☐"}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function Annex3Preview({ state, annexNo }: { state: ContractState; annexNo: number }) {
  const op = state.financials.operatingCosts
  const a = assemble(state)
  const area = state.premises.spaceAreaSqm || 0
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № {annexNo} к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
      <div className={docTitleCls}>РАСЧЁТ</div>
      <div className={docSubCls}>эксплуатационных расходов</div>
      {op.method === "fixed_per_sqm" ? (
        <table className={annexTableCls}>
          <tbody>
            <tr><td>Площадь помещения</td><td>{area || "____"} кв. м</td></tr>
            <tr><td>Тариф (окт–апр)</td><td>{money(op.fixed?.winterRate ?? 0)} за кв. м/мес</td></tr>
            <tr><td>Тариф (май–сен)</td><td>{money(op.fixed?.summerRate ?? 0)} за кв. м/мес</td></tr>
            <tr><td>Расходы в месяц (зима)</td><td>{money((op.fixed?.winterRate ?? 0) * area)}</td></tr>
            <tr><td>Расходы в месяц (лето)</td><td>{money((op.fixed?.summerRate ?? 0) * area)}</td></tr>
          </tbody>
        </table>
      ) : (
        <>
          <p><b>Формула:</b> ЭР = (фактические расходы здания за период ÷ общая арендуемая площадь здания {state.building.totalRentableAreaSqm || "____"} кв. м) × площадь помещения {area || "____"} кв. м.</p>
          {op.pooled?.estimatedRatePerSqm ? <p>Авансовая ставка: {money(op.pooled.estimatedRatePerSqm)} за кв. м/мес, с последующим перерасчётом по факту.</p> : null}
        </>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">Покрывает: {a.ctx.covers.join("; ")}.</p>
    </div>
  )
}

function AnnexesPreview({ state }: { state: ContractState }) {
  const { t } = useT()
  if (placementFamily(state)) {
    return <div className="space-y-8"><PlacementAnnexesView state={state} /></div>
  }
  const c = assemble(state).ctx
  if (!c.annexes.act && !c.annexes.services && !c.annexes.operatingCosts) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">{t("adminDocs.constructor.preview.noAnnexes")}</p>
  }
  return (
    <div className="space-y-8">
      {c.annexes.act && <Annex1Preview state={state} annexNo={c.annexNumbers.act} />}
      {c.annexes.services && <Annex2Preview state={state} annexNo={c.annexNumbers.services} />}
      {c.annexes.operatingCosts && <Annex3Preview state={state} annexNo={c.annexNumbers.operatingCosts} />}
    </div>
  )
}
