"use client"

// ADR: Правая панель свойств (§5.5). Контекст выделения: стена (длина/высота/толщина/тип),
// комната (площадь + привязка premise + статус), объект (ассет). Фаза 1 — чтение реальных
// значений из документа/ядра; инлайн-редактирование полей — Фаза 2.

import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { findFloor, SetObjectRotationCommand, SetObjectScaleCommand, DeleteObjectCommand } from "@/core/document/commands"
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
  const execute = useDocumentStore((s) => s.execute)
  const selection = useEditorStore((s) => s.selection)

  let title = "Проект"
  const rows: React.ReactNode[] = []
  let controls: React.ReactNode = null

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
    const inSite = doc.site.objects.find((o) => o.id === selection.id)
    const floorObj = !inSite ? doc.buildings.flatMap((b) => b.floors).map((f) => ({ f, o: f.objects.find((ob) => ob.id === selection.id) })).find((x) => x.o) : null
    const obj = inSite ?? floorObj?.o
    title = "Объект"
    if (obj) {
      const target = inSite ? ({ site: true } as const) : ({ floorId: floorObj?.f.id ?? "" } as const)
      const id = obj.id
      rows.push(<Row key="a" label="Ассет" value={obj.assetId} />)
      rows.push(<Row key="x" label="Позиция X" value={`${(obj.position.x / 1000).toFixed(1)} м`} />)
      rows.push(<Row key="z" label="Позиция Z" value={`${(obj.position.z / 1000).toFixed(1)} м`} />)
      rows.push(<Row key="r" label="Поворот" value={`${Math.round(obj.rotationY)}°`} />)
      rows.push(<Row key="sc" label="Масштаб" value={obj.scale.toFixed(2)} />)
      const btnStyle = "flex-1 rounded-md px-2 py-1.5 text-xs font-medium"
      const neutral = { background: "rgba(148,163,184,0.12)", color: TOKENS.text }
      controls = (
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectRotationCommand(target, id, (obj.rotationY + 45) % 360))}>⟳ 45°</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.min(5, obj.scale * 1.2)))}>＋</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.max(0.3, obj.scale / 1.2)))}>－</button>
          <button type="button" className={btnStyle} style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }} onClick={() => execute(new DeleteObjectCommand(target, id))}>Удалить</button>
        </div>
      )
    }
  }

  return (
    <div
      className="absolute right-3 top-20 z-20 w-60 rounded-2xl p-3 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="mb-1.5 text-sm font-semibold">{title}</div>
      <div className="flex flex-col">{rows}</div>
      {controls}
      <div className="mt-2 border-t pt-2 text-[10px]" style={{ borderColor: TOKENS.panelBorder, color: TOKENS.muted }}>
        Delete — удалить · Esc — снять выделение
      </div>
    </div>
  )
}
