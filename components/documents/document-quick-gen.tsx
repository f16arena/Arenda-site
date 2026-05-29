"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Download, Send, Loader2 } from "lucide-react"
import { sendDocumentToTenant } from "@/app/actions/send-document"
import type { DocumentTenantOption } from "@/lib/document-tenants"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"

/**
 * Быстрая генерация счёта на оплату / акта сверки (пока без полноценного конструктора).
 * Счёт — скачать DOCX за месяц / отправить арендатору. Сверка — открыть страницу за период.
 */
export function DocumentQuickGen({ kind, tenants, initialTenantId }: { kind: "invoice" | "reconciliation"; tenants: DocumentTenantOption[]; initialTenantId?: string }) {
  const router = useRouter()
  const [tenantId, setTenantId] = useState(initialTenantId && tenants.some((t) => t.id === initialTenantId) ? initialTenantId : "")
  const [period, setPeriod] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [pending, setPending] = useState(false)

  // Текущий период/год — только на клиенте (без hydration mismatch).
  useEffect(() => {
    const d = new Date()
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    /* eslint-disable react-hooks/set-state-in-effect -- client-only начальные даты, иначе hydration mismatch */
    setPeriod((p) => p || ym)
    setFrom((f) => f || `${d.getFullYear()}-01`)
    setTo((t) => t || `${d.getFullYear()}-12`)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  async function downloadInvoice() {
    if (!tenantId) { toast.error("Выберите арендатора"); return }
    setPending(true)
    try {
      const res = await fetch(`/api/invoices/generate?tenantId=${encodeURIComponent(tenantId)}&period=${period}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Не удалось создать счёт" }))
        toast.error(err.error || "Не удалось создать счёт")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const disp = res.headers.get("Content-Disposition") ?? ""
      const m = disp.match(/filename\*=UTF-8''([^;]+)/i)
      a.download = m ? decodeURIComponent(m[1]) : `Счёт_${period}.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Счёт создан и скачан")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setPending(false)
    }
  }

  async function sendInvoice() {
    if (!tenantId) { toast.error("Выберите арендатора"); return }
    setPending(true)
    try {
      const r = await sendDocumentToTenant({ tenantId, type: "INVOICE", period })
      if (r.ok) { toast.success("Счёт отправлен арендатору в кабинет"); router.refresh() }
      else toast.error(r.error ?? "Не удалось отправить")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setPending(false)
    }
  }

  function openReconciliation() {
    if (!tenantId) { toast.error("Выберите арендатора"); return }
    router.push(`/admin/documents/new/reconciliation?tenantId=${encodeURIComponent(tenantId)}&from=${from}&to=${to}`)
  }

  const title = kind === "invoice" ? "Счёт на оплату" : "Акт сверки"
  const hint = kind === "invoice"
    ? "DOCX за выбранный месяц. Можно сразу отправить арендатору в кабинет."
    : "Открывается страница сверки за период для предпросмотра и печати."

  return (
    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mb-4 mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      <div className="mb-3">
        <label className={labelCls}>Арендатор</label>
        <select className={inputCls} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">— выберите —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.companyName}{t.spaceNumber ? ` · Каб. ${t.spaceNumber}` : ""}</option>
          ))}
        </select>
      </div>

      {kind === "invoice" ? (
        <>
          <div className="mb-4 w-44">
            <label className={labelCls}>Месяц</label>
            <input type="month" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadInvoice} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Скачать DOCX
            </button>
            <button type="button" onClick={sendInvoice} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              <Send className="h-4 w-4" /> Отправить арендатору
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-end gap-2">
            <div><label className={labelCls}>С</label><input type="month" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <span className="pb-2 text-slate-400">—</span>
            <div><label className={labelCls}>По</label><input type="month" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <button type="button" onClick={openReconciliation} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Открыть →
          </button>
        </>
      )}
    </div>
  )
}
