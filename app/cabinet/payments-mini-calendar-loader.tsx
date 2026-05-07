"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const PaymentsMiniCalendar = dynamic(
  () => import("./payments-mini-calendar").then((mod) => mod.PaymentsMiniCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
    ),
  },
)

export function PaymentsMiniCalendarLoader({
  paymentDueDay,
}: {
  paymentDueDay: number
}) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    charges: Array<{
      id: string
      amount: number
      type: string
      period: string
      isPaid: boolean
      dueDate: string | null
    }>
    payments: Array<{
      id: string
      amount: number
      paymentDate: string
    }>
  }>({ loading: true, error: null, charges: [], payments: [] })

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/cabinet/payment-calendar", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить календарь платежей")
        return response.json()
      })
      .then((payload) => {
        setState({
          loading: false,
          error: null,
          charges: Array.isArray(payload.charges) ? payload.charges : [],
          payments: Array.isArray(payload.payments) ? payload.payments : [],
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить календарь платежей",
          charges: [],
          payments: [],
        })
      })

    return () => controller.abort()
  }, [])

  if (state.loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
    )
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {state.error}
      </div>
    )
  }

  return <PaymentsMiniCalendar charges={state.charges} payments={state.payments} paymentDueDay={paymentDueDay} />
}
