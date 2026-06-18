"use client"

import { useEffect, useRef, useState } from "react"
import { QrCode, Smartphone, Loader2, Check } from "lucide-react"

/**
 * Подписание договора через eGov Mobile по QR / диплинку (официальный протокол NITEC).
 * Телефон сканирует QR `mobileSign:<API №1>` → получает документ → подписывает ЭЦП →
 * присылает подпись на наш API №2 (PUT). Здесь же опрашиваем статус и зовём onSigned().
 */
export function EgovQrSign({
  api1Url,
  token,
  onSigned,
}: {
  api1Url: string
  token: string
  onSigned?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [signed, setSigned] = useState(false)
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  const qrContent = `mobileSign:${api1Url}`
  const linkParam = encodeURIComponent(api1Url)
  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const deeplink = isIos
    ? `https://mgovsign.page.link/?link=${linkParam}&isi=1476128386&ibi=kz.egov.mobile`
    : `https://mgovsign.page.link/?link=${linkParam}&apn=kz.mobile.mgov`

  // Генерируем QR при открытии (динамический импорт, чтобы не тащить в бандл).
  useEffect(() => {
    if (!open || qrDataUrl) return
    let cancelled = false
    import("qrcode")
      .then((m) => m.default.toDataURL(qrContent, { margin: 1, width: 240 }))
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, qrDataUrl, qrContent])

  // Опрос статуса подписания.
  useEffect(() => {
    if (!open || signed) return
    polling.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/egov-sign/${token}/status`, { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (data?.signedByTenant) {
          setSigned(true)
          onSigned?.()
        }
      } catch {}
    }, 3000)
    return () => { if (polling.current) clearInterval(polling.current) }
  }, [open, signed, token, onSigned])

  if (signed) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-emerald-900">Подписано через eGov Mobile</p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
      >
        <Smartphone className="h-4 w-4" />
        Подписать телефоном (eGov Mobile)
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-blue-600" />
        <p className="text-sm font-semibold text-slate-900">Подпись через eGov Mobile</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="QR для подписи в eGov Mobile" width={240} height={240} />
        ) : (
          <div className="flex h-[240px] w-[240px] items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        <p className="text-xs text-slate-500 text-center max-w-xs">
          Откройте eGov Mobile → «Подписать по QR» и отсканируйте код. После подписи статус обновится автоматически.
        </p>
      </div>
      <a
        href={deeplink}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 sm:hidden"
      >
        <Smartphone className="h-4 w-4" />
        Открыть в eGov Mobile (на этом телефоне)
      </a>
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Ожидаем подпись…
      </div>
    </div>
  )
}
