"use client"

// ADR: Карточка-форма заявки для СВОБОДНОГО помещения в публичной витрине (Showcase).
// Тёмный glassmorphism на дизайн-токенах (lib/builder/materials.ts TOKENS). Вызывает
// серверный action submitBuilderLead (без auth — витрина публичная). После успеха
// показывает подтверждение «Заявка отправлена».

import { useState, type FormEvent } from "react"
import { TOKENS } from "@/lib/builder/materials"
import { submitBuilderLead } from "@/app/actions/builder-premise"

export type ShowcaseLeadProps = {
  token?: string
  premiseNumber?: string
  areaM2?: number | null
  rate?: number | null
  onClose?: () => void
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)
}

export function ShowcaseLead({ token, premiseNumber, areaM2, rate, onClose }: ShowcaseLeadProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === "sending") return
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName || !trimmedPhone) {
      setState("error")
      return
    }
    setState("sending")
    try {
      const res = await submitBuilderLead({
        token,
        premiseNumber,
        name: trimmedName,
        phone: trimmedPhone,
        message: message.trim() || undefined,
      })
      setState(res.ok ? "done" : "error")
    } catch {
      setState("error")
    }
  }

  const panelStyle: React.CSSProperties = {
    background: TOKENS.panel,
    border: `1px solid ${TOKENS.panelBorder}`,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    color: TOKENS.text,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${TOKENS.panelBorder}`,
    color: TOKENS.text,
  }

  return (
    <div className="w-full max-w-sm rounded-2xl p-5" style={panelStyle}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: TOKENS.text }}>
            {premiseNumber ? `Помещение № ${premiseNumber}` : "Свободное помещение"}
          </h3>
          {(areaM2 != null || rate != null) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: TOKENS.muted }}>
              {areaM2 != null && (
                <span>
                  Площадь:{" "}
                  <span style={{ color: TOKENS.text }}>{formatMoney(areaM2)} м²</span>
                </span>
              )}
              {rate != null && (
                <span>
                  Ставка:{" "}
                  <span style={{ color: TOKENS.accent }}>{formatMoney(rate)} ₸/мес</span>
                </span>
              )}
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg px-2 py-1 text-lg leading-none transition-colors"
            style={{ color: TOKENS.muted }}
          >
            ×
          </button>
        )}
      </div>

      {state === "done" ? (
        <div className="rounded-xl px-4 py-6 text-center">
          <div className="mb-2 text-2xl" style={{ color: TOKENS.success }}>
            ✓
          </div>
          <p className="text-sm font-medium" style={{ color: TOKENS.text }}>
            Заявка отправлена
          </p>
          <p className="mt-1 text-xs" style={{ color: TOKENS.muted }}>
            Мы свяжемся с вами в ближайшее время.
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: TOKENS.accent, color: TOKENS.background }}
            >
              Готово
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: TOKENS.muted }}>Ваше имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              required
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: TOKENS.muted }}>Телефон</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              autoComplete="tel"
              placeholder="+7 ___ ___ __ __"
              required
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: TOKENS.muted }}>Сообщение</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={3}
              className="resize-none rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
            />
          </label>

          {state === "error" && (
            <p className="text-xs" style={{ color: TOKENS.danger }}>
              Укажите имя и телефон, затем попробуйте ещё раз.
            </p>
          )}

          <button
            type="submit"
            disabled={state === "sending"}
            className="mt-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: TOKENS.accent, color: TOKENS.background }}
          >
            {state === "sending" ? "Отправка…" : "Оставить заявку"}
          </button>
        </form>
      )}
    </div>
  )
}

export default ShowcaseLead
