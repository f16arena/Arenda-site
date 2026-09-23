"use client"

// Подписи поверх сцены: длины стен (как размерные цепочки в CAD) и помещения
// с номером карточки и арендатором. Рисуются div-ами по экранным координатам,
// которые каждый кадр отдаёт движок (store/label-store).

import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { hourLabel } from "@/lib/builder/daylight"
import { useLabelStore } from "@/store/label-store"
import { usePremiseStore } from "@/store/premise-store"
import { findFloor } from "@/core/document/commands"
import { TOKENS } from "@/lib/builder/materials"
import { shortTenantName } from "@/lib/indoor-map/display-name"
import { useT } from "@/lib/i18n/client"

export function LabelLayer() {
  const { t } = useT()
  const labels = useLabelStore((s) => s.labels)
  const showDimensions = useLabelStore((s) => s.showDimensions)
  const toggleDimensions = useLabelStore((s) => s.toggleDimensions)
  const showTenants = useLabelStore((s) => s.showTenants)
  const showFurniture = useLabelStore((s) => s.showFurniture)
  const hourOfDay = useLabelStore((s) => s.hourOfDay)
  const setHourOfDay = useLabelStore((s) => s.setHourOfDay)
  const toggleFurniture = useLabelStore((s) => s.toggleFurniture)
  const toggleTenants = useLabelStore((s) => s.toggleTenants)
  const doc = useDocumentStore((s) => s.doc)
  const selection = useEditorStore((s) => s.selection)
  const resolvePremise = usePremiseStore((s) => s.resolve)
  const freeText = t("adminBuilder.labels.free")

  // Подписи не должны лезть друг на друга: на маленькой комнате размеры стен
  // закрывали площадь. Порядок важности: выбранная стена → помещения → размеры.
  // Кто не влез — не рисуется; при зуме место появляется, и подпись возвращается.
  const taken: Array<{ l: number; t: number; r: number; b: number }> = []
  const fits = (x: number, y: number, w: number, h: number) => {
    const box = { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 }
    if (taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) return false
    taken.push(box)
    return true
  }
  const selectedWall = selection.type === "wall" ? selection.id : undefined
  const ordered = [
    ...labels.filter((l) => l.kind === "wall" && l.id === selectedWall),
    ...labels.filter((l) => l.kind === "note"),
    ...labels.filter((l) => l.kind === "room"),
    ...labels.filter((l) => l.kind === "wall" && l.id !== selectedWall && showDimensions),
  ]
  const placeable = ordered.filter((l) => {
    if (l.kind === "wall") return fits(l.x, l.y, 38, 16)
    if (l.kind === "note") return true // пометки ставит инженер — не прячем
    const floor = findFloor(doc, l.floorId)
    const key = floor?.premiseLinks[l.id]
    const premise = key ? resolvePremise(key) : undefined
    const text = premise ? `№ ${premise.number} · ${premise.tenantName ?? freeText}` : `${(l.areaMm2 / 1_000_000).toFixed(1)} м²`
    return fits(l.x, l.y, Math.min(260, text.length * 6.2 + 14), 20)
  })

  return (
    <>
      {/* переключатели вида одним блоком: раньше «Арендаторы» и «Мебель»
          налезали на панель свойств */}
      <div className="absolute right-3 top-[7.4rem] z-30 flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {([
            [t("adminBuilder.labels.dimensions"), showDimensions, toggleDimensions, t("adminBuilder.labels.dimensionsHint")],
            [t("adminBuilder.labels.tenants"), showTenants, toggleTenants, t("adminBuilder.labels.tenantsHint")],
            [t("adminBuilder.labels.furniture"), showFurniture, toggleFurniture, t("adminBuilder.labels.furnitureHint")],
          ] as Array<[string, boolean, () => void, string]>).map(([label, on, toggle, hint]) => (
            <button
              key={label}
              type="button"
              onClick={toggle}
              title={hint}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold shadow"
              style={{ background: on ? TOKENS.accent : TOKENS.panel, color: on ? "#0b1220" : TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-2 py-1 shadow"
          style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
          title={t("adminBuilder.labels.sunHint")}
        >
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: TOKENS.text }}>
            {t("adminBuilder.app.sun", { time: hourLabel(hourOfDay) })}
          </span>
          <input
            type="range"
            min={5}
            max={21}
            step={0.5}
            value={hourOfDay}
            onChange={(e) => setHourOfDay(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer accent-sky-400"
            aria-label={t("adminBuilder.app.timeOfDay")}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 select-none">
        {placeable.map((label) => {
          if (label.kind === "wall") {
            // размер на стене: всегда у выбранной, у остальных — по тумблеру
            const selected = selection.type === "wall" && selection.id === label.id
            return (
              <div
                key={`w-${label.id}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 text-[10px] font-semibold tabular-nums"
                style={{
                  left: label.x,
                  top: label.y,
                  background: selected ? TOKENS.accent : "rgba(15,23,42,0.72)",
                  color: selected ? "#0b1220" : "#e2e8f0",
                }}
              >
                {(label.lengthMm / 1000).toFixed(2)}
              </div>
            )
          }
          if (label.kind === "note") {
            const selected = selection.type === "annotation" && selection.id === label.id
            return (
              <div
                key={`n-${label.id}`}
                className="absolute whitespace-nowrap rounded px-1 text-[11px] font-semibold tabular-nums"
                style={{
                  left: label.x,
                  top: label.y,
                  transform: `translate(-50%, -50%) rotate(${-label.angleDeg}deg) translateY(${label.dim ? "-9px" : "0"})`,
                  background: selected ? TOKENS.accent : label.dim ? "rgba(224,242,254,0.95)" : "rgba(255,255,255,0.95)",
                  color: selected ? "#0b1220" : label.dim ? "#0369a1" : "#0f172a",
                  border: label.dim ? "none" : "1px solid #94a3b8",
                }}
              >
                {label.text}
              </div>
            )
          }
          const floor = findFloor(doc, label.floorId)
          const key = floor?.premiseLinks[label.id]
          const premise = key ? resolvePremise(key) : undefined
          // «Арендаторы» выключены — остаётся номер и площадь, без имён и статусов
          const title = premise && showTenants
            ? `№ ${premise.number}${premise.tenantName ? ` · ${shortTenantName(premise.tenantName)}` : ` · ${freeText}`}`
            : premise
              ? `№ ${premise.number} · ${(label.areaMm2 / 1_000_000).toFixed(1)} м²`
              : `${(label.areaMm2 / 1_000_000).toFixed(1)} м²`
          return (
            <div
              key={`r-${label.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow"
              style={{
                left: label.x,
                top: label.y,
                background: "rgba(255,255,255,0.92)",
                color: premise ? "#0f172a" : "#64748b",
              }}
            >
              {title}
            </div>
          )
        })}
      </div>
    </>
  )
}
