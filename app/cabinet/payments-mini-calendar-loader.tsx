"use client"

import dynamic from "next/dynamic"

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
  charges,
  payments,
  paymentDueDay,
}: {
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
  paymentDueDay: number
}) {
  return <PaymentsMiniCalendar charges={charges} payments={payments} paymentDueDay={paymentDueDay} />
}
