"use client"

// ADR: Нижняя строка статуса (§5.7): активный уровень, инструмент, подсказка управления,
// бренд/фаза. FPS-метрика в dev и координаты курсора — Фаза 2.

import { useDocumentStore, useEditorStore, type Tool } from "@/store/builder-store"
import { findFloor } from "@/core/document/commands"
import { TOKENS } from "@/lib/builder/materials"
import { useLabelStore } from "@/store/label-store"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"

// Id инструмента в сторе с дефисом, ключ словаря — в camelCase: одна таблица
// вместо двух дублирующих подписей.
const TOOL_KEY: Record<Tool, keyof Messages["adminBuilder"]["tools"]> = {
  select: "select",
  wall: "wall",
  room: "room",
  floor: "floor",
  door: "door",
  window: "window",
  stair: "stair",
  island: "island",
  roof: "roof",
  terrain: "terrain",
  road: "road",
  parking: "parking",
  fence: "fence",
  tree: "tree",
  object: "object",
  material: "material",
  link: "link",
  water: "water",
  pave: "pave",
  delete: "delete",
  measure: "measure",
  "mep-run": "mepRun",
  "mep-device": "mepDevice",
  section: "section",
  annotate: "annotate",
}

export function StatusBar() {
  const { t } = useT()
  const doc = useDocumentStore((s) => s.doc)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const siteFloorId = useEditorStore((s) => s.siteFloorId)
  const activeTool = useEditorStore((s) => s.activeTool)
  const cursor = useLabelStore((s) => s.cursorMm)
  const siteFloor = siteFloorId ? findFloor(doc, siteFloorId) : undefined
  const level =
    activeLevelId === "site"
      ? siteFloor ? t("adminBuilder.statusBar.siteEditing", { name: siteFloor.name }) : t("adminBuilder.statusBar.site")
      : activeLevelId === "roof"
        ? siteFloor ? t("adminBuilder.statusBar.roofOf", { name: siteFloor.name }) : t("adminBuilder.statusBar.roof")
        : findFloor(doc, activeLevelId)?.name ?? "—"

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5 text-[11px] backdrop-blur-xl"
      style={{ background: TOKENS.panel, borderTop: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.muted }}
    >
      <div className="flex items-center gap-4">
        <span>
          {t("adminBuilder.statusBar.level")} <b style={{ color: TOKENS.text }}>{level}</b>
        </span>
        <span>
          {t("adminBuilder.statusBar.tool")} <b style={{ color: TOKENS.accent }}>{t(`adminBuilder.tools.${TOOL_KEY[activeTool]}`)}</b>
        </span>
      </div>
      <div className="hidden items-center gap-4 md:flex">
        <span>{t("adminBuilder.statusBar.controls")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: TOKENS.accent2 }}>Building Studio</span>
        <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(56,189,248,0.15)", color: TOKENS.accent }}>{t("adminBuilder.statusBar.phase")}</span>
      </div>
      <span className="tabular-nums" style={{ color: TOKENS.muted }}>
        {cursor ? `X ${(cursor.x / 1000).toFixed(2)}  Y ${(cursor.y / 1000).toFixed(2)} ${t("adminBuilder.underlay.meters")}` : ""}
      </span>
    </div>
  )
}
