"use client"

import { useReportWebVitals } from "next/web-vitals"

type MetricPayload = {
  id: string
  name: string
  value: number
  rating?: string
  delta?: number
  navigationType?: string
  path: string
  url: string
}

const TRACKED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"])

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") return
    if (!TRACKED_METRICS.has(metric.name)) return

    const payload: MetricPayload = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: "rating" in metric ? metric.rating : undefined,
      delta: "delta" in metric ? metric.delta : undefined,
      navigationType: "navigationType" in metric ? metric.navigationType : undefined,
      path: window.location.pathname,
      url: window.location.href,
    }

    const body = JSON.stringify(payload)
    const blob = new Blob([body], { type: "application/json" })
    if (navigator.sendBeacon?.("/api/web-vitals", blob)) return

    fetch("/api/web-vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined)
  })

  return null
}
