"use client"

import { useMemo, useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import {
  saveContractDraft,
  listContractDrafts,
  loadContractDraft,
  generateContractDocx,
  type DraftListItem,
} from "@/app/actions/contract-builder"
import {
  defaultState,
  assemble,
  advise,
  applyAdvisorFix,
  UTILITY_ORDER,
  UTILITY_LABELS,
  money,
  type ContractState,
  type Party,
  type PartyType,
  type UtilityKey,
  type UtilityMode,
  type OperatingMethod,
} from "@/lib/contract-engine"

type Mutator = (s: ContractState) => void

const STEPS = ["Стороны", "Помещение", "Финмодель", "Приложения", "Предпросмотр"] as const

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
  { v: "in_operating_costs", label: "в эксплуатационные" },
]

const PRESETS: { key: string; title: string; hint: string; apply: Mutator }[] = [
  {
    key: "A",
    title: "A. Всё включено, свет по счётчику",
    hint: "Коммуналка в аренде, электроэнергия отдельно. Без эксплуатационного сбора.",
    apply: (s) => {
      s.financials.premisesUtilities = { electricity: "metered_separate", coldWater: "included", hotWater: "included", heating: "included", sewerage: "included", garbage: "included" }
      s.financials.operatingCosts.method = "none"
    },
  },
  {
    key: "B",
    title: "B. Раздельный учёт + сбор за МОП",
    hint: "Все ресурсы по счётчику, фиксированный эксплуатационный сбор за места общего пользования.",
    apply: (s) => {
      for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "metered_separate"
      s.financials.operatingCosts.method = "fixed_per_sqm"
      s.financials.operatingCosts.scope = "common_area"
    },
  },
  {
    key: "C",
    title: "C. Котловой долевой расчёт",
    hint: "Все расходы делятся на площадь здания. Не нужны индивидуальные счётчики.",
    apply: (s) => {
      for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "in_operating_costs"
      s.financials.operatingCosts.method = "pooled_prorata"
      s.financials.operatingCosts.scope = "all_inclusive"
    },
  },
  {
    key: "D",
    title: "D. Всё включено в аренду",
    hint: "Вся коммуналка в арендной плате. Риск роста тарифов несёт владелец.",
    apply: (s) => {
      for (const k of UTILITY_ORDER) s.financials.premisesUtilities[k] = "included"
      s.financials.operatingCosts.method = "none"
    },
  },
]

const SEV_STYLE: Record<string, string> = {
  warn: "border-red-200 bg-red-50 text-red-800",
  suggest: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-emerald-200 bg-emerald-50 text-emerald-800",
}

const inputCls = "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none"
const labelCls = "mb-1 block text-xs font-medium text-neutral-600"
const secTitleCls = "mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 first:mt-0"

export function ContractConstructor() {
  const [state, setState] = useState<ContractState>(defaultState)
  const [step, setStep] = useState(0)
  const [tab, setTab] = useState<"contract" | "annexes">("contract")

  const set = (mut: Mutator) =>
    setState((prev) => {
      const n = structuredClone(prev)
      mut(n)
      return n
    })

  const assembly = useMemo(() => assemble(state), [state])
  const advices = useMemo(() => advise(state, assembly.ctx), [state, assembly])

  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("Без названия")
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [pending, startTransition] = useTransition()

  const refreshDrafts = () => { listContractDrafts().then(setDrafts).catch(() => {}) }
  useEffect(() => { listContractDrafts().then(setDrafts).catch(() => {}) }, [])

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
      if (r.ok && r.builderState) { setState(r.builderState); setDraftId(id); setDraftName(r.name ?? "Без названия"); toast.success("Черновик загружен") } else toast.error(r.error ?? "Не удалось загрузить")
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

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 overflow-hidden rounded-xl border border-neutral-200 bg-white lg:grid-cols-[minmax(360px,420px)_1fr]">
      {/* ── left: config ── */}
      <aside className="flex min-w-0 flex-col border-r border-neutral-200">
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 p-3">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                step === i ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300 text-neutral-600 hover:border-emerald-600"
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && <PartiesStep state={state} set={set} />}
          {step === 1 && <PremisesStep state={state} set={set} />}
          {step === 2 && <FinancialStep state={state} set={set} />}
          {step === 3 && <AnnexesStep state={state} set={set} />}
          {step === 4 && <PreviewHintStep />}
        </div>
      </aside>

      {/* ── right: preview + advisor ── */}
      <main className="flex min-w-0 flex-col bg-neutral-100">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-5 py-2.5">
          <div className="flex gap-1">
            <button onClick={() => setTab("contract")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "contract" ? "bg-emerald-50 font-semibold text-emerald-800" : "text-neutral-600"}`}>Договор</button>
            <button onClick={() => setTab("annexes")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "annexes" ? "bg-emerald-50 font-semibold text-emerald-800" : "text-neutral-600"}`}>Приложения</button>
          </div>
          <div className="flex-1" />
          {drafts.length > 0 && (
            <select className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" value={draftId ?? ""} onChange={(e) => doLoad(e.target.value)}>
              <option value="">— черновики —</option>
              {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <input className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-xs" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название черновика" />
          <button onClick={doSave} disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:border-emerald-600 disabled:opacity-50">Сохранить</button>
          <button onClick={doDownload} disabled={pending || assembly.validation.hard.length > 0} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Скачать DOCX</button>
          {assembly.validation.hard.length > 0 && (
            <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">{assembly.validation.hard.length} ошибок</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl rounded border border-neutral-200 bg-white p-10 font-serif text-[13.5px] leading-relaxed text-neutral-900 shadow-sm">
            {tab === "contract" ? <ContractPreview state={state} /> : <AnnexesPreview state={state} />}
          </div>
        </div>

        {/* advisor + validation */}
        <div className="max-h-[34vh] overflow-y-auto border-t border-neutral-200 bg-white p-3">
          {assembly.validation.hard.map((m, i) => (
            <div key={"h" + i} className="mb-1.5 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="font-bold">✕</span><span>{m}</span>
            </div>
          ))}
          {advices.map((a) => (
            <div key={a.id} className={`mb-1.5 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${SEV_STYLE[a.severity]}`}>
              <span className="font-bold">{a.severity === "warn" ? "!" : a.severity === "suggest" ? "↺" : "i"}</span>
              <span className="flex-1">{a.message}</span>
              {a.fix && (
                <button onClick={() => set((s) => Object.assign(s, applyAdvisorFix(s, a.fix!)))} className="whitespace-nowrap rounded border border-current px-2 py-0.5 text-[11px]">
                  Исправить
                </button>
              )}
            </div>
          ))}
          {advices.length === 0 && assembly.validation.hard.length === 0 && (
            <div className="px-1 py-1 text-xs text-neutral-400">Замечаний нет.</div>
          )}
        </div>
      </main>
    </div>
  )
}

// ───────────────────────── steps ─────────────────────────

function PartyForm({ p, role, onChange }: { p: Party; role: string; onChange: (mut: (x: Party) => void) => void }) {
  return (
    <div>
      <div className={secTitleCls}>{role}</div>
      <div className="mb-2 flex overflow-hidden rounded-md border border-neutral-300">
        {PARTY_TYPES.map((t) => (
          <button
            key={t.v}
            onClick={() => onChange((x) => { x.type = t.v; x.basis = BASIS_BY_TYPE[t.v] })}
            className={`flex-1 border-r border-neutral-300 py-1.5 text-xs last:border-r-0 ${p.type === t.v ? "bg-emerald-600 text-white" : "bg-neutral-50 text-neutral-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      {p.type !== "individual" && (
        <div className="mb-2"><label className={labelCls}>Подписант (в лице)</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{p.type === "individual" ? "ИИН" : "БИН/ИИН"}</label><input className={inputCls} value={p.type === "individual" ? p.iin : p.bin} onChange={(e) => onChange((x) => { if (x.type === "individual") x.iin = e.target.value; else x.bin = e.target.value })} /></div>
        <div><label className={labelCls}>Основание</label><input className={inputCls} value={p.basis} onChange={(e) => onChange((x) => { x.basis = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Адрес</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div><label className={labelCls}>ИИК</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>Банк</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>БИК</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
    </div>
  )
}

function PartiesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  return (
    <>
      <PartyForm p={state.landlord} role="Арендодатель" onChange={(mut) => set((s) => mut(s.landlord))} />
      <PartyForm p={state.tenant} role="Арендатор" onChange={(mut) => set((s) => mut(s.tenant))} />
      <div className={secTitleCls}>Контакты арендатора</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Телефон</label><input className={inputCls} value={state.tenant.phone ?? ""} onChange={(e) => set((s) => { s.tenant.phone = e.target.value })} /></div>
        <div><label className={labelCls}>E-mail</label><input className={inputCls} value={state.tenant.email ?? ""} onChange={(e) => set((s) => { s.tenant.email = e.target.value })} /></div>
      </div>
    </>
  )
}

function PremisesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  return (
    <>
      <div className={secTitleCls}>Договор</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Номер</label><input className={inputCls} value={state.meta.contractNumber} onChange={(e) => set((s) => { s.meta.contractNumber = e.target.value })} /></div>
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
      <div><label className={labelCls}>Общая арендуемая площадь здания, кв. м <span className="text-neutral-400">(для долевого расчёта)</span></label><input type="number" className={inputCls} value={state.building.totalRentableAreaSqm || ""} onChange={(e) => set((s) => { s.building.totalRentableAreaSqm = Number(e.target.value) })} /></div>
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
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.vatIncluded} onChange={(e) => set((s) => { s.financials.vatIncluded = e.target.checked })} /> НДС включён в плату</label>

      <div className={secTitleCls}>Пресет финансовой модели</div>
      <div className="grid gap-2">
        {PRESETS.map((pr) => (
          <button key={pr.key} onClick={() => set(pr.apply)} className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-left hover:border-emerald-600">
            <b className="block text-[13px]">{pr.title}</b>
            <small className="text-[11.5px] text-neutral-500">{pr.hint}</small>
          </button>
        ))}
      </div>

      <div className={secTitleCls}>Матрица ресурсов</div>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        {UTILITY_ORDER.map((k: UtilityKey) => (
          <div key={k} className="grid grid-cols-[1.1fr_1.6fr] items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-b-0">
            <span className="text-[12.5px]">{UTILITY_LABELS[k]}</span>
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
          <div><label className={labelCls}>Тариф зима (окт–апр), ₸/кв.м</label><input type="number" className={inputCls} value={op.fixed?.winterRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: Number(e.target.value), summerRate: op.fixed?.summerRate ?? 0 } })} /></div>
          <div><label className={labelCls}>Тариф лето (май–сен), ₸/кв.м</label><input type="number" className={inputCls} value={op.fixed?.summerRate || ""} onChange={(e) => set((s) => { s.financials.operatingCosts.fixed = { winterRate: op.fixed?.winterRate ?? 0, summerRate: Number(e.target.value) } })} /></div>
        </div>
      )}
      {op.method === "pooled_prorata" && (
        <div><label className={labelCls}>Авансовая ставка, ₸/кв.м</label><input type="number" className={inputCls} value={op.pooled?.estimatedRatePerSqm || ""} onChange={(e) => set((s) => { if (s.financials.operatingCosts.pooled) s.financials.operatingCosts.pooled.estimatedRatePerSqm = Number(e.target.value) })} /></div>
      )}

      <div className={secTitleCls}>Депозит</div>
      <div className="mb-1"><label className={labelCls}>Сумма депозита, ₸</label><input type="number" className={inputCls} value={f.deposit.amount || ""} onChange={(e) => set((s) => { s.financials.deposit.amount = Number(e.target.value) })} /></div>
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.deposit.installmentAllowed} onChange={(e) => set((s) => { s.financials.deposit.installmentAllowed = e.target.checked })} /> Разрешить рассрочку депозита</label>

      <div className={secTitleCls}>Пеня и индексация</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Пеня арендатора, %/день</label><input type="number" step="0.1" className={inputCls} value={f.penalty.tenantPerDay} onChange={(e) => set((s) => { s.financials.penalty.tenantPerDay = Number(e.target.value) })} /></div>
        <div><label className={labelCls}>Пеня арендодателя, %/день</label><input type="number" step="0.1" className={inputCls} value={f.penalty.landlordPerDay} onChange={(e) => set((s) => { s.financials.penalty.landlordPerDay = Number(e.target.value) })} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.indexation.enabled} onChange={(e) => set((s) => { s.financials.indexation.enabled = e.target.checked })} /> Индексация (только через ДС)</label>
    </>
  )
}

function ToggleRow({ on, title, hint, onToggle }: { on: boolean; title: string; hint?: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="mb-2 flex w-full items-center justify-between rounded-lg border border-neutral-300 px-3 py-2.5 text-left hover:border-emerald-600">
      <span><b className="block text-[13px]">{title}</b>{hint && <small className="text-[11.5px] text-neutral-500">{hint}</small>}</span>
      <span className={`relative h-5 w-9 flex-none rounded-full transition ${on ? "bg-emerald-600" : "bg-neutral-300"}`}><i className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} /></span>
    </button>
  )
}

function AnnexesStep({ state, set }: { state: ContractState; set: (m: Mutator) => void }) {
  const sv = state.financials.additionalServices
  return (
    <>
      <div className={secTitleCls}>Приложения и модули</div>
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

function PreviewHintStep() {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      Договор собирается автоматически справа в реальном времени. Внизу — Помощник-советник и валидатор. Когда все ошибки устранены, договор готов к генерации и подписанию (следующие фазы).
    </div>
  )
}

// ───────────────────────── preview ─────────────────────────

function ContractPreview({ state }: { state: ContractState }) {
  const a = assemble(state)
  return (
    <div className="whitespace-pre-wrap">
      <div className="mb-1 text-center text-[17px] font-bold">ДОГОВОР № {state.meta.contractNumber || "____"}</div>
      <div className="mb-5 text-center text-[14px]">аренды нежилого помещения</div>
      {a.sections.map((sec) => (
        <div key={sec.num} className="mb-3">
          <div className="mb-1.5 mt-4 text-[14px] font-bold">{sec.num}. {sec.title}</div>
          {sec.items.map((it) => (
            <div key={it.id} className="mb-2 text-justify">
              <b>{it.num}.</b> {it.sub && <b>{it.sub} </b>}{it.html}
              {it.children.map((k) => (
                <div key={k.id} className="ml-5 mt-1 text-justify"><b>{k.num}.</b> {k.html}</div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="mb-1.5 mt-4 text-[14px] font-bold">{a.requisitesNum}. Реквизиты и подписи Сторон</div>
    </div>
  )
}

function AnnexesPreview({ state }: { state: ContractState }) {
  const c = assemble(state).ctx
  const f = state.financials
  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <b>Приложение № 1 — Акт приёма-передачи:</b>{" "}
        {c.annexes.act ? <span className="text-emerald-700">включено</span> : <span className="text-neutral-400">выключено</span>}
      </div>
      <div>
        <b>Приложение № 2 — Доп. услуги:</b>{" "}
        {c.annexes.services ? <span className="text-emerald-700">включено</span> : <span className="text-neutral-400">нет заказанных услуг</span>}
      </div>
      <div>
        <b>Приложение № 3 — Эксплуатационные расходы:</b>{" "}
        {c.annexes.operatingCosts ? (
          <span className="text-emerald-700">
            включено ({f.operatingCosts.method === "fixed_per_sqm" ? `тарифы: зима ${money(f.operatingCosts.fixed?.winterRate ?? 0)}, лето ${money(f.operatingCosts.fixed?.summerRate ?? 0)} за кв.м` : "котловой долевой расчёт"})
          </span>
        ) : (
          <span className="text-neutral-400">метод расчёта не выбран</span>
        )}
      </div>
      <p className="text-[12px] text-neutral-500">Полный DOCX-рендер приложений — следующая фаза (генерация документов).</p>
    </div>
  )
}
