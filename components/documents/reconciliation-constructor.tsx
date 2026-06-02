"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Download, FilePlus2, Plus, Trash2, Users, ReceiptText, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import {
  defaultReconState, reconDebit, reconCredit, reconClosing, reconPeriodLabel, fmtEntryDate,
  type ReconState, type ReconParty,
} from "@/lib/reconciliation-engine"
import { prefillReconFromTenant, generateReconPdf, createReconFromBuilder, getNextReconNumber } from "@/app/actions/reconciliation-builder"
import { listConstructorTenants, type ConstructorTenant } from "@/app/actions/contract-builder"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"

type Mutator = (s: ReconState) => void

function PartyFields({ p, onChange }: { p: ReconParty; onChange: (mut: (x: ReconParty) => void) => void }) {
  return (
    <>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>ИИН/БИН</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>Должность</label><input className={inputCls} value={p.position} onChange={(e) => onChange((x) => { x.position = e.target.value })} /></div>
        <div><label className={labelCls}>Подписант (ФИО)</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
      </div>
    </>
  )
}

function EntriesEditor({ state, set }: { state: ReconState; set: (m: Mutator) => void }) {
  const add = () => set((s) => { s.entries.push({ date: s.meta.date || "", doc: "", debit: 0, credit: 0 }) })
  const remove = (i: number) => set((s) => { s.entries.splice(i, 1) })
  return (
    <div className="space-y-2">
      {state.entries.map((e, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Операция {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mb-1.5 grid grid-cols-3 gap-1.5">
            <div><label className={labelCls}>Дата</label><input type="date" className={inputCls} value={e.date} onChange={(ev) => set((s) => { s.entries[i].date = ev.target.value })} /></div>
            <div className="col-span-2"><label className={labelCls}>Операция</label><input className={inputCls} value={e.doc} onChange={(ev) => set((s) => { s.entries[i].doc = ev.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div><label className={labelCls}>Дебет (начислено) ₸</label><input type="number" className={inputCls} value={e.debit || ""} onChange={(ev) => set((s) => { s.entries[i].debit = Number(ev.target.value) })} /></div>
            <div><label className={labelCls}>Кредит (оплачено) ₸</label><input type="number" className={inputCls} value={e.credit || ""} onChange={(ev) => set((s) => { s.entries[i].credit = Number(ev.target.value) })} /></div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-400">
        <Plus className="h-4 w-4" /> Добавить операцию
      </button>
    </div>
  )
}

export function ReconciliationConstructor({ embedded = false, initialTenantId }: { embedded?: boolean; initialTenantId?: string } = {}) {
  const [state, setState] = useState<ReconState>(defaultReconState)
  const [tenants, setTenants] = useState<ConstructorTenant[]>([])
  const [selTenant, setSelTenant] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [autoNumber, setAutoNum] = useState(true)
  const [notifyTenant, setNotifyTenant] = useState(true)
  const [pending, startTransition] = useTransition()

  const set = (mut: Mutator) => setState((prev) => { const n = structuredClone(prev); mut(n); return n })

  useEffect(() => { listConstructorTenants().then(setTenants).catch(() => {}) }, [])
  useEffect(() => {
    const d = new Date()
    const y = d.getFullYear()
    const f = `${y}-01`
    const t = `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const iso = `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    /* eslint-disable react-hooks/set-state-in-effect -- client-only начальные значения */
    setFrom(f); setTo(t)
    setState((prev) => { if (prev.period.from && prev.meta.date) return prev; const n = structuredClone(prev); if (!n.period.from) n.period = { from: f, to: t }; if (!n.meta.date) n.meta.date = iso; return n })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  const applyAutoNumber = () => { getNextReconNumber().then((r) => { if (r.ok && r.number) set((s) => { s.meta.number = r.number! }) }).catch(() => {}) }
  useEffect(() => { if (autoNumber) applyAutoNumber() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onSetAutoNumber = (v: boolean) => { setAutoNum(v); if (v) applyAutoNumber() }

  function reprefill(tenantId: string, f: string, t: string) {
    if (!tenantId || !f || !t) return
    startTransition(async () => {
      const r = await prefillReconFromTenant(tenantId, f, t)
      if (r.ok && r.state) { setState(r.state); if (autoNumber) applyAutoNumber(); toast.success("Сверка собрана из начислений и оплат за период") }
      else toast.error(r.error ?? "Не удалось собрать данные")
    })
  }
  const appliedInitialTenant = useRef(false)
  useEffect(() => {
    if (appliedInitialTenant.current || !initialTenantId || !from || !to) return
    if (!tenants.some((t) => t.id === initialTenantId)) return
    appliedInitialTenant.current = true
    onPickTenant(initialTenantId)
  }, [tenants, initialTenantId, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  function onPickTenant(id: string) { setSelTenant(id); reprefill(id, from, to) }
  function onChangeFrom(f: string) { setFrom(f); set((s) => { s.period.from = f }); if (selTenant) reprefill(selTenant, f, to) }
  function onChangeTo(t: string) { setTo(t); set((s) => { s.period.to = t }); if (selTenant) reprefill(selTenant, from, t) }

  function doDownload() {
    startTransition(async () => {
      const r = await generateReconPdf(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? "Ошибка генерации"); return }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = r.fileName ?? "Акт_сверки.pdf"; a.click(); URL.revokeObjectURL(url)
    })
  }
  function doCreate() {
    if (!selTenant) { toast.error("Сначала выберите арендатора"); return }
    startTransition(async () => {
      const r = await createReconFromBuilder(selTenant, state, { autoNumber, requestSignature: notifyTenant })
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать акт сверки"); return }
      toast.success(`Акт сверки № ${r.number} создан и сохранён в Документы`)
    })
  }

  const debit = useMemo(() => reconDebit(state), [state])
  const credit = useMemo(() => reconCredit(state), [state])
  const closing = useMemo(() => reconClosing(state), [state])
  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const t of tenants) { const k = t.building ?? "Без здания"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [tenants])

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Конструктор акта сверки</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Сводит начисления и оплаты за период в реестр взаиморасчётов.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls}>Арендатор</label>
          <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
            <option value="">— выберите арендатора —</option>
            {tenantGroups.map(([building, list]) => (
              <optgroup key={building} label={building}>{list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
            ))}
          </select>
        </div>
        <div className="w-[140px]"><label className={labelCls}>Период с</label><input type="month" className={inputCls} value={from} max={to} onChange={(e) => onChangeFrom(e.target.value)} /></div>
        <div className="w-[140px]"><label className={labelCls}>по</label><input type="month" className={inputCls} value={to} min={from} onChange={(e) => onChangeTo(e.target.value)} /></div>
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={doDownload} disabled={pending}>PDF</Button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400" title="Прислать арендатору уведомление с просьбой подписать">
          <input type="checkbox" checked={notifyTenant} onChange={(e) => setNotifyTenant(e.target.checked)} /> уведомить на подпись
        </label>
        <Button variant="primary" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={doCreate} disabled={pending}>Создать акт</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <CollapsibleCard title="Стороны" icon={Users} defaultOpen>
            <div className="p-5">
              <div className={secTitleCls}>Арендодатель (наша сторона)</div>
              <PartyFields p={state.org} onChange={(mut) => set((s) => mut(s.org))} />
              <div className={secTitleCls}>Арендатор</div>
              <PartyFields p={state.tenant} onChange={(mut) => set((s) => mut(s.tenant))} />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Акт и период" icon={ReceiptText} defaultOpen>
            <div className="space-y-1 p-5">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Номер {autoNumber && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">авто</span>}</label>
                  <div className="flex gap-1.5">
                    <input className={`${inputCls} disabled:opacity-60`} placeholder="например, 001" value={state.meta.number} disabled={autoNumber} onChange={(e) => set((s) => { s.meta.number = e.target.value })} />
                    <button type="button" onClick={() => onSetAutoNumber(!autoNumber)} className="shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{autoNumber ? "Другой" : "Авто"}</button>
                  </div>
                </div>
                <div><label className={labelCls}>Дата составления</label><input type="date" className={inputCls} value={state.meta.date} onChange={(e) => set((s) => { s.meta.date = e.target.value })} /></div>
              </div>
              <div><label className={labelCls}>Входящее сальдо ₸ (&gt;0 — долг арендатора)</label><input type="number" className={inputCls} value={state.openingBalance || ""} onChange={(e) => set((s) => { s.openingBalance = Number(e.target.value) })} /></div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Операции (дебет/кредит)" icon={ListChecks} defaultOpen>
            <div className="p-5"><EntriesEditor state={state} set={set} /></div>
          </CollapsibleCard>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <div className="text-center text-sm font-bold">Акт сверки взаимных расчётов № {state.meta.number || "____"}</div>
            <div className="mb-3 mt-1 text-center text-xs text-slate-500">за период {reconPeriodLabel(state.period)}</div>
            <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">{state.org.name || "—"} (ИИН/БИН {state.org.binIin || "—"}) и {state.tenant.name || "—"} (ИИН/БИН {state.tenant.binIin || "—"})</div>

            <table className="w-full border-collapse text-[11px]">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>{["Дата", "Операция", "Дебет", "Кредит"].map((h) => <th key={h} className="border border-slate-300 px-1.5 py-1 text-left font-semibold dark:border-slate-700">{h}</th>)}</tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50/60 dark:bg-slate-900/40">
                  <td colSpan={2} className="border border-slate-300 px-1.5 py-1 text-right font-medium dark:border-slate-700">Входящее сальдо</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{state.openingBalance > 0 ? money(state.openingBalance) : "—"}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{state.openingBalance < 0 ? money(-state.openingBalance) : "—"}</td>
                </tr>
                {state.entries.map((e, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{fmtEntryDate(e.date)}</td>
                    <td className="border border-slate-300 px-1.5 py-1 dark:border-slate-700">{e.doc || "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{e.debit ? money(e.debit) : "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{e.credit ? money(e.credit) : "—"}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={2} className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">Обороты</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(debit)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(credit)}</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={2} className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">Исходящее сальдо</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{closing > 0 ? money(closing) : "—"}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{closing < 0 ? money(-closing) : "—"}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 text-xs">
              {closing > 0 && <>Задолженность в пользу <b>{state.org.name || "Арендодателя"}</b>: <b>{moneyWithWords(closing)}</b></>}
              {closing < 0 && <>Переплата в пользу <b>{state.tenant.name || "Арендатора"}</b>: <b>{moneyWithWords(-closing)}</b></>}
              {closing === 0 && "Взаимная задолженность отсутствует."}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div><b>От Арендодателя:</b><div className="mt-1 text-slate-500">___________ /{state.org.signatory || "________"}/ М.П.</div></div>
              <div><b>От Арендатора:</b><div className="mt-1 text-slate-500">___________ /{state.tenant.signatory || "________"}/ М.П.</div></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Дата: {state.meta.date ? dateLong(state.meta.date) : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
