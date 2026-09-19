"use client"

// Выбор карточки помещения / арендатора в панели свойств конструктора.
// Раньше был системный <select>: белый список со светлым текстом (не читался),
// «4 эт» вместо «Крыша», «0 м²» у антенн. Теперь — раскрывающийся список в
// стиле панели, с поиском и разделами «этаж / крыша / территория».

import { useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { TOKENS } from "@/lib/builder/materials"

export type PickerItem = {
  id: string
  title: string
  /** Раздел списка: «2 этаж», «Крыша», «Территория», «Без места» */
  group: string
  /** Серый текст справа (площадь, номер места) */
  meta?: string
  /** Кто занимает — или null = свободно */
  who?: string | null
}

export function PremisePicker({
  label,
  items,
  value,
  onChange,
  emptyLabel = "Не выбрано",
  showFree = true,
  allowClear = true,
}: {
  label: string
  items: PickerItem[]
  value: string | null
  onChange: (id: string | null) => void
  emptyLabel?: string
  /** Подписывать «свободно» у позиций без занявшего */
  showFree?: boolean
  /** Пункт «Отвязать» */
  allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const current = items.find((i) => i.id === value) ?? null

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? items.filter((i) => `${i.title} ${i.who ?? ""} ${i.group}`.toLowerCase().includes(needle))
      : items
    const map = new Map<string, PickerItem[]>()
    for (const i of list) map.set(i.group, [...(map.get(i.group) ?? []), i])
    return [...map.entries()]
  }, [items, q])

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
    setQ("")
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
        style={{ background: "rgba(148,163,184,0.08)", border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <>
              <span className="font-medium">{current.title}</span>
              {current.who && <span style={{ color: TOKENS.muted }}> · {current.who}</span>}
            </>
          ) : (
            <span style={{ color: TOKENS.muted }}>{emptyLabel}</span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} style={{ color: TOKENS.muted }} />
      </button>

      {open && (
        <div className="overflow-hidden rounded-md" style={{ background: "rgba(15,23,42,0.96)", border: `1px solid ${TOKENS.panelBorder}` }}>
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: TOKENS.panelBorder }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: TOKENS.muted }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск: номер или название"
              className="w-full bg-transparent text-xs outline-none"
              style={{ color: TOKENS.text }}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); e.stopPropagation() }}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {value && allowClear && (
              <button type="button" onClick={() => pick(null)} className="w-full px-2 py-1.5 text-left text-xs hover:bg-white/5" style={{ color: "#fca5a5" }}>
                Отвязать
              </button>
            )}
            {groups.length === 0 && <p className="px-2 py-3 text-center text-xs" style={{ color: TOKENS.muted }}>Ничего не найдено</p>}
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TOKENS.muted }}>{group}</p>
                {list.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => pick(i.id)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/5"
                    style={{ background: i.id === value ? "rgba(56,189,248,0.14)" : undefined, color: TOKENS.text }}
                  >
                    <span className="shrink-0 font-medium">{i.title}</span>
                    {i.meta && <span className="shrink-0" style={{ color: TOKENS.muted }}>{i.meta}</span>}
                    <span className="min-w-0 flex-1 truncate text-right" style={{ color: i.who ? TOKENS.muted : "#6ee7b7" }}>
                      {i.who ?? (showFree ? "свободно" : "")}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Карточки помещений → позиции списка (номер, площадь, раздел, кто занимает). */
export function premiseItems(rows: Iterable<{ id: string; number: string; floorNumber: number; floorLabel?: string; areaM2: number | null; tenantName: string | null }>): PickerItem[] {
  return Array.from(rows).map((p) => ({
    id: p.id,
    title: `№ ${p.number}`,
    group: p.floorLabel ?? `${p.floorNumber} этаж`,
    meta: p.areaM2 && p.areaM2 > 0 ? `${p.areaM2} м²` : undefined,
    who: p.tenantName,
  }))
}
