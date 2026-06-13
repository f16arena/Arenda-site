"use client"

// ADR: Правая панель свойств (§5.5). Контекст выделения: стена (длина/высота/толщина/тип),
// комната (площадь + привязка premise + статус), объект (ассет). Фаза 1 — чтение реальных
// значений из документа/ядра; инлайн-редактирование полей — Фаза 2.

import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { findFloor, SetObjectRotationCommand, SetObjectScaleCommand, SetObjectSizeCommand, DeleteObjectCommand, SetWallPropsCommand, DeleteWallCommand, SetOpeningSizeCommand, DeleteOpeningCommand, SetStairCommand, DeleteStairCommand, ApplyRoomPresetCommand } from "@/core/document/commands"
import type { WallKind } from "@/core/geometry/wall-graph"
import { presetsFor } from "@/lib/builder/openings"
import { ROOM_PRESETS } from "@/lib/builder/room-presets"
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
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode)

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
      const fid = selection.floorId
      const eid = selection.id
      const kinds: { k: WallKind; l: string }[] = [{ k: "exterior", l: "Наруж." }, { k: "interior", l: "Внутр." }, { k: "partition", l: "Перег." }]
      const thicks = [100, 150, 200, 300]
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            Высота, м
            <input type="number" step="0.1" min="2" max="6" defaultValue={(e.height / 1000).toFixed(1)} key={`h${eid}${e.height}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetWallPropsCommand(fid, eid, { height: Math.max(2000, Math.min(6000, Math.round(v * 1000))) })) }}
              className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <div className="flex gap-1">
            {thicks.map((t) => (
              <button key={t} type="button" onClick={() => execute(new SetWallPropsCommand(fid, eid, { thickness: t }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: e.thickness === t ? TOKENS.accent : "rgba(148,163,184,0.12)", color: e.thickness === t ? "#0b1220" : TOKENS.text }}>{t}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {kinds.map((kd) => (
              <button key={kd.k} type="button" onClick={() => execute(new SetWallPropsCommand(fid, eid, { kind: kd.k }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: e.kind === kd.k ? TOKENS.accent : "rgba(148,163,184,0.12)", color: e.kind === kd.k ? "#0b1220" : TOKENS.text }}>{kd.l}</button>
            ))}
          </div>
          <button type="button" onClick={() => execute(new DeleteWallCommand(fid, eid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить стену</button>
        </div>
      )
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
        rows.push(<Row key="p" label="Привязка" value="нет" />)
      }
      rows.push(<Row key="fl" label="Этаж" value={f.name} />)
      const fid = selection.floorId
      const rid = selection.id
      controls = (
        <div className="mt-2">
          <p className="pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>Стиль комнаты</p>
          <div className="flex flex-wrap gap-1">
            {ROOM_PRESETS.map((pr) => (
              <button key={pr.id} type="button" onClick={() => execute(new ApplyRoomPresetCommand(fid, rid, pr))} className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "rgba(167,139,250,0.16)", color: TOKENS.accent2 }}>{pr.label}</button>
            ))}
          </div>
        </div>
      )
    }
  } else if (selection.type === "opening" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const op = f?.openings.find((o) => o.id === selection.id)
    title = op?.type === "window" ? "Окно" : "Дверь"
    if (f && op) {
      const fid = selection.floorId
      const oid = selection.id
      rows.push(<Row key="w" label="Ширина" value={`${(op.width / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="h" label="Высота" value={`${(op.height / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="s" label="От пола" value={`${(op.sillHeight / 1000).toFixed(2)} м`} />)
      const numInput = (label: string, val: number, on: (mm: number) => void, min: number, max: number) => (
        <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
          {label}
          <input type="number" step="0.1" min={min / 1000} max={max / 1000} defaultValue={(val / 1000).toFixed(2)} key={`${label}${oid}${val}`}
            onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) on(Math.max(min, Math.min(max, Math.round(v * 1000)))) }}
            className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
        </label>
      )
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          {numInput("Ширина, м", op.width, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { width: mm })), 400, 6000)}
          {numInput("Высота, м", op.height, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { height: mm })), 400, 3000)}
          {numInput("От пола, м", op.sillHeight, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { sillHeight: mm })), 0, 2000)}
          <div className="flex flex-wrap gap-1">
            {presetsFor(op.type).map((pr) => (
              <button key={pr.variant} type="button" onClick={() => execute(new SetOpeningSizeCommand(fid, oid, { variant: pr.variant, width: pr.width, height: pr.height, sillHeight: pr.sill }))} className="rounded-md px-1.5 py-1 text-[10px]" style={{ background: op.variant === pr.variant ? TOKENS.accent : "rgba(148,163,184,0.12)", color: op.variant === pr.variant ? "#0b1220" : TOKENS.text }}>{pr.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => execute(new DeleteOpeningCommand(fid, oid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить проём</button>
        </div>
      )
    }
  } else if (selection.type === "stair" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const st = f?.stairs.find((s) => s.id === selection.id)
    title = "Лестница"
    if (f && st) {
      const fid = selection.floorId
      const sid = selection.id
      const shapes: { s: "straight" | "l" | "u"; l: string }[] = [{ s: "straight", l: "Прямая" }, { s: "l", l: "Г" }, { s: "u", l: "П" }]
      rows.push(<Row key="sh" label="Форма" value={st.shape} />)
      rows.push(<Row key="w" label="Ширина" value={`${(st.width / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="r" label="Поворот" value={`${Math.round(st.rotationDeg)}°`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-1">
            {shapes.map((sh) => (
              <button key={sh.s} type="button" onClick={() => execute(new SetStairCommand(fid, sid, { shape: sh.s }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: st.shape === sh.s ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.shape === sh.s ? "#0b1220" : TOKENS.text }}>{sh.l}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[900, 1100, 1400].map((w) => (
              <button key={w} type="button" onClick={() => execute(new SetStairCommand(fid, sid, { width: w }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: st.width === w ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.width === w ? "#0b1220" : TOKENS.text }}>{(w / 1000).toFixed(1)} м</button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { rotationDeg: (st.rotationDeg + 90) % 360 }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
            <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { mirror: !st.mirror }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: st.mirror ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.mirror ? "#0b1220" : TOKENS.text }}>⇄ Зеркально</button>
          </div>
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить лестницу</button>
        </div>
      )
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
      const curX = obj.scaleX && obj.scaleX > 0 ? obj.scaleX : 1
      const curZ = obj.scaleZ && obj.scaleZ > 0 ? obj.scaleZ : 1
      rows.push(<Row key="sx" label="Ширина ×" value={curX.toFixed(2)} />)
      rows.push(<Row key="sz" label="Глубина ×" value={curZ.toFixed(2)} />)
      const btnStyle = "flex-1 rounded-md px-2 py-1.5 text-xs font-medium"
      const smallBtn = "rounded-md px-2 py-1 text-[11px] font-medium"
      const neutral = { background: "rgba(148,163,184,0.12)", color: TOKENS.text }
      const gz = (m: "move" | "rotate") => ({ background: gizmoMode === m ? TOKENS.accent : "rgba(148,163,184,0.12)", color: gizmoMode === m ? "#0b1220" : TOKENS.text })
      const clampSize = (v: number) => Math.max(0.3, Math.min(6, v))
      controls = (
        <>
        <div className="mt-2 flex gap-1">
          <button type="button" className={btnStyle} style={gz("move")} onClick={() => setGizmoMode("move")}>⇄ Двигать</button>
          <button type="button" className={btnStyle} style={gz("rotate")} onClick={() => setGizmoMode("rotate")}>⟲ Вращать</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>Ширина</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(curX / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(curX * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>Глубина</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectRotationCommand(target, id, (obj.rotationY + 45) % 360))}>⟳ 45°</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.min(5, obj.scale * 1.2)))}>＋ общий</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.max(0.3, obj.scale / 1.2)))}>－ общий</button>
          <button type="button" className={btnStyle} style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }} onClick={() => execute(new DeleteObjectCommand(target, id))}>Удалить</button>
        </div>
        </>
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
