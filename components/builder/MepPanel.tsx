"use client"

// Нижняя панель режима «Сети»: слои систем (видимость), спецификация активного
// этажа и ссылка на лист сетей. Вместо каталога мебели.

import { useMemo, useState } from "react"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { findFloor } from "@/core/document/commands"
import { MEP_SYSTEMS } from "@/types/builder"
import { MEP_SYSTEM_INFO } from "@/lib/builder/mep/catalog"
import { mepSpec } from "@/lib/builder/mep/spec"
import { TOKENS } from "@/lib/builder/materials"
import { useT } from "@/lib/i18n/client"

function fmtQty(q: number, unit: "pcs" | "m"): string {
  return unit === "m" ? q.toFixed(1).replace(".", ",") : String(q)
}

export function MepPanel({ buildingId }: { buildingId?: string }) {
  const { t } = useT()
  const doc = useDocumentStore((s) => s.doc)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const layers = useEditorStore((s) => s.mepLayers)
  const toggle = useEditorStore((s) => s.toggleMepLayer)
  const setLayers = useEditorStore((s) => s.setMepLayers)
  const setSystem = useEditorStore((s) => s.setMepSystem)
  const [open, setOpen] = useState(true)
  const floor = activeLevelId && activeLevelId !== "site" ? findFloor(doc, activeLevelId) : undefined
  const spec = useMemo(() => (floor ? mepSpec(floor, t) : []), [floor, t])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-9 left-1/2 z-20 -translate-x-1/2 rounded-xl px-3 py-1.5 text-[11px] font-medium shadow-xl backdrop-blur-xl"
        style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
      >
        {t("adminBuilder.mepPanel.collapsed")}
      </button>
    )
  }

  return (
    <div
      className="absolute bottom-9 left-1/2 z-20 flex max-h-[30vh] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 overflow-hidden rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
      data-testid="mep-panel"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOpen(false)} title={t("adminBuilder.mepPanel.collapse")} className="rounded-lg px-2 py-1 text-[11px]" style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.muted }}>▾</button>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: TOKENS.muted }}>{t("adminBuilder.mepPanel.layers")}</span>
        {MEP_SYSTEMS.map((s) => {
          const info = MEP_SYSTEM_INFO[s]
          const on = layers.includes(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              onDoubleClick={() => { setLayers([s]); setSystem(s) }}
              title={t("adminBuilder.mepPanel.layerHint", { name: t(`adminBuilder.mep.systems.${s}`), mark: info.mark })}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium"
              style={{ background: on ? "rgba(148,163,184,0.16)" : "transparent", color: on ? TOKENS.text : TOKENS.muted, border: `1px solid ${on ? info.color : TOKENS.panelBorder}` }}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: on ? info.color : "transparent", border: `1px solid ${info.color}` }} />
              {info.mark === info.section ? info.section : `${info.section} ${info.mark}`}
            </button>
          )
        })}
        <button type="button" onClick={() => setLayers([...MEP_SYSTEMS])} className="rounded-lg px-2 py-1 text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.mepPanel.all")}</button>
        {buildingId && floor && (
          <a
            href={`/admin/builder/${buildingId}/sheet?floor=${floor.id}&section=mep`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-lg px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}
          >
            {t("adminBuilder.mepPanel.sheet")}
          </a>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {!floor ? (
          <p className="px-1 py-2 text-xs" style={{ color: TOKENS.muted }}>{t("adminBuilder.mepPanel.pickFloor")}</p>
        ) : spec.length === 0 ? (
          <p className="px-1 py-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.mepPanel.emptyFloor", { name: floor.name })}
          </p>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: TOKENS.muted }}>
                <th className="py-1 text-left font-medium">{t("adminBuilder.mepPanel.thName")}</th>
                <th className="w-16 py-1 text-right font-medium">{t("adminBuilder.mepPanel.thQty")}</th>
                <th className="w-10 py-1 text-left font-medium">&nbsp;{t("adminBuilder.mepPanel.thUnit")}</th>
              </tr>
            </thead>
            <tbody>
              {spec.map((sys) => {
                const info = MEP_SYSTEM_INFO[sys.system]
                return [
                  <tr key={sys.system} style={{ borderTop: `1px solid ${TOKENS.panelBorder}` }}>
                    <td colSpan={3} className="pb-0.5 pt-1.5 font-semibold">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: info.color }} />
                      {info.section} · {t(`adminBuilder.mep.systems.${sys.system}`)}
                      <span className="ml-2 font-normal" style={{ color: TOKENS.muted }}>
                        {t("adminBuilder.mepPanel.devices", { count: sys.devices })} · {sys.lengthM.toFixed(1).replace(".", ",")} {t("adminBuilder.mep.unitM")}
                        {sys.powerW ? t("adminBuilder.mepPanel.power", { value: (sys.powerW / 1000).toFixed(2).replace(".", ",") }) : ""}
                      </span>
                    </td>
                  </tr>,
                  ...sys.rows.map((r) => (
                    <tr key={`${sys.system}|${r.name}`}>
                      <td className="py-0.5 pl-3.5">{r.name}</td>
                      <td className="py-0.5 text-right">{fmtQty(r.qty, r.unit)}</td>
                      <td className="py-0.5" style={{ color: TOKENS.muted }}>&nbsp;{t(r.unit === "m" ? "adminBuilder.mep.unitM" : "adminBuilder.mep.unitPcs")}</td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
