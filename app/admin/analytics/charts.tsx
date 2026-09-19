"use client"

// Лёгкие SVG-графики для отчёта владельца — без внешних зависимостей,
// в стиле проекта (как occupancy-heatmap). Тема-aware через currentColor/палитру.

import { useId } from "react"

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#64748b"]

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)} млн`
  if (a >= 1_000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}
function fmtFull(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₸"
}

// ──────────── Водопад: Доход → −Расход → −Налог → Прибыль ────────────

export function Waterfall({
  income,
  expense,
  tax,
  net,
}: {
  income: number
  expense: number
  tax: number
  net: number
}) {
  const W = 520
  const H = 240
  const padT = 24
  const padB = 44
  const innerH = H - padT - padB
  const maxV = Math.max(income, expense + tax + Math.max(net, 0), 1)
  const y = (v: number) => padT + innerH - (v / maxV) * innerH

  // top/bottom — границы столбца; end — накопленный итог после столбца (для коннектора).
  const cols = [
    { key: "income", label: "Доход", color: "#10b981", top: income, bottom: 0, value: income, end: income },
    { key: "expense", label: "Расход", color: "#ef4444", top: income, bottom: income - expense, value: -expense, end: income - expense },
    { key: "tax", label: "Налог", color: "#f59e0b", top: income - expense, bottom: net, value: -tax, end: net },
    { key: "net", label: "Прибыль", color: net >= 0 ? "#3b82f6" : "#ef4444", top: Math.max(net, 0), bottom: Math.min(net, 0), value: net, end: net },
  ]

  const slot = W / cols.length
  const barW = Math.min(74, slot * 0.5)

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full min-w-[420px]">
        {/* базовая линия 0 */}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth={1} />
        {cols.map((c, i) => {
          const cx = slot * i + slot / 2
          const yTop = y(Math.max(c.top, c.bottom))
          const yBot = y(Math.min(c.top, c.bottom))
          const h = Math.max(2, yBot - yTop)
          const next = cols[i + 1]
          return (
            <g key={c.key}>
              {/* пунктирный коннектор к следующему столбцу (уровень переноса) */}
              {next && (
                <line
                  x1={cx + barW / 2}
                  x2={slot * (i + 1) + slot / 2 - barW / 2}
                  y1={y(c.end)}
                  y2={y(c.end)}
                  stroke="currentColor"
                  className="text-slate-300 dark:text-slate-600"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
              <rect x={cx - barW / 2} y={yTop} width={barW} height={h} rx={3} fill={c.color}>
                <title>{`${c.label}: ${fmtFull(Math.abs(c.value))}`}</title>
              </rect>
              {/* сумма над столбцом */}
              <text x={cx} y={yTop - 6} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200" fontSize={12} fontWeight={600}>
                {c.value < 0 ? "−" : ""}{fmtCompact(Math.abs(c.value))}
              </text>
              {/* подпись снизу */}
              <text x={cx} y={H - 22} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={11}>
                {c.label}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize={10}>
                {fmtFull(Math.abs(c.value))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ───────────────────────── Пончик (структура) ─────────────────────────

export function Donut({ items, empty }: { items: { label: string; amount: number }[]; empty?: string }) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  if (total <= 0) {
    return <div className="flex h-[180px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">{empty ?? "Нет данных за период"}</div>
  }
  const R = 70
  const STROKE = 28
  const C = 2 * Math.PI * R
  // Накопительные смещения без мутации в рендере (react-hooks/immutability):
  // offset i-го сегмента = сумма долей предыдущих.
  const fracs = items.map((it) => it.amount / total)
  const segs = items.map((it, i) => {
    const frac = fracs[i]
    const offsetFrac = fracs.slice(0, i).reduce((s, f) => s + f, 0)
    return { ...it, color: PALETTE[i % PALETTE.length], dash: frac * C, offset: offsetFrac * C, pct: Math.round(frac * 100) }
  })
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 180 180" className="h-[160px] w-[160px] shrink-0 -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-slate-100 dark:text-slate-800" />
        {segs.map((s) => (
          <circle
            key={s.label}
            cx="90"
            cy="90"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <ul className="w-full space-y-1.5">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">{fmtFull(s.amount)}</span>
            <span className="w-9 text-right tabular-nums text-slate-400 dark:text-slate-500">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ──────────────── Доход vs расход по месяцам + линия прибыли ────────────────

export function IncomeExpenseChart({
  months,
}: {
  months: { label: string; income: number; expense: number; net: number }[]
}) {
  const gid = useId()
  const W = 720
  const H = 240
  const padL = 8
  const padR = 8
  const padT = 16
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)))
  const minNet = Math.min(0, ...months.map((m) => m.net))
  const maxNet = Math.max(0, ...months.map((m) => m.net))
  const netRange = Math.max(1, maxNet - minNet)

  const slot = innerW / months.length
  const barW = Math.min(18, slot / 3)
  const y = (v: number) => padT + innerH - (v / maxVal) * innerH
  const netY = (v: number) => padT + innerH - ((v - minNet) / netRange) * innerH

  const netPts = months.map((m, i) => `${padL + slot * i + slot / 2},${netY(m.net)}`).join(" ")

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full min-w-[560px]">
        {/* сетка */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={padT + innerH * t} y2={padT + innerH * t} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth={1} />
            <text x={padL} y={padT + innerH * t - 3} className="fill-slate-400 dark:fill-slate-500" fontSize={9}>
              {fmtCompact(maxVal * (1 - t))}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = padL + slot * i + slot / 2
          return (
            <g key={i}>
              <rect x={cx - barW - 1} y={y(m.income)} width={barW} height={padT + innerH - y(m.income)} rx={2} fill="#10b981">
                <title>{`${m.label} · доход ${fmtFull(m.income)}`}</title>
              </rect>
              <rect x={cx + 1} y={y(m.expense)} width={barW} height={padT + innerH - y(m.expense)} rx={2} fill="#ef4444">
                <title>{`${m.label} · расход ${fmtFull(m.expense)}`}</title>
              </rect>
              <text x={cx} y={H - 9} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={9}>
                {m.label}
              </text>
            </g>
          )
        })}
        {/* линия чистой прибыли */}
        <polyline points={netPts} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {months.map((m, i) => (
          <circle key={i} cx={padL + slot * i + slot / 2} cy={netY(m.net)} r={2.5} fill="#3b82f6">
            <title>{`${m.label} · прибыль ${fmtFull(m.net)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Доход</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />Расход</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-blue-500" />Чистая прибыль</span>
        <span className="ml-auto text-slate-400 dark:text-slate-500" id={gid}>Налог уже вычтен из прибыли</span>
      </div>
    </div>
  )
}
