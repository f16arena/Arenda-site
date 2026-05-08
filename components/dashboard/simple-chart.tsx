// Простые inline SVG графики для дашборда — без сторонних зависимостей.
// Используются на /admin/dashboard/owner.

export type Series = {
  label: string
  value: number
  color?: string
}

export type MultiSeries = {
  label: string
  values: { value: number; color?: string; legend?: string }[]
}

const DEFAULT_BAR_COLOR = "#3b82f6"

function fmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}

export function BarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: Series[]
  height?: number
  formatValue?: (v: number) => string
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400 dark:text-slate-500" style={{ height }}>
        Нет данных
      </div>
    )
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  const barWidth = 100 / data.length
  const formatter = formatValue ?? fmt
  return (
    <div className="w-full">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24)
          return (
            <g key={i}>
              <rect
                x={i * barWidth + barWidth * 0.15}
                y={height - h - 18}
                width={barWidth * 0.7}
                height={Math.max(h, 0.5)}
                fill={d.color ?? DEFAULT_BAR_COLOR}
                rx="0.5"
              >
                <title>{`${d.label}: ${formatter(d.value)}`}</title>
              </rect>
              <text
                x={i * barWidth + barWidth / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400"
                style={{ fontSize: 5 }}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Сгруппированные столбики (revenue / expenses / profit)
export function GroupedBarChart({
  data,
  height = 200,
  legend,
}: {
  data: MultiSeries[]
  height?: number
  legend?: { color: string; label: string }[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400 dark:text-slate-500" style={{ height }}>
        Нет данных
      </div>
    )
  }
  const groupCount = data.length
  const seriesCount = data[0]?.values.length ?? 1
  const max = Math.max(...data.flatMap((d) => d.values.map((v) => v.value)), 1)
  const groupWidth = 100 / groupCount
  const innerPad = groupWidth * 0.15
  const slotWidth = (groupWidth - innerPad * 2) / seriesCount

  return (
    <div className="w-full space-y-2">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((g, gi) => (
          <g key={gi}>
            {g.values.map((v, vi) => {
              const h = (Math.max(v.value, 0) / max) * (height - 24)
              return (
                <rect
                  key={vi}
                  x={gi * groupWidth + innerPad + vi * slotWidth + slotWidth * 0.05}
                  y={height - h - 18}
                  width={slotWidth * 0.9}
                  height={Math.max(h, 0.5)}
                  fill={v.color ?? DEFAULT_BAR_COLOR}
                  rx="0.4"
                >
                  <title>{`${g.label}${v.legend ? ` · ${v.legend}` : ""}: ${fmt(v.value)}`}</title>
                </rect>
              )
            })}
            <text
              x={gi * groupWidth + groupWidth / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400"
              style={{ fontSize: 4.5 }}
            >
              {g.label}
            </text>
          </g>
        ))}
      </svg>
      {legend && legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function LineChart({
  data,
  height = 160,
  color = "#3b82f6",
}: {
  data: Series[]
  height?: number
  color?: string
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400 dark:text-slate-500" style={{ height }}>
        Нет данных
      </div>
    )
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  const range = max - min || 1
  const stepX = data.length > 1 ? 100 / (data.length - 1) : 0
  const points = data
    .map((d, i) => {
      const x = i * stepX
      const y = height - 18 - ((d.value - min) / range) * (height - 24)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <div className="w-full">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="0.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => {
          const x = i * stepX
          const y = height - 18 - ((d.value - min) / range) * (height - 24)
          return (
            <circle key={i} cx={x} cy={y} r="0.8" fill={color}>
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
            </circle>
          )
        })}
        {data.map((d, i) => (
          <text
            key={`t-${i}`}
            x={i * stepX}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            className="fill-slate-500 dark:fill-slate-400"
            style={{ fontSize: 5 }}
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

// «Термометр» — горизонтальная шкала заполняемости
export function GaugeBar({
  percent,
  label,
  sub,
}: {
  percent: number
  label?: string
  sub?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const color = clamped >= 80 ? "#10b981" : clamped >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
          <span className="text-xs font-bold tabular-nums" style={{ color }}>
            {clamped}%
          </span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  )
}
