"use client"

// ADR: Правая панель свойств (§5.5). Контекст выделения: стена (длина/высота/толщина/тип),
// комната (площадь + привязка premise + статус), объект (ассет). Фаза 1 — чтение реальных
// значений из документа/ядра; инлайн-редактирование полей — Фаза 2.

import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { findFloor } from "@/core/document/commands"
import { detectRooms } from "@/core/geometry/room-detection"
import { distance } from "@/core/geometry/math"
import { TOKENS, STATUS_LABEL, STATUS_COLOR } from "@/lib/builder/materials"
import { DEMO_PREMISE_STATUS } from "@/lib/builder/demo-project"

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span style={{ color: TOKENS.muted }}>{label}</span>
      <span className="font-medium" style={{ color: accent ?? TOKENS.text }}>{value}</span>
    </div>
  )
}

const KIND_RU: Record<string, string> = { exterior: "Наружная", interior: "Внутренняя", partition: "Перегородка" }

export function PropertyPanel() {
  const doc = useDocumentStore((s) => s.doc)
  const selection = useEditorStore((s) => s.selection)

  let title = "Проект"
  const rows: React.ReactNode[] = []

  if (selection.type === "none") {
    title = doc.name
    const floors = doc.buildings.flatMap((b) => b.floors)
    rows.push(<Row key="b" label="Зданий" value={String(doc.buildings.length)} />)
    rows.push(<Row key="f" label="Этажей" value={String(floors.length)} />)
    rows.push(<Row key="o" label="Объектов" value={String(doc.site.objects.length)} />)
    rows.push(<Row key="h" label="Подсказка" value="Кликните элемент" />)
  } else if (selection.type === "wall" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const e = f?.wallGraph.edges[selection.id]
    if (f && e) {
      title = "Стена"
      const a = f.wallGraph.nodes[e.a]
      const b = f.wallGraph.nodes[e.b]
      const len = a && b ? distance(a, b) / 1000 : 0
      rows.push(<Row key="k" label="Тип" value={KIND_RU[e.kind] ?? e.kind} />)
      rows.push(<Row key="l" label="Длина" value={`${len.toFixed(2)} м`} />)
      rows.push(<Row key="h" label="Высота" value={`${(e.height / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="t" label="Толщина" value={`${e.thickness} мм`} />)
      rows.push(<Row key="fl" label="Этаж" value={f.name} />)
    }
  } else if (selection.type === "room" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    if (f) {
      const room = detectRooms(f.wallGraph).find((r) => r.id === selection.id)
      title = "Помещение"
      if (room) rows.push(<Row key="a" label="Площадь" value={`${(room.areaMm2 / 1_000_000).toFixed(1)} м²`} />)
      const premiseId = f.premiseLinks[selection.id]
      if (premiseId) {
        const st = DEMO_PREMISE_STATUS[premiseId]
        rows.push(<Row key="p" label="Помещение Commrent" value={premiseId} />)
        if (st) rows.push(<Row key="s" label="Статус" value={STATUS_LABEL[st]} accent={STATUS_COLOR[st]} />)
      } else {
        rows.push(<Row key="p" label="Привязка" value="нет (Фаза 5)" />)
      }
      rows.push(<Row key="fl" label="Этаж" value={f.name} />)
    }
  } else if (selection.type === "object" && selection.id) {
    const obj = doc.site.objects.find((o) => o.id === selection.id) ?? doc.buildings.flatMap((b) => b.floors).flatMap((f) => f.objects).find((o) => o.id === selection.id)
    title = "Объект"
    if (obj) {
      rows.push(<Row key="a" label="Ассет" value={obj.assetId} />)
      rows.push(<Row key="x" label="Позиция X" value={`${(obj.position.x / 1000).toFixed(1)} м`} />)
      rows.push(<Row key="z" label="Позиция Z" value={`${(obj.position.z / 1000).toFixed(1)} м`} />)
    }
  }

  return (
    <div
      className="absolute right-3 top-20 z-20 w-60 rounded-2xl p-3 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="mb-1.5 text-sm font-semibold">{title}</div>
      <div className="flex flex-col">{rows}</div>
      <div className="mt-2 border-t pt-2 text-[10px]" style={{ borderColor: TOKENS.panelBorder, color: TOKENS.muted }}>
        Delete — удалить · Esc — снять выделение
      </div>
    </div>
  )
}
