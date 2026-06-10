"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Download, FilePlus2, Plus, Trash2, Users, ReceiptText, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import { periodLabel } from "@/lib/avr-engine"
import {
  defaultInvoiceState, itemSum, invSubtotal, invVat, invTotal,
  type InvoiceState, type InvoiceSeller, type InvoiceBuyer,
} from "@/lib/invoice-engine"
import { prefillInvoiceFromTenant, generateInvoicePdf, createInvoiceFromBuilder, getNextInvoiceNumber } from "@/app/actions/invoice-builder"
import { listConstructorTenants, type ConstructorTenant } from "@/app/actions/contract-builder"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"

type Mutator = (s: InvoiceState) => void

function ItemsEditor({ state, set }: { state: InvoiceState; set: (m: Mutator) => void }) {
  const add = () => set((s) => { s.items.push({ name: "", unit: "услуга", qty: 1, price: 0 }) })
  const remove = (i: number) => set((s) => { s.items.splice(i, 1) })
  return (
    <div className="space-y-2">
      {state.items.map((it, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Позиция {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mb-1.5"><input className={inputCls} placeholder="Наименование услуги" value={it.name} onChange={(e) => set((s) => { s.items[i].name = e.target.value })} /></div>
          <div className="grid grid-cols-4 gap-1.5">
            <div><label className={labelCls}>Ед.</label><input className={inputCls} value={it.unit} onChange={(e) => set((s) => { s.items[i].unit = e.target.value })} /></div>
            <div><label className={labelCls}>Кол-во</label><input type="number" className={inputCls} value={it.qty || ""} onChange={(e) => set((s) => { s.items[i].qty = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>Цена ₸</label><input type="number" className={inputCls} value={it.price || ""} onChange={(e) => set((s) => { s.items[i].price = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>Сумма ₸</label><input className={`${inputCls} opacity-70`} value={money(itemSum(it))} disabled /></div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-400">
        <Plus className="h-4 w-4" /> Добавить позицию
      </button>
    </div>
  )
}

export function InvoiceConstructor({ embedded = false, initialTenantId }: { embedded?: boolean; initialTenantId?: string } = {}) {
  const [state, setState] = useState<InvoiceState>(defaultInvoiceState)
  const [tenants, setTenants] = useState<ConstructorTenant[]>([])
  const [selTenant, setSelTenant] = useState("")
  const [period, setPeriod] = useState("")
  const [autoNumber, setAutoNum] = useState(true)
  const [pending, startTransition] = useTransition()

  const set = (mut: Mutator) => setState((prev) => { const n = structuredClone(prev); mut(n); return n })

  useEffect(() => { listConstructorTenants().then(setTenants).catch(() => {}) }, [])
  useEffect(() => {
    const d = new Date()
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const iso = `${ym}-${String(d.getDate()).padStart(2, "0")}`
    /* eslint-disable react-hooks/set-state-in-effect -- client-only начальные значения */
    setPeriod(ym)
    setState((prev) => { if (prev.period && prev.meta.date) return prev; const n = structuredClone(prev); if (!n.period) n.period = ym; if (!n.meta.date) n.meta.date = iso; return n })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  const applyAutoNumber = () => { getNextInvoiceNumber().then((r) => { if (r.ok && r.number) set((s) => { s.meta.number = r.number! }) }).catch(() => {}) }
  useEffect(() => { if (autoNumber) applyAutoNumber() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onSetAutoNumber = (v: boolean) => { setAutoNum(v); if (v) applyAutoNumber() }

  function reprefill(tenantId: string, p: string) {
    if (!tenantId || !p) return
    startTransition(async () => {
      const r = await prefillInvoiceFromTenant(tenantId, p)
      if (r.ok && r.state) { setState(r.state); if (autoNumber) applyAutoNumber(); toast.success("Данные подставлены из начислений за период") }
      else toast.error(r.error ?? "Не удалось подставить данные")
    })
  }
  const appliedInitialTenant = useRef(false)
  useEffect(() => {
    if (appliedInitialTenant.current || !initialTenantId || !period) return
    if (!tenants.some((t) => t.id === initialTenantId)) return
    appliedInitialTenant.current = true
    onPickTenant(initialTenantId)
  }, [tenants, initialTenantId, period]) // eslint-disable-line react-hooks/exhaustive-deps

  function onPickTenant(id: string) { setSelTenant(id); reprefill(id, period) }
  function onChangePeriod(p: string) { setPeriod(p); set((s) => { s.period = p }); if (selTenant) reprefill(selTenant, p) }

  function doDownload() {
    startTransition(async () => {
      const r = await generateInvoicePdf(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? "Ошибка генерации"); return }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = r.fileName ?? "Счёт.pdf"; a.click(); URL.revokeObjectURL(url)
    })
  }
  function doCreate() {
    if (!selTenant) { toast.error("Сначала выберите арендатора"); return }
    startTransition(async () => {
      const r = await createInvoiceFromBuilder(selTenant, state, { autoNumber })
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать счёт"); return }
      toast.success(`Счёт № ${r.number} создан и сохранён в Документы`)
    })
  }

  const subtotal = useMemo(() => invSubtotal(state), [state])
  const vat = useMemo(() => invVat(state), [state])
  const total = useMemo(() => invTotal(state), [state])
  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const t of tenants) { const k = t.building ?? "Без здания"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [tenants])

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Конструктор счёта</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Счёт на оплату по действующему договору. Позиции — из начислений за месяц, а если их ещё нет — из договора (аренда, эксплуатационные расходы, уборка и доп. услуги).</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls}>Арендатор</label>
          <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
            <option value="">— выберите арендатора —</option>
            {tenantGroups.map(([building, list]) => (
              <optgroup key={building} label={building}>{list.map((t) => <option key={t.id} value={t.id} disabled={!t.activeContract}>{t.name}{t.activeContract ? "" : " — нет действующего договора"}</option>)}</optgroup>
            ))}
          </select>
        </div>
        <div className="w-[160px]"><label className={labelCls}>Месяц</label><input type="month" className={inputCls} value={period} onChange={(e) => onChangePeriod(e.target.value)} /></div>
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={doDownload} disabled={pending}>PDF</Button>
        <Button variant="primary" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={doCreate} disabled={pending}>Создать счёт</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <CollapsibleCard title="Стороны" icon={Users} defaultOpen>
            <div className="p-5">
              <div className={secTitleCls}>Поставщик (арендодатель)</div>
              <SellerFields p={state.seller} onChange={(mut) => set((s) => mut(s.seller))} />
              <div className={secTitleCls}>Получатель (арендатор)</div>
              <BuyerFields p={state.buyer} onChange={(mut) => set((s) => mut(s.buyer))} />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Счёт, договор, период" icon={ReceiptText} defaultOpen>
            <div className="space-y-1 p-5">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Номер {autoNumber && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">авто</span>}</label>
                  <div className="flex gap-1.5">
                    <input className={`${inputCls} disabled:opacity-60`} placeholder="например, 001" value={state.meta.number} disabled={autoNumber} onChange={(e) => set((s) => { s.meta.number = e.target.value })} />
                    <button type="button" onClick={() => onSetAutoNumber(!autoNumber)} className="shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{autoNumber ? "Другой" : "Авто"}</button>
                  </div>
                </div>
                <div><label className={labelCls}>Дата счёта</label><input type="date" className={inputCls} value={state.meta.date} onChange={(e) => set((s) => { s.meta.date = e.target.value })} /></div>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Договор № <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">из договора</span></label><input className={`${inputCls} disabled:opacity-60`} value={state.contractRef.number} disabled readOnly title="Подставляется автоматически из действующего договора выбранного арендатора" /></div>
                <div><label className={labelCls}>Оплатить до</label><input type="date" className={inputCls} value={state.dueDate} onChange={(e) => set((s) => { s.dueDate = e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={state.vat.enabled} onChange={(e) => set((s) => { s.vat.enabled = e.target.checked })} /> НДС</label>
                <div><label className={labelCls}>Ставка НДС, %</label><input type="number" className={inputCls} value={state.vat.rate} disabled={!state.vat.enabled} onChange={(e) => set((s) => { s.vat.rate = Number(e.target.value) })} /></div>
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Позиции" icon={ListChecks} defaultOpen>
            <div className="p-5"><ItemsEditor state={state} set={set} /></div>
          </CollapsibleCard>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <div className="text-center text-sm font-bold">Счёт на оплату № {state.meta.number || "____"} от {state.meta.date ? dateLong(state.meta.date) : "____"}</div>
            <div className="mb-3 mt-1 text-center text-xs text-slate-500">за {periodLabel(state.period)}{state.dueDate ? ` · оплатить до ${dateLong(state.dueDate)}` : ""}</div>

            <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-semibold">Поставщик</div>
                <div className="text-slate-600 dark:text-slate-400">{state.seller.name || "—"}</div>
                <div className="text-slate-500">ИИН/БИН: {state.seller.binIin || "—"}</div>
                <div className="text-slate-500">Банк: {state.seller.bank || "—"}</div>
                <div className="text-slate-500">ИИК: {state.seller.iik || "—"} · БИК: {state.seller.bik || "—"}</div>
                {(state.seller.kbe || state.seller.knp) && <div className="text-slate-500">Кбе {state.seller.kbe || "—"} · КНП {state.seller.knp || "—"}</div>}
              </div>
              <div>
                <div className="font-semibold">Получатель</div>
                <div className="text-slate-600 dark:text-slate-400">{state.buyer.name || "—"}</div>
                <div className="text-slate-500">ИИН/БИН: {state.buyer.binIin || "—"}</div>
                {state.buyer.bank && <div className="text-slate-500">Банк: {state.buyer.bank}</div>}
              </div>
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>{["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма"].map((h) => <th key={h} className="border border-slate-300 px-1.5 py-1 text-left font-semibold dark:border-slate-700">{h}</th>)}</tr>
              </thead>
              <tbody>
                {state.items.length === 0 && <tr><td colSpan={6} className="border border-slate-300 px-2 py-3 text-center text-slate-400 dark:border-slate-700">Нет позиций</td></tr>}
                {state.items.map((it, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{i + 1}</td>
                    <td className="border border-slate-300 px-1.5 py-1 dark:border-slate-700">{it.name || "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.qty}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.unit}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(it.price)}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(itemSum(it))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 space-y-0.5 text-right text-xs">
              <div>Итого: <b>{money(subtotal)}</b></div>
              {state.vat.enabled && <div>в т.ч. НДС {state.vat.rate}%: {money(vat)}</div>}
              <div className="text-sm">Всего к оплате: <b>{moneyWithWords(total)}</b></div>
            </div>

            <div className="mt-4 text-xs"><b>{state.seller.signatoryPosition || "Поставщик"}:</b> <span className="text-slate-500">___________ /{state.seller.signatory || "________"}/ М.П.</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SellerFields({ p, onChange }: { p: InvoiceSeller; onChange: (mut: (x: InvoiceSeller) => void) => void }) {
  return (
    <>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>ИИН/БИН</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>Должность подписанта</label><input className={inputCls} value={p.signatoryPosition} onChange={(e) => onChange((x) => { x.signatoryPosition = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Адрес</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div><label className={labelCls}>Банк</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>ИИК</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>БИК</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>Кбе</label><input className={inputCls} value={p.kbe} onChange={(e) => onChange((x) => { x.kbe = e.target.value })} /></div>
        <div><label className={labelCls}>КНП</label><input className={inputCls} value={p.knp} onChange={(e) => onChange((x) => { x.knp = e.target.value })} /></div>
        <div><label className={labelCls}>Подписант (ФИО)</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      </div>
    </>
  )
}

function BuyerFields({ p, onChange }: { p: InvoiceBuyer; onChange: (mut: (x: InvoiceBuyer) => void) => void }) {
  return (
    <>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>ИИН/БИН</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>Адрес</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>Банк</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>ИИК</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>БИК</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
    </>
  )
}
