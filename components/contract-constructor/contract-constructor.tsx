"use client"

import { useMemo, useState, useTransition, useEffect } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  FileSignature,
  Users,
  Building2,
  Wallet,
  PackageCheck,
  Save,
  Download,
  Lightbulb,
  AlertTriangle,
  Info,
  Sparkles,
  FilePlus2,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import {
  saveContractDraft,
  listContractDrafts,
  loadContractDraft,
  generateContractDocx,
  listConstructorTenants,
  prefillFromTenant,
  createContractFromBuilder,
  getNextContractNumber,
  type DraftListItem,
  type ConstructorTenant,
} from "@/app/actions/contract-builder"
import {
  defaultState,
  assemble,
  advise,
  applyAdvisorFix,
  UTILITY_ORDER,
  UTILITY_LABELS,
  money,
  partyIntro,
  partyRequisites,
  dateLong,
  type ContractState,
  type Party,
  type PartyType,
  type UtilityKey,
  type UtilityMode,
  type OperatingMethod,
} from "@/lib/contract-engine"

type Mutator = (s: ContractState) => void

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"
const cardCls = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"

const PARTY_TYPES: { v: PartyType; label: string }[] = [
  { v: "too", label: "ТОО" },
  { v: "ip", label: "ИП" },
  { v: "individual", label: "Физлицо" },
]
const BASIS_BY_TYPE: Record<PartyType, string> = {
  too: "Устава",
  ip: "Свидетельства/Уведомления о регистрации ИП",
  individual: "удостоверения личности",
}
const UTILITY_MODES: { v: UtilityMode; label: string }[] = [
  { v: "included", label: "в аренду" },
  { v: "metered_separate", label: "по счётчику" },
  { v: "in_operating_costs", label: "в экспл. расходы" },
]
const PRESETS: { key: string; title: string; hint: string; apply: Mutator }[] = [
  { key: "A", title: "A. Всё включено, свет по счётчику", hint: "Коммуналка в аренде, электроэнергия отдельно. Без сбора.", apply: (s) => { s.financials.premisesUtilities = { electricity: "metered_separate", coldWater: "included", hotWater: "included", heating: "included", sewerage: "included", garbage: "included" }; s.financials.operatingCosts.method = "none" } },
  { key: "B", title: "B. Раздельный учёт + сбор за МОП", hint: "Все ресурсы по счётчику, фиксированный сбор за общие зоны.", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "metered_separate"; s.financials.operatingCosts.method = "fixed_per_sqm"; s.financials.operatingCosts.scope = "common_area" } },
  { key: "C", title: "C. Котловой долевой расчёт", hint: "Расходы делятся на площадь здания. Без счётчиков.", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "in_operating_costs"; s.financials.operatingCosts.method = "pooled_prorata"; s.financials.operatingCosts.scope = "all_inclusive" } },
  { key: "D", title: "D. Всё включено в аренду", hint: "Вся коммуналка в плате. Риск роста тарифов на владельце.", apply: (s) => { for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "included"; s.financials.operatingCosts.method = "none" } },
]

const ADV_BOX: Record<string, string> = {
  warn: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
  suggest: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
}

export function ContractConstructor() {
  const [state, setState] = useState<ContractState>(defaultState)
  const [tab, setTab] = useState<"contract" | "annexes">("contract")
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("Без названия")
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [pending, startTransition] = useTransition()

  const set = (mut: Mutator) => setState((prev) => { const n = structuredClone(prev); mut(n); return n })

  const assembly = useMemo(() => assemble(state), [state])
  const advices = useMemo(() => advise(state, assembly.ctx), [state, assembly])
  const hardErrors = assembly.validation.hard

  const [tenants, setTenants] = useState<ConstructorTenant[]>([])
  const [selTenant, setSelTenant] = useState("")
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

  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const t of tenants) {
      const key = t.building ?? "Без здания"
      const list = m.get(key) ?? []
      list.push(t)
      m.set(key, list)
    }
    return [...m.entries()]
  }, [tenants])

  function onPickTenant(id: string) {
    setSelTenant(id)
    if (!id) return
    startTransition(async () => {
      const r = await prefillFromTenant(id)
      if (r.ok && r.state) {
        setState(r.state)
        setLandlordContacts(r.landlordContacts ?? null)
        setDraftName(r.state.tenant.name || "Без названия")
        if (autoNumber) applyAutoNumber() // prefill сбрасывает номер — вернуть автономер
        toast.success("Данные арендатора подставлены")
      } else toast.error(r.error ?? "Не удалось подставить данные")
    })
  }

  function doSave() {
    startTransition(async () => {
      const r = await saveContractDraft({ id: draftId ?? undefined, name: draftName, builderState: state })
      if (r.ok) { setDraftId(r.id ?? null); toast.success("Черновик сохранён"); refreshDrafts() } else toast.error(r.error ?? "Ошибка сохранения")
    })
  }
  function doLoad(id: string) {
    if (!id) return
    startTransition(async () => {
      const r = await loadContractDraft(id)
      if (r.ok && r.builderState) { setState(r.builderState); setDraftId(id); setDraftName(r.name ?? "Без названия"); setAutoNum(false); toast.success("Черновик загружен") } else toast.error(r.error ?? "Не удалось загрузить")
    })
  }
  function doDownload() {
    startTransition(async () => {
      const r = await generateContractDocx(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? "Ошибка генерации"); return }
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = r.fileName ?? "Договор.docx"
      link.click()
      URL.revokeObjectURL(url)
    })
  }
  function doCreate(opts: { send?: boolean; landlordSign?: boolean }) {
    if (!selTenant) { toast.error("Сначала выберите арендатора в списке вверху формы"); return }
    startTransition(async () => {
      const r = await createContractFromBuilder(selTenant, state, { ...opts, autoNumber })
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать договор"); return }
      if (r.error) { toast.error(r.error); return } // создан, но шаг подписи/отправки не удался
      toast.success(
        opts.send
          ? opts.landlordSign
            ? "Подписано вами (Арендодатель) и отправлено арендатору на подпись"
            : "Отправлено арендатору на подпись"
          : "Договор создан (черновик) — в карточке арендатора",
      )
    })
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/settings" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" aria-label="Назад к настройкам">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <FileSignature className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Конструктор договора
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Договор аренды собирается из условий — без ручного редактирования текста</p>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        {drafts.length > 0 && (
          <select className={`${inputCls} w-auto`} value={draftId ?? ""} onChange={(e) => doLoad(e.target.value)}>
            <option value="">— черновики —</option>
            {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <input className={`${inputCls} w-44`} value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название черновика" />
        <Button variant="secondary" size="sm" leftIcon={<Save className="h-4 w-4" />} loading={pending} onClick={doSave}>Сохранить</Button>
        <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0} onClick={doDownload}>DOCX</Button>
        <Button variant="outline" size="sm" leftIcon={<FilePlus2 className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0} onClick={() => doCreate({})}>Создать договор</Button>
        <Button variant="primary" size="sm" leftIcon={<Send className="h-4 w-4" />} loading={pending} disabled={hardErrors.length > 0} onClick={() => doCreate({ send: true, landlordSign: true })}>Подписать и отправить</Button>
        {hardErrors.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" /> {hardErrors.length} ошибок
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ── form ── */}
        <div className="space-y-4">
          <div className={`${cardCls} p-4`}>
            <label className={labelCls}>Заполнить из арендатора</label>
            <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
              <option value="">— выбрать арендатора —</option>
              {tenantGroups.map(([b, list]) => (
                <optgroup key={b} label={b}>
                  {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Реквизиты сторон, помещение, ставка, депозит и срок подставятся автоматически — дальше можно поправить вручную.</p>
          </div>
          <CollapsibleCard title="Стороны" icon={Users} defaultOpen>
            <div className="space-y-1 p-5"><PartiesStep state={state} set={set} landlordContacts={landlordContacts} /></div>
          </CollapsibleCard>
          <CollapsibleCard title="Помещение и реквизиты договора" icon={Building2}>
            <div className="space-y-1 p-5"><PremisesStep state={state} set={set} autoNumber={autoNumber} onSetAutoNumber={onSetAutoNumber} /></div>
          </CollapsibleCard>
          <CollapsibleCard title="Финансовая модель" icon={Wallet}>
            <div className="space-y-1 p-5"><FinancialStep state={state} set={set} /></div>
          </CollapsibleCard>
          <CollapsibleCard title="Приложения и модули" icon={PackageCheck}>
            <div className="space-y-1 p-5"><AnnexesStep state={state} set={set} /></div>
          </CollapsibleCard>
        </div>

        {/* ── preview + advisor ── */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className={cardCls}>
            <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <button onClick={() => setTab("contract")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "contract" ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>Договор</button>
              <button onClick={() => setTab("annexes")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "annexes" ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>Приложения</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-6 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {tab === "contract" ? <ContractPreview state={state} /> : <AnnexesPreview state={state} />}
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">
              <Sparkles className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Помощник
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{advices.length + hardErrors.length}</span>
            </div>
            <div className="space-y-2 p-4">
              {hardErrors.map((m, i) => (
                <div key={"h" + i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{m}</span>
                </div>
              ))}
              {advices.map((a) => (
                <div key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${ADV_BOX[a.severity]}`}>
                  {a.severity === "warn" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : a.severity === "suggest" ? <Lightbulb className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
                  <span className="flex-1">{a.message}</span>
                  {a.fix && (
                    <button onClick={() => set((s) => Object.assign(s, applyAdvisorFix(s, a.fix!)))} className="shrink-0 rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:bg-white/40">Исправить</button>
                  )}
                </div>
              ))}
              {advices.length === 0 && hardErrors.length === 0 && (
                <p className="py-1 text-xs text-slate-400 dark:text-slate-500">Замечаний нет — договор готов к генерации.</p>
              )}
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
  return (
    <div>
      <div className={secTitleCls}>{role}</div>
      <div className="mb-2"><Seg value={p.type} options={PARTY_TYPES} onChange={(v) => onChange((x) => { x.type = v; x.basis = BASIS_BY_TYPE[v] })} /></div>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      {p.type !== "individual" && (
        <div className="mb-2"><label className={labelCls}>Подписант (в лице)</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{p.type === "individual" ? "ИИН" : "БИН/ИИН"}</label><input className={inputCls} value={p.type === "individual" ? p.iin : p.bin} onChange={(e) => onChange((x) => { if (x.type === "individual") x.iin = e.target.value; else x.bin = e.target.value })} /></div>
        <div><label className={labelCls}>Основание</label><input className={inputCls} value={p.basis} onChange={(e) => onChange((x) => { x.basis = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Адрес</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>ИИК</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>Банк</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>БИК</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
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
  const ll = state.landlord
  const sameAs = (c: Contacts) => (c.phone || c.email) !== "" && (ll.phone ?? "") === c.phone && (ll.email ?? "") === c.email
  const applyContacts = (c: Contacts) => set((s) => { s.landlord.phone = c.phone; s.landlord.email = c.email })
  const contactHint = (c: Contacts) => [c.phone, c.email].filter(Boolean).join(" · ") || "не заданы"
  return (
    <>
      <PartyForm p={state.landlord} role="Арендодатель" onChange={(mut) => set((s) => mut(s.landlord))} />
      <div className={secTitleCls}>Контакты арендодателя</div>
      {landlordContacts && (
        <div className="mb-1.5 flex gap-1.5">
          <button type="button" title={contactHint(landlordContacts.owner)} onClick={() => applyContacts(landlordContacts.owner)} className={contactBtn(sameAs(landlordContacts.owner))}>Владелец (вы)</button>
          <button type="button" title={contactHint(landlordContacts.admin)} onClick={() => applyContacts(landlordContacts.admin)} className={contactBtn(sameAs(landlordContacts.admin))}>Администратор</button>
        </div>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Телефон</label><input className={inputCls} value={ll.phone ?? ""} onChange={(e) => set((s) => { s.landlord.phone = e.target.value })} /></div>
        <div><label className={labelCls}>E-mail</label><input className={inputCls} value={ll.email ?? ""} onChange={(e) => set((s) => { s.landlord.email = e.target.value })} /></div>
      </div>
      <PartyForm p={state.tenant} role="Арендатор" onChange={(mut) => set((s) => mut(s.tenant))} />
      <div className={secTitleCls}>Контакты арендатора</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Телефон</label><input className={inputCls} value={state.tenant.phone ?? ""} onChange={(e) => set((s) => { s.tenant.phone = e.target.value })} /></div>
        <div><label className={labelCls}>E-mail</label><input className={inputCls} value={state.tenant.email ?? ""} onChange={(e) => set((s) => { s.tenant.email = e.target.value })} /></div>
      </div>
    </>
  )
}

function PremisesStep({ state, set, autoNumber, onSetAutoNumber }: { state: ContractState; set: (m: Mutator) => void; autoNumber: boolean; onSetAutoNumber: (v: boolean) => void }) {
  return (
    <>
      <div className={secTitleCls}>Договор</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Номер {autoNumber && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">авто</span>}</label>
          <div className="flex gap-1.5">
            <input className={`${inputCls} disabled:opacity-60`} placeholder="например, 001" value={state.meta.contractNumber} disabled={autoNumber} onChange={(e) => set((s) => { s.meta.contractNumber = e.target.value })} />
            <button type="button" onClick={() => onSetAutoNumber(!autoNumber)} title={autoNumber ? "Задать номер вручную" : "Вернуть автонумерацию"} className="shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">
              {autoNumber ? "Другой" : "Авто"}
            </button>
          </div>
        </div>
        <div><label className={labelCls}>Дата</label><input type="date" className={inputCls} value={state.meta.contractDate} onChange={(e) => set((s) => { s.meta.contractDate = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Город</label><input className={inputCls} value={state.meta.city} onChange={(e) => set((s) => { s.meta.city = e.target.value })} /></div>
      <div className={secTitleCls}>Помещение</div>
      <div className="mb-2"><label className={labelCls}>Адрес здания</label><input className={inputCls} value={state.premises.buildingAddress} onChange={(e) => set((s) => { s.premises.buildingAddress = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Расположение (этаж/№)</label><input className={inputCls} value={state.premises.placement} onChange={(e) => set((s) => { s.premises.placement = e.target.value })} /></div>
        <div><label className={labelCls}>Площадь, кв. м</label><input type="number" className={inputCls} value={state.premises.spaceAreaSqm || ""} onChange={(e) => set((s) => { s.premises.spaceAreaSqm = Number(e.target.value) })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Целевое назначение</label><input className={inputCls} value={state.premises.purposeUse} onChange={(e) => set((s) => { s.premises.purposeUse = e.target.value })} /></div>
      <div><label className={labelCls}>Общая площадь здания, кв. м <span className="text-slate-400 dark:text-slate-500">(для долевого расчёта)</span></label><input type="number" className={inputCls} value={state.building.totalRentableAreaSqm || ""} onChange={(e) => set((s) => { s.building.totalRentableAreaSqm = Number(e.target.value) })} /></div>
    </>
  )
}

function FinancialStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const f = state.financials
  const op = f.operatingCosts
  return (
    <>
      <div className={secTitleCls}>Арендная плата</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Плата в месяц, ₸</label><input type="number" className={inputCls} value={f.monthlyRent || ""} onChange={(e) => set((s) => { s.financials.monthlyRent = Number(e.target.value) })} /></div>
        <div><label className={labelCls}>День оплаты (1–28)</label><input type="number" className={inputCls} value={f.paymentDueDay} onChange={(e) => set((s) => { s.financials.paymentDueDay = Number(e.target.value) })} /></div>
      </div>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.vatIncluded} onChange={(e) => set((s) => { s.financials.vatIncluded = e.target.checked })} /> НДС включён в плату</label>

      <div className={secTitleCls}>Пресет</div>
      <div className="grid gap-2">
        {PRESETS.map((pr) => (
          <button key={pr.key} onClick={() => set(pr.apply)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-blue-500/50">
            <b className="block text-[13px] text-slate-900 dark:text-slate-100">{pr.title}</b>
            <small className="text-[11.5px] text-slate-500 dark:text-slate-400">{pr.hint}</small>
          </button>
        ))}
      </div>

      <div className={secTitleCls}>Матрица ресурсов</div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        {UTILITY_ORDER.map((k: UtilityKey) => (
          <div key={k} className="grid grid-cols-[1fr_1.4fr] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-800">
            <span className="text-[12.5px] text-slate-700 dark:text-slate-300">{UTILITY_LABELS[k]}</span>
            <select className={inputCls} value={f.premisesUtilities[k]} onChange={(e) => set((s) => { s.financials.premisesUtilities[k] = e.target.value as UtilityMode })}>
              {UTILITY_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className={secTitleCls}>Эксплуатационные расходы</div>
      <select className={`${inputCls} mb-2`} value={op.method} onChange={(e) => set((s) => { s.financials.operatingCosts.method = e.target.value as OperatingMethod })}>
        <option value="none">Нет</option>
        <option value="fixed_per_sqm">Фиксированный за кв.м</option>
        <option value="pooled_prorata">Котловой долевой</option>
      </select>
      {op.method !== "none" && (
        <select className={`${inputCls} mb-2`} value={op.scope} onChange={(e) => set((s) => { s.financials.operatingCosts.scope = e.target.value as "common_area" | "all_inclusive" })}>
          <option value="common_area">Только места общего пользования</option>
          <option value="all_inclusive">Всё включено (поглощает коммуналку)</option>
        </select>
      )}
      {op.method === "fixed_per_sqm" && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>Тариф зима, ₸/кв.м</label><input type="number" className={inputCls} value={op.fixed?.winterRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: Number(e.target.value), summerRate: op.fixed?.summerRate ?? 0 } })} /></div>
          <div><label className={labelCls}>Тариф лето, ₸/кв.м</label><input type="number" className={inputCls} value={op.fixed?.summerRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: op.fixed?.winterRate ?? 0, summerRate: Number(e.target.value) } })} /></div>
        </div>
      )}
      {op.method === "pooled_prorata" && (
        <div><label className={labelCls}>Авансовая ставка, ₸/кв.м</label><input type="number" className={inputCls} value={op.pooled?.estimatedRatePerSqm || ""} onChange={(e) => set((s) => { if (s.financials.operatingCosts.pooled) s.financials.operatingCosts.pooled.estimatedRatePerSqm = Number(e.target.value) })} /></div>
      )}

      <div className={secTitleCls}>Депозит</div>
      <div className="mb-1"><label className={labelCls}>Сумма, ₸</label><input type="number" className={inputCls} value={f.deposit.amount || ""} onChange={(e) => set((s) => { s.financials.deposit.amount = Number(e.target.value) })} /></div>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.deposit.installmentAllowed} onChange={(e) => set((s) => { s.financials.deposit.installmentAllowed = e.target.checked })} /> Разрешить рассрочку депозита</label>

      <div className={secTitleCls}>Пеня и индексация</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Пеня арендатора, %/день</label><input type="number" step="0.1" className={inputCls} value={f.penalty.tenantPerDay} onChange={(e) => set((s) => { s.financials.penalty.tenantPerDay = Number(e.target.value) })} /></div>
        <div><label className={labelCls}>Пеня арендодателя, %/день</label><input type="number" step="0.1" className={inputCls} value={f.penalty.landlordPerDay} onChange={(e) => set((s) => { s.financials.penalty.landlordPerDay = Number(e.target.value) })} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={f.indexation.enabled} onChange={(e) => set((s) => { s.financials.indexation.enabled = e.target.checked })} /> Индексация (только через ДС)</label>
    </>
  )
}

function AnnexesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const sv = state.financials.additionalServices
  return (
    <>
      <div className={secTitleCls}>Модули</div>
      <ToggleRow on={state.modules.actEnabled} title="Акт приёма-передачи (Прил. № 1)" hint="Рекомендуется держать включённым" onToggle={() => set((s) => { s.modules.actEnabled = !s.modules.actEnabled })} />
      <ToggleRow on={state.modules.insuranceEnabled} title="Страхование (раздел 7)" onToggle={() => set((s) => { s.modules.insuranceEnabled = !s.modules.insuranceEnabled })} />
      <ToggleRow on={state.modules.signageEnabled} title="Вывески (п. 1.6, 6.2.3)" onToggle={() => set((s) => { s.modules.signageEnabled = !s.modules.signageEnabled })} />
      <div className={secTitleCls}>Дополнительные услуги (Прил. № 2)</div>
      <ToggleRow on={sv.premisesCleaning.ordered} title="Уборка внутри помещения" onToggle={() => set((s) => { s.financials.additionalServices.premisesCleaning.ordered = !sv.premisesCleaning.ordered })} />
      <ToggleRow on={sv.internet.ordered} title="Интернет" onToggle={() => set((s) => { s.financials.additionalServices.internet.ordered = !sv.internet.ordered })} />
      <ToggleRow on={sv.phone.ordered} title="Телефон" onToggle={() => set((s) => { s.financials.additionalServices.phone.ordered = !sv.phone.ordered })} />
      <ToggleRow on={sv.premisesSecurity.ordered} title="Охрана помещения" onToggle={() => set((s) => { s.financials.additionalServices.premisesSecurity.ordered = !sv.premisesSecurity.ordered })} />
    </>
  )
}

// ───────────────────────── preview ─────────────────────────

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

function ContractPreview({ state }: { state: ContractState }) {
  const a = assemble(state)
  return (
    <div>
      <div className={`mb-1 ${docTitleCls}`}>ДОГОВОР № {state.meta.contractNumber || "____"}</div>
      <div className={`mb-3 ${docSubCls}`}>аренды нежилого помещения</div>
      <div className="mb-3 flex justify-between text-slate-600 dark:text-slate-400">
        <span>{state.meta.city}</span>
        <span>{dateLong(state.meta.contractDate)}</span>
      </div>
      <p className="mb-4 text-justify text-slate-700 dark:text-slate-300">
        {partyIntro(state.landlord, "Арендодатель")}, с одной стороны, и {partyIntro(state.tenant, "Арендатор")}, с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:
      </p>
      {a.sections.map((sec) => (
        <div key={sec.num} className="mb-3">
          <div className="mb-1.5 mt-4 font-semibold text-slate-900 dark:text-slate-100">{sec.num}. {sec.title}</div>
          {sec.items.map((it) => (
            <div key={it.id} className="mb-2 text-justify text-slate-700 dark:text-slate-300">
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

function Annex1Preview({ state }: { state: ContractState }) {
  const p = state.premises
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № 1 к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
      <div className={docTitleCls}>АКТ</div>
      <div className={docSubCls}>приёма-передачи нежилого помещения</div>
      <p>{state.landlord.name || "Арендодатель"} (Арендодатель) и {state.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:</p>
      <p>1. Передано нежилое помещение по адресу: {p.buildingAddress || "________"}{p.placement ? ", " + p.placement : ""}, общей площадью {p.spaceAreaSqm || "____"} кв. м.</p>
      <p>2. Состояние помещения на момент передачи:</p>
      <ul className="ml-4 list-disc space-y-0.5">{["стены", "пол", "потолок", "окна, двери", "электропроводка, освещение", "сантехника, отопление", "иное"].map((x) => <li key={x}>{x}: ____________________</li>)}</ul>
      <p>3. Показания счётчиков: электроэнергия ______ кВт·ч; холодная вода ______ куб. м; горячая вода ______ куб. м.</p>
      <p>4. Передаваемые ключи: ____ комплектов.</p>
      <p>5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет.</p>
    </div>
  )
}

function Annex2Preview({ state }: { state: ContractState }) {
  const sv = state.financials.additionalServices
  const rows: [string, boolean, string][] = [
    ["Уборка внутри помещения", sv.premisesCleaning.ordered, sv.premisesCleaning.ratePerSqm ? `${money(sv.premisesCleaning.ratePerSqm)} за кв. м/мес` : "____ за кв. м/мес"],
    ["Стационарный телефон", sv.phone.ordered, "по тарифам оператора"],
    ["Интернет (Wi-Fi)", sv.internet.ordered, sv.internet.monthly ? `${money(sv.internet.monthly)}/мес` : "____/мес"],
    ["Охрана помещения", sv.premisesSecurity.ordered, sv.premisesSecurity.monthly ? `${money(sv.premisesSecurity.monthly)}/мес` : "____/мес"],
  ]
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № 2 к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
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

function Annex3Preview({ state }: { state: ContractState }) {
  const op = state.financials.operatingCosts
  const a = assemble(state)
  const area = state.premises.spaceAreaSqm || 0
  return (
    <div className="space-y-2 text-slate-700 dark:text-slate-300">
      <div className={docTagCls}>Приложение № 3 к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}</div>
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
  const c = assemble(state).ctx
  if (!c.annexes.act && !c.annexes.services && !c.annexes.operatingCosts) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Приложения к договору не предусмотрены — включаются Актом (Прил. № 1), доп. услугами (Прил. № 2) или методом эксплуатационных расходов (Прил. № 3).</p>
  }
  return (
    <div className="space-y-8">
      {c.annexes.act && <Annex1Preview state={state} />}
      {c.annexes.services && <Annex2Preview state={state} />}
      {c.annexes.operatingCosts && <Annex3Preview state={state} />}
    </div>
  )
}
