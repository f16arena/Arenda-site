"use client"

import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"
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
import { useT } from "@/lib/i18n/client"

const inputCls = FIELD_CLS
const labelCls = LABEL_CLS
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"

type Mutator = (s: InvoiceState) => void

function ItemsEditor({ state, set }: { state: InvoiceState; set: (m: Mutator) => void }) {
  const { t } = useT()
  // Единица измерения по умолчанию уходит в документ, поэтому она из словаря.
  const add = () => set((s) => { s.items.push({ name: "", unit: t("common.docs.unitDefault"), qty: 1, price: 0 }) })
  const remove = (i: number) => set((s) => { s.items.splice(i, 1) })
  return (
    <div className="space-y-2">
      {state.items.map((it, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">{t("common.docs.position", { n: i + 1 })}</span>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500" aria-label={t("common.docs.deletePosition")}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mb-1.5"><input className={inputCls} placeholder={t("common.docs.positionName")} value={it.name} onChange={(e) => set((s) => { s.items[i].name = e.target.value })} /></div>
          <div className="grid grid-cols-4 gap-1.5">
            <div><label className={labelCls}>{t("common.docs.unit")}</label><input className={inputCls} value={it.unit} onChange={(e) => set((s) => { s.items[i].unit = e.target.value })} /></div>
            <div><label className={labelCls}>{t("common.docs.qty")}</label><input type="number" className={inputCls} value={it.qty || ""} onChange={(e) => set((s) => { s.items[i].qty = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>{t("common.docs.price")}</label><input type="number" className={inputCls} value={it.price || ""} onChange={(e) => set((s) => { s.items[i].price = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>{t("common.docs.sum")}</label><input className={`${inputCls} opacity-70`} value={money(itemSum(it))} disabled /></div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-400">
        <Plus className="h-4 w-4" /> {t("common.docs.addPosition")}
      </button>
    </div>
  )
}

export function InvoiceConstructor({ embedded = false, initialTenantId }: { embedded?: boolean; initialTenantId?: string } = {}) {
  const { t } = useT()
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
      if (r.ok && r.state) {
        setState(r.state)
        if (autoNumber) applyAutoNumber()
        // Честный источник: начисления уже есть или позиции собраны по договору
        toast.success(r.source === "contract"
          ? t("common.docs.prefilledNoCharges")
          : t("common.docs.prefilledFromCharges"))
      } else toast.error(r.error ?? t("common.docs.prefillFailed"))
    })
  }
  const appliedInitialTenant = useRef(false)
  useEffect(() => {
    if (appliedInitialTenant.current || !initialTenantId || !period) return
    if (!tenants.some((row) => row.id === initialTenantId)) return
    appliedInitialTenant.current = true
    onPickTenant(initialTenantId)
  }, [tenants, initialTenantId, period]) // eslint-disable-line react-hooks/exhaustive-deps

  function onPickTenant(id: string) { setSelTenant(id); reprefill(id, period) }
  function onChangePeriod(p: string) { setPeriod(p); set((s) => { s.period = p }); if (selTenant) reprefill(selTenant, p) }

  function doDownload() {
    startTransition(async () => {
      const r = await generateInvoicePdf(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? t("common.docs.generateFailed")); return }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = r.fileName ?? t("common.docs.invoiceFileName"); a.click(); URL.revokeObjectURL(url)
    })
  }
  function doCreate() {
    if (!selTenant) { toast.error(t("common.docs.pickTenantFirst")); return }
    startTransition(async () => {
      const r = await createInvoiceFromBuilder(selTenant, state, { autoNumber })
      if (!r.ok) { toast.error(r.error ?? t("common.docs.invoiceCreateFailed")); return }
      toast.success(t("common.docs.invoiceCreated", { number: r.number ?? "" }))
    })
  }

  const subtotal = useMemo(() => invSubtotal(state), [state])
  const vat = useMemo(() => invVat(state), [state])
  const total = useMemo(() => invTotal(state), [state])
  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const row of tenants) { const k = row.building ?? t("common.docs.noBuilding"); if (!m.has(k)) m.set(k, []); m.get(k)!.push(row) }
    return [...m.entries()]
  }, [tenants, t])

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("common.docs.invoiceTitle")}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("common.docs.invoiceSubtitle")}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls}>{t("common.docs.tenant")}</label>
          <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
            <option value="">{t("common.docs.pickTenant")}</option>
            {tenantGroups.map(([building, list]) => (
              <optgroup key={building} label={building}>{list.map((row) => <option key={row.id} value={row.id} disabled={!row.activeContract}>{row.name}{row.activeContract ? "" : t("common.docs.noActiveContract")}</option>)}</optgroup>
            ))}
          </select>
        </div>
        <div className="w-[160px]"><label className={labelCls}>{t("common.docs.month")}</label><input type="month" className={inputCls} value={period} onChange={(e) => onChangePeriod(e.target.value)} /></div>
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={doDownload} disabled={pending}>PDF</Button>
        <Button variant="primary" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={doCreate} disabled={pending}>{t("common.docs.invoiceCreate")}</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <CollapsibleCard title={t("common.docs.parties")} icon={Users} defaultOpen>
            <div className="p-5">
              <div className={secTitleCls}>{t("common.docs.supplier")}</div>
              <SellerFields p={state.seller} onChange={(mut) => set((s) => mut(s.seller))} />
              <div className={secTitleCls}>{t("common.docs.recipient")}</div>
              <BuyerFields p={state.buyer} onChange={(mut) => set((s) => mut(s.buyer))} />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={t("common.docs.invoiceCard")} icon={ReceiptText} defaultOpen>
            <div className="space-y-1 p-5">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>{t("common.docs.number")} {autoNumber && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">{t("common.docs.auto")}</span>}</label>
                  <div className="flex gap-1.5">
                    <input className={`${inputCls} disabled:opacity-60`} placeholder={t("common.docs.numberPlaceholder")} value={state.meta.number} disabled={autoNumber} onChange={(e) => set((s) => { s.meta.number = e.target.value })} />
                    <button type="button" onClick={() => onSetAutoNumber(!autoNumber)} className="shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{autoNumber ? t("common.docs.autoOff") : t("common.docs.autoOn")}</button>
                  </div>
                </div>
                <div><label className={labelCls}>{t("common.docs.invoiceDate")}</label><input type="date" className={inputCls} value={state.meta.date} onChange={(e) => set((s) => { s.meta.date = e.target.value })} /></div>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div><label className={labelCls}>{t("common.docs.contractNo")} <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">{t("common.docs.fromContract")}</span></label><input className={`${inputCls} disabled:opacity-60`} value={state.contractRef.number} disabled readOnly title={t("common.docs.contractNoTitle")} /></div>
                <div><label className={labelCls}>{t("common.docs.dueDate")}</label><input type="date" className={inputCls} value={state.dueDate} onChange={(e) => set((s) => { s.dueDate = e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={state.vat.enabled} onChange={(e) => set((s) => { s.vat.enabled = e.target.checked })} /> {t("common.docs.vat")}</label>
                <div><label className={labelCls}>{t("common.docs.vatRate")}</label><input type="number" className={inputCls} value={state.vat.rate} disabled={!state.vat.enabled} onChange={(e) => set((s) => { s.vat.rate = Number(e.target.value) })} /></div>
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={t("common.docs.positions")} icon={ListChecks} defaultOpen>
            <div className="p-5"><ItemsEditor state={state} set={set} /></div>
          </CollapsibleCard>
        </div>

        {/* Предпросмотр — факсимиле готового PDF. Подписи здесь НЕ из словаря
            намеренно: PDF рисует lib/invoice-engine на русском, и расхождение
            «на экране по-казахски, в файле по-русски» хуже одного языка. */}
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
  const { t } = useT()
  return (
    <>
      <div className="mb-2"><label className={labelCls}>{t("common.docs.name")}</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("common.docs.binIin")}</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.signatoryPosition")}</label><input className={inputCls} value={p.signatoryPosition} onChange={(e) => onChange((x) => { x.signatoryPosition = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>{t("common.docs.address")}</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div><label className={labelCls}>{t("common.docs.bank")}</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.iik")}</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.bik")}</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>{t("common.docs.kbe")}</label><input className={inputCls} value={p.kbe} onChange={(e) => onChange((x) => { x.kbe = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.knp")}</label><input className={inputCls} value={p.knp} onChange={(e) => onChange((x) => { x.knp = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.signatory")}</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      </div>
    </>
  )
}

function BuyerFields({ p, onChange }: { p: InvoiceBuyer; onChange: (mut: (x: InvoiceBuyer) => void) => void }) {
  const { t } = useT()
  return (
    <>
      <div className="mb-2"><label className={labelCls}>{t("common.docs.name")}</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{t("common.docs.binIin")}</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.address")}</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>{t("common.docs.bank")}</label><input className={inputCls} value={p.bank} onChange={(e) => onChange((x) => { x.bank = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.iik")}</label><input className={inputCls} value={p.iik} onChange={(e) => onChange((x) => { x.iik = e.target.value })} /></div>
        <div><label className={labelCls}>{t("common.docs.bik")}</label><input className={inputCls} value={p.bik} onChange={(e) => onChange((x) => { x.bik = e.target.value })} /></div>
      </div>
    </>
  )
}
