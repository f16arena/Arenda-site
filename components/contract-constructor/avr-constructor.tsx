"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Download, FilePlus2, Plus, Trash2, Users, ReceiptText, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { money, moneyWithWords, dateLong } from "@/lib/contract-engine"
import {
  defaultAvrState,
  itemSum,
  avrSubtotal,
  avrVat,
  avrTotal,
  periodLabel,
  type AvrState,
  type AvrParty,
} from "@/lib/avr-engine"
import {
  prefillAvrFromTenant,
  generateAvrPdf,
  createAvrFromBuilder,
  getNextActNumber,
} from "@/app/actions/avr-builder"
import { listConstructorTenants, type ConstructorTenant } from "@/app/actions/contract-builder"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
const secTitleCls = "mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0"

type Mutator = (s: AvrState) => void

function PartyFields({ p, onChange }: { p: AvrParty; onChange: (mut: (x: AvrParty) => void) => void }) {
  return (
    <>
      <div className="mb-2"><label className={labelCls}>Наименование</label><input className={inputCls} value={p.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>ИИН/БИН</label><input className={inputCls} value={p.binIin} onChange={(e) => onChange((x) => { x.binIin = e.target.value })} /></div>
        <div><label className={labelCls}>Должность</label><input className={inputCls} value={p.position} onChange={(e) => onChange((x) => { x.position = e.target.value })} /></div>
      </div>
      <div className="mb-2"><label className={labelCls}>Адрес</label><input className={inputCls} value={p.address} onChange={(e) => onChange((x) => { x.address = e.target.value })} /></div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Подписант (ФИО)</label><input className={inputCls} value={p.signatory} onChange={(e) => onChange((x) => { x.signatory = e.target.value })} /></div>
        <div><label className={labelCls}>Средства связи (тел./email)</label><input className={inputCls} value={p.comm} onChange={(e) => onChange((x) => { x.comm = e.target.value })} /></div>
      </div>
    </>
  )
}

function ItemsEditor({ state, set }: { state: AvrState; set: (m: Mutator) => void }) {
  const add = () => set((s) => { s.items.push({ name: "", date: "", report: "", unit: "усл.", qty: 1, price: 0 }) })
  const remove = (i: number) => set((s) => { s.items.splice(i, 1) })
  return (
    <div className="space-y-2">
      {state.items.map((it, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Позиция {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500" aria-label="Удалить позицию"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mb-1.5"><input className={inputCls} placeholder="Наименование работ (услуг)" value={it.name} onChange={(e) => set((s) => { s.items[i].name = e.target.value })} /></div>
          <div className="grid grid-cols-4 gap-1.5">
            <div><label className={labelCls}>Ед. изм.</label><input className={inputCls} value={it.unit} onChange={(e) => set((s) => { s.items[i].unit = e.target.value })} /></div>
            <div><label className={labelCls}>Кол-во</label><input type="number" className={inputCls} value={it.qty || ""} onChange={(e) => set((s) => { s.items[i].qty = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>Цена ₸</label><input type="number" className={inputCls} value={it.price || ""} onChange={(e) => set((s) => { s.items[i].price = Number(e.target.value) })} /></div>
            <div><label className={labelCls}>Сумма ₸</label><input className={`${inputCls} opacity-70`} value={money(itemSum(it))} disabled /></div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400">
        <Plus className="h-4 w-4" /> Добавить позицию
      </button>
    </div>
  )
}

export function AvrConstructor({ embedded = false, initialTenantId }: { embedded?: boolean; initialTenantId?: string } = {}) {
  const [state, setState] = useState<AvrState>(defaultAvrState)
  const [tenants, setTenants] = useState<ConstructorTenant[]>([])
  const [selTenant, setSelTenant] = useState("")
  const [period, setPeriod] = useState("")
  const [autoNumber, setAutoNum] = useState(true)
  const [notifyTenant, setNotifyTenant] = useState(true)
  const [pending, startTransition] = useTransition()

  const set = (mut: Mutator) => setState((prev) => { const n = structuredClone(prev); mut(n); return n })

  useEffect(() => { listConstructorTenants().then(setTenants).catch(() => {}) }, [])
  // Текущий месяц + дата составления (client-only — без hydration mismatch).
  useEffect(() => {
    const d = new Date()
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const iso = `${ym}-${String(d.getDate()).padStart(2, "0")}`
    /* eslint-disable react-hooks/set-state-in-effect -- client-only начальные значения (месяц/дата), иначе hydration mismatch */
    setPeriod(ym)
    setState((prev) => { if (prev.period && prev.meta.date) return prev; const n = structuredClone(prev); if (!n.period) n.period = ym; if (!n.meta.date) n.meta.date = iso; return n })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  // Автонумер при загрузке.
  const applyAutoNumber = () => { getNextActNumber().then((r) => { if (r.ok && r.number) set((s) => { s.meta.number = r.number! }) }).catch(() => {}) }
  useEffect(() => { if (autoNumber) applyAutoNumber() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Автовыбор арендатора из ?tenantId= (когда АВР открыт из карточки арендатора). Ждём и период.
  const appliedInitialTenant = useRef(false)
  useEffect(() => {
    if (appliedInitialTenant.current || !initialTenantId || !period) return
    if (!tenants.some((t) => t.id === initialTenantId)) return
    appliedInitialTenant.current = true
    onPickTenant(initialTenantId)
  }, [tenants, initialTenantId, period]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSetAutoNumber = (v: boolean) => { setAutoNum(v); if (v) applyAutoNumber() }

  function reprefill(tenantId: string, p: string) {
    if (!tenantId || !p) return
    startTransition(async () => {
      const r = await prefillAvrFromTenant(tenantId, p)
      if (r.ok && r.state) {
        setState(r.state)
        if (autoNumber) applyAutoNumber()
        toast.success("Данные подставлены из начислений за период")
      } else toast.error(r.error ?? "Не удалось подставить данные")
    })
  }
  function onPickTenant(id: string) { setSelTenant(id); reprefill(id, period) }
  function onChangePeriod(p: string) { setPeriod(p); set((s) => { s.period = p }); if (selTenant) reprefill(selTenant, p) }

  function doDownload() {
    startTransition(async () => {
      const r = await generateAvrPdf(state)
      if (!r.ok || !r.base64) { toast.error(r.error ?? "Ошибка генерации"); return }
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = r.fileName ?? "АВР.pdf"
      link.click()
      URL.revokeObjectURL(url)
    })
  }
  function doCreate() {
    if (!selTenant) { toast.error("Сначала выберите арендатора"); return }
    startTransition(async () => {
      const r = await createAvrFromBuilder(selTenant, state, { autoNumber, requestSignature: notifyTenant })
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать акт"); return }
      toast.success(`Акт № ${r.number} создан и сохранён в Документы`)
    })
  }

  const subtotal = useMemo(() => avrSubtotal(state), [state])
  const vat = useMemo(() => avrVat(state), [state])
  const total = useMemo(() => avrTotal(state), [state])

  const tenantGroups = useMemo(() => {
    const m = new Map<string, ConstructorTenant[]>()
    for (const t of tenants) { const k = t.building ?? "Без здания"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [tenants])

  return (
    <div className="space-y-6">
      {!embedded && (
      <div className="flex items-center gap-3">
        <Link href="/admin/settings" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" aria-label="Назад к настройкам"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Конструктор АВР</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Акт выполненных работ (форма Р-1). Позиции подтягиваются из начислений за выбранный месяц.</p>
        </div>
      </div>
      )}

      {/* Тулбар: арендатор + месяц + действия */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls}>Арендатор</label>
          <select className={inputCls} value={selTenant} onChange={(e) => onPickTenant(e.target.value)} disabled={pending}>
            <option value="">— выберите арендатора —</option>
            {tenantGroups.map(([building, list]) => (
              <optgroup key={building} label={building}>
                {list.map((t) => <option key={t.id} value={t.id} disabled={!t.activeContract}>{t.name}{t.activeContract ? "" : " — нет действующего договора"}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="w-[160px]">
          <label className={labelCls}>Месяц</label>
          <input type="month" className={inputCls} value={period} onChange={(e) => onChangePeriod(e.target.value)} />
        </div>
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={doDownload} disabled={pending}>PDF</Button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400" title="Прислать арендатору уведомление с просьбой подписать">
          <input type="checkbox" checked={notifyTenant} onChange={(e) => setNotifyTenant(e.target.checked)} /> уведомить на подпись
        </label>
        <Button variant="primary" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={doCreate} disabled={pending}>Создать акт</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Форма */}
        <div className="space-y-4">
          <CollapsibleCard title="Стороны" icon={Users} defaultOpen>
            <div className="p-5">
              <div className={secTitleCls}>Исполнитель (арендодатель)</div>
              <PartyFields p={state.executor} onChange={(mut) => set((s) => mut(s.executor))} />
              <div className={secTitleCls}>Заказчик (арендатор)</div>
              <PartyFields p={state.customer} onChange={(mut) => set((s) => mut(s.customer))} />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Акт, договор, период" icon={ReceiptText} defaultOpen>
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
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Договор № <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">из договора</span></label><input className={`${inputCls} disabled:opacity-60`} value={state.contractRef.number} disabled readOnly title="Подставляется автоматически из действующего договора выбранного арендатора" /></div>
                <div><label className={labelCls}>Дата договора <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">из договора</span></label><input type="date" className={`${inputCls} disabled:opacity-60`} value={state.contractRef.date} disabled readOnly title="Подставляется автоматически из действующего договора выбранного арендатора" /></div>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={state.vat.enabled} onChange={(e) => set((s) => { s.vat.enabled = e.target.checked })} /> НДС
                </label>
                <div><label className={labelCls}>Ставка НДС, %</label><input type="number" className={inputCls} value={state.vat.rate} disabled={!state.vat.enabled} onChange={(e) => set((s) => { s.vat.rate = Number(e.target.value) })} /></div>
              </div>
              <div className="mb-2"><label className={labelCls}>Сведения об использовании запасов заказчика</label><input className={inputCls} placeholder="не использовались" value={state.stocks} onChange={(e) => set((s) => { s.stocks = e.target.value })} /></div>
              <div><label className={labelCls}>Приложение: документации на N страниц</label><input type="number" className={inputCls} value={state.attachmentPages || ""} onChange={(e) => set((s) => { s.attachmentPages = Number(e.target.value) })} /></div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Позиции (работы / услуги)" icon={ListChecks} defaultOpen>
            <div className="p-5"><ItemsEditor state={state} set={set} /></div>
          </CollapsibleCard>
        </div>

        {/* Предпросмотр */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <div className="text-right text-[10px] italic text-slate-400">Приложение 50 к приказу Министра финансов РК от 20.12.2012 № 562 · Форма Р-1</div>
            <div className="mt-3 space-y-0.5">
              <div><b>Заказчик:</b> {[state.customer.name, state.customer.address, state.customer.comm].filter(Boolean).join(", ") || "—"}</div>
              <div><b>Исполнитель:</b> {[state.executor.name, state.executor.address, state.executor.comm].filter(Boolean).join(", ") || "—"}</div>
              <div className="text-xs text-slate-500">ИИН/БИН исполнителя: {state.executor.binIin || "—"} · заказчика: {state.customer.binIin || "—"}</div>
              <div className="text-xs"><b>Договор:</b> № {state.contractRef.number || "—"}{state.contractRef.date ? ` от ${dateLong(state.contractRef.date)}` : ""} · № док. {state.meta.number || "—"} · {state.meta.date ? dateLong(state.meta.date) : "—"}</div>
            </div>
            <div className="mt-4 text-center text-sm font-bold">АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)</div>
            <div className="mb-3 text-center text-xs text-slate-500">за {periodLabel(state.period)}</div>

            <table className="w-full border-collapse text-[10.5px]">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  {[
                    { t: "№", title: "Номер по порядку" },
                    { t: "Наименование", title: "Наименование работ (услуг)" },
                    { t: "Дата", title: "Дата выполнения работ (оказания услуг)" },
                    { t: "Отчёт", title: "Сведения об отчёте (при наличии)" },
                    { t: "Ед.", title: "Единица измерения" },
                  ].map((h) => (
                    <th key={h.t} rowSpan={2} title={h.title} className="border border-slate-300 px-1.5 py-1 text-left align-middle font-semibold dark:border-slate-700">{h.t}</th>
                  ))}
                  <th colSpan={3} className="border border-slate-300 px-1.5 py-1 text-center font-semibold dark:border-slate-700">Выполнено работ (оказано услуг)</th>
                </tr>
                <tr>
                  {["Кол-во", "Цена", "Стоимость"].map((h) => (
                    <th key={h} className="border border-slate-300 px-1.5 py-1 text-center font-semibold dark:border-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.items.length === 0 && (
                  <tr><td colSpan={8} className="border border-slate-300 px-2 py-3 text-center text-slate-400 dark:border-slate-700">Нет позиций — добавьте слева или выберите арендатора с начислениями</td></tr>
                )}
                {state.items.map((it, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{i + 1}</td>
                    <td className="border border-slate-300 px-1.5 py-1 dark:border-slate-700">{it.name || "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.date || "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.report || "—"}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.unit}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center dark:border-slate-700">{it.qty}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(it.price)}</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right dark:border-slate-700">{money(itemSum(it))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 space-y-0.5 text-right text-xs">
              <div>Итого: <b>{money(subtotal)}</b></div>
              {state.vat.enabled && <div>в т.ч. НДС {state.vat.rate}%: {money(vat)}</div>}
              <div className="text-sm">Всего: <b>{moneyWithWords(total)}</b></div>
            </div>

            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">Сведения о запасах заказчика: {state.stocks || "не использовались"}. Приложение: документации на {state.attachmentPages || 0} стр.</div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div><b>Сдал (Исполнитель):</b><div className="mt-2 text-slate-500">___________ /{state.executor.signatory || "________"}/ М.П.</div></div>
              <div><b>Принял (Заказчик):</b><div className="mt-2 text-slate-500">___________ /{state.customer.signatory || "________"}/ М.П.</div></div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-300 p-2.5 dark:border-slate-700">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-slate-300 text-[10px] font-bold text-slate-300 dark:border-slate-700">QR</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                <div className="font-semibold text-slate-700 dark:text-slate-200">Отметка о подписании ЭЦП (НУЦ РК)</div>
                Проверка подлинности — по QR-коду: commrent.kz/verify/…
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
