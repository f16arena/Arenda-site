"use client"

// ADR: Правая панель свойств (§5.5). Контекст выделения: стена (длина/высота/толщина/тип),
// комната (площадь + привязка premise + статус), объект (ассет). Фаза 1 — чтение реальных
// значений из документа/ядра; инлайн-редактирование полей — Фаза 2.

import { floorRooms } from "@/lib/builder/rooms"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { roomWallsToDelete } from "@/lib/builder/room-delete"
import { findFloor, AddObjectCommand, SetObjectRotationCommand, SetObjectScaleCommand, SetObjectSizeCommand, DeleteObjectCommand, SetWallPropsCommand, DeleteWallCommand, MoveNodeCommand, CompositeCommand, SetOpeningSizeCommand, DeleteOpeningCommand, SetStairCommand, DeleteStairCommand, ApplyRoomPresetCommand, LinkPremiseCommand, UpdateMepRunCommand, UpdateMepDeviceCommand, DeleteMepRunCommand, DeleteMepDeviceCommand, UpdateSectionCommand, DeleteSectionCommand, SetWallPhaseCommand, SetOpeningPhaseCommand, UpdateAnnotationCommand, DeleteAnnotationCommand, SetRoomNameCommand, SetOpeningExitCommand, ToggleExitReverseCommand, MoveStairCommand, setColumnSizeCommand } from "@/core/document/commands"
import { MEP_SYSTEMS, type MepSystem } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, polylineLengthMm } from "@/lib/builder/mep/catalog"
import { autoAssignGroups, calcPanels, groupKindOf } from "@/lib/builder/mep/panel-calc"
import { roomExplication } from "@/lib/builder/drawing/schedules"
import { usePremiseStore } from "@/store/premise-store"
import { uid } from "@/core/id"
import type { WallKind } from "@/core/geometry/wall-graph"
import { presetsFor } from "@/lib/builder/openings"
import { ROOM_PRESETS } from "@/lib/builder/room-presets"
import { distance } from "@/core/geometry/math"
import { columnRow } from "@/lib/builder/plan-editor-math"
import { TOKENS, STATUS_LABEL, STATUS_COLOR } from "@/lib/builder/materials"

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span style={{ color: TOKENS.muted }}>{label}</span>
      <span className="min-w-0 truncate text-right font-medium" title={value} style={{ color: accent ?? TOKENS.text }}>{value}</span>
    </div>
  )
}

const KIND_RU: Record<string, string> = { exterior: "Наружная", interior: "Внутренняя", partition: "Перегородка" }

export function PropertyPanel({ buildingId }: { buildingId?: string } = {}) {
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const selection = useEditorStore((s) => s.selection)
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode)
  const assetBaseSizes = useEditorStore((s) => s.assetBaseSizes)
  const columnSizeAll = useEditorStore((s) => s.columnSizeAll)
  const setColumnSizeAll = useEditorStore((s) => s.setColumnSizeAll)
  const premisesById = usePremiseStore((s) => s.byId)
  const resolvePremise = usePremiseStore((s) => s.resolve)

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
      rows.push(<Row key="h" label="Высота" value={`${(e.height / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="t" label="Толщина" value={`${e.thickness} мм`} />)
      rows.push(<Row key="fl" label="Этаж" value={f.name} />)
      const fid = selection.floorId
      const eid = selection.id
      const kinds: { k: WallKind; l: string }[] = [{ k: "exterior", l: "Наруж." }, { k: "interior", l: "Внутр." }, { k: "partition", l: "Перег." }]
      const thicks = [100, 150, 200, 300]
      rows.push(<Row key="ph" label="Статус" value={e.phase === "demolish" ? "Демонтаж" : e.phase === "new" ? "Новая" : "Существующая"} accent={e.phase === "demolish" ? "#f87171" : e.phase === "new" ? "#4ade80" : undefined} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <PhaseButtons value={e.phase} noun="стена" onPick={(ph) => execute(new SetWallPhaseCommand(fid, [eid], ph))} />
          {a && b && (
            <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }} title="Второй конец стены сдвигается вдоль её направления; первый остаётся на месте">
              Длина, м
              <input id="builder-wall-length" type="number" step="0.01" min="0.1" defaultValue={len.toFixed(2)} key={`l${eid}${len.toFixed(3)}`}
                onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur() }}
                onBlur={(ev) => {
                  const v = parseFloat(ev.target.value.replace(",", "."))
                  const cur = distance(a, b)
                  if (!Number.isFinite(v) || v < 0.1 || cur === 0 || Math.abs(v * 1000 - cur) < 0.5) return
                  const k = (v * 1000) / cur
                  execute(new MoveNodeCommand(fid, e.b, { x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k) }))
                }}
                className="w-20 rounded-md bg-white/5 px-1.5 py-1 text-right text-xs tabular-nums" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
            </label>
          )}
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
      const room = floorRooms(f).find((r) => r.id === selection.id)
      title = "Помещение"
      const drawnM2 = room ? room.areaMm2 / 1_000_000 : null
      const linkKey = f.premiseLinks[selection.id]
      const premise = linkKey ? resolvePremise(linkKey) : undefined
      if (premise) {
        rows.push(<Row key="n" label="Карточка" value={`№ ${premise.number}`} />)
        rows.push(<Row key="t" label="Арендатор" value={premise.tenantName ?? "свободно"} />)
        rows.push(<Row key="s" label="Статус" value={STATUS_LABEL[premise.status]} accent={STATUS_COLOR[premise.status]} />)
        if (premise.debt > 0) rows.push(<Row key="d" label="Долг" value={`${Math.round(premise.debt).toLocaleString("ru-RU")} ₸`} accent="#f87171" />)
        // Площадь по договору — условие договора, рисунком не меняется; расхождение показываем.
        if (premise.areaM2 != null) rows.push(<Row key="ac" label="По договору" value={`${premise.areaM2.toFixed(1)} м²`} />)
        if (drawnM2 != null) {
          const pct = premise.areaM2 ? Math.round(((drawnM2 - premise.areaM2) / premise.areaM2) * 100) : null
          const off = pct != null && Math.abs(pct) >= 2
          rows.push(<Row key="ag" label="В модели" value={`${drawnM2.toFixed(1)} м²${off ? ` (${pct! > 0 ? "+" : ""}${pct}%)` : ""}`} accent={off ? "#fbbf24" : undefined} />)
        }
      } else {
        if (drawnM2 != null) rows.push(<Row key="a" label="Площадь в модели" value={`${drawnM2.toFixed(1)} м²`} />)
        rows.push(<Row key="p" label="Карточка" value={linkKey ? `не найдена (${linkKey})` : "не привязана"} />)
      }
      rows.push(<Row key="fl" label="Этаж" value={f.name} />)
      const fid = selection.floorId
      const rid = selection.id
      const options = Array.from(premisesById.values())
      controls = (
        <div className="mt-2">
          <label className="mb-2 flex flex-col gap-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>
            Наименование (экспликация)
            <input
              id="room-name"
              defaultValue={f.roomNames?.[rid] ?? ""}
              key={`rn${rid}${f.roomNames?.[rid] ?? ""}`}
              placeholder="Офис, Коридор, Санузел…"
              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur() }}
              onBlur={(ev) => { const v = ev.target.value.trim().slice(0, 60); if (v !== (f.roomNames?.[rid] ?? "")) execute(new SetRoomNameCommand(fid, rid, v)) }}
              className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs normal-case tracking-normal"
              style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            />
          </label>
          {options.length > 0 && (
            <label className="mb-2 flex flex-col gap-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>
              Карточка помещения
              <select
                id="room-premise"
                value={premise?.id ?? ""}
                onChange={(ev) => execute(new LinkPremiseCommand(fid, rid, ev.target.value || null))}
                className="w-full max-w-full rounded-md bg-white/5 px-1.5 py-1 text-xs normal-case tracking-normal"
                style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
              >
                <option value="">— не привязано —</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.floorNumber} эт · № {p.number}{p.areaM2 != null ? ` · ${p.areaM2} м²` : ""}{p.tenantName ? ` · ${p.tenantName}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>Стиль комнаты</p>
          <div className="flex flex-wrap gap-1">
            {ROOM_PRESETS.map((pr) => (
              <button key={pr.id} type="button" onClick={() => execute(new ApplyRoomPresetCommand(fid, rid, pr))} className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "rgba(167,139,250,0.16)", color: TOKENS.accent2 }}>{pr.label}</button>
            ))}
          </div>
          <button
            type="button"
            title="Снести стены этого помещения. Стены, общие с соседними помещениями, остаются. Откат — Ctrl+Z"
            onClick={() => {
              const ids = roomWallsToDelete(f.wallGraph, rid)
              const commands = [
                ...(linkKey ? [new LinkPremiseCommand(fid, rid, null)] : []),
                ...ids.map((id) => new DeleteWallCommand(fid, id)),
              ]
              if (commands.length) execute(new CompositeCommand("удаление помещения", commands))
              useEditorStore.getState().setSelection({ type: "none" })
            }}
            className="mt-2 w-full rounded-md py-1.5 text-xs font-medium"
            style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
          >
            Удалить помещение
          </button>
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
          <PhaseButtons value={op.phase} noun={op.phase === "demolish" ? "проём закладывается" : "проём"} onPick={(ph) => execute(new SetOpeningPhaseCommand(fid, oid, ph))} />
          {op.type === "door" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: TOKENS.muted }}>Назначение двери</span>
              <div className="flex gap-1">
                {([[undefined, "Обычная", "rgba(148,163,184,0.25)"], ["main", "Главный вход", "#2563eb"], ["emergency", "Эвак. выход", "#16a34a"]] as const).map(([v, l, c]) => (
                  <button key={l} type="button" onClick={() => execute(new SetOpeningExitCommand(fid, oid, v))} className="flex-1 rounded-md py-1 text-[10px] font-medium" style={{ background: op.exit === v ? c : "rgba(148,163,184,0.1)", color: op.exit === v ? "#fff" : TOKENS.text }}>{l}</button>
                ))}
              </div>
              {op.exit && (
                <button type="button" onClick={() => execute(new ToggleExitReverseCommand(fid, oid))} className="rounded-md py-1 text-[10px] font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }} title="Стрелка ставится по пути к выходу из здания; если направление другое — разверните">
                  ⇄ Развернуть стрелку
                </button>
              )}
            </div>
          )}
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
  } else if (selection.type === "annotation" && selection.floorId && selection.id) {
    const fid = selection.floorId
    const aid = selection.id
    const an = findFloor(doc, fid)?.annotations?.find((x) => x.id === aid)
    title = an?.kind === "text" ? "Надпись" : "Размер"
    const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
    if (an?.kind === "dim") {
      rows.push(<Row key="l" label="Длина" value={`${Math.round(Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y))} мм`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            Вынос, м
            <input id="annotation-offset" type="number" step="0.1" defaultValue={(an.offset / 1000).toFixed(2)} key={`ao${aid}${an.offset}`} onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new UpdateAnnotationCommand(fid, aid, { offset: Math.round(v * 1000) })) }} className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          <button type="button" onClick={() => execute(new UpdateAnnotationCommand(fid, aid, { offset: -an.offset }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⇅ На другую сторону</button>
          <button type="button" onClick={() => { execute(new DeleteAnnotationCommand(fid, aid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить размер</button>
        </div>
      )
    } else if (an?.kind === "text") {
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5 text-[11px]" style={{ color: TOKENS.muted }}>
            Текст
            <textarea id="annotation-text" rows={2} defaultValue={an.text} key={`at${aid}${an.text}`} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== an.text) execute(new UpdateAnnotationCommand(fid, aid, { text: v.slice(0, 200) })) }} className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          <button type="button" onClick={() => { execute(new DeleteAnnotationCommand(fid, aid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить надпись</button>
        </div>
      )
    }
  } else if (selection.type === "section" && selection.buildingId && selection.id) {
    const bid = selection.buildingId
    const sid = selection.id
    const sec = doc.buildings.find((b) => b.id === bid)?.sections?.find((x) => x.id === sid)
    title = sec ? `Разрез ${sec.name}` : "Разрез"
    if (sec) {
      const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y) / 1000
      rows.push(<Row key="l" label="Длина линии" value={`${L.toFixed(2)} м`} />)
      rows.push(<Row key="v" label="Взгляд" value={sec.look === 1 ? "влево от линии" : "вправо от линии"} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5 text-[11px]" style={{ color: TOKENS.muted }}>
            Обозначение
            <input id="section-name" defaultValue={sec.name} key={`sn${sid}${sec.name}`} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== sec.name) execute(new UpdateSectionCommand(bid, sid, { name: v.slice(0, 12) })) }} className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <button type="button" onClick={() => execute(new UpdateSectionCommand(bid, sid, { look: sec.look === 1 ? -1 : 1 }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⇅ Смотреть в другую сторону</button>
          {buildingId && (
            <a href={`/admin/builder/${buildingId}/sheet?view=section:${sid}`} target="_blank" rel="noreferrer" className="rounded-md py-1.5 text-center text-xs font-medium" style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}>Лист разреза (PDF, DXF)</a>
          )}
          <button type="button" onClick={() => { execute(new DeleteSectionCommand(bid, sid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить разрез</button>
        </div>
      )
    }
  } else if ((selection.type === "mep-run" || selection.type === "mep-device") && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const fid = selection.floorId
    const id = selection.id
    const inputCls = "w-full rounded-md bg-white/5 px-1.5 py-1 text-xs"
    const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
    const num = (v: string) => parseFloat(v.replace(",", "."))
    const field = (label: string, input: React.ReactNode) => (
      <label className="flex flex-col gap-0.5 text-[11px]" style={{ color: TOKENS.muted }}>
        {label}
        {input}
      </label>
    )
    if (selection.type === "mep-run") {
      const run = f?.mepRuns.find((r) => r.id === id)
      title = "Трасса сети"
      if (run) {
        const info = MEP_SYSTEM_INFO[run.system]
        rows.push(<Row key="s" label="Система" value={`${info.section} · ${info.name}`} accent={info.color} />)
        rows.push(<Row key="l" label="Длина" value={`${(polylineLengthMm(run.points) / 1000).toFixed(2)} м`} />)
        rows.push(<Row key="p" label="Участков" value={String(run.points.length - 1)} />)
        controls = (
          <div className="mt-2 flex flex-col gap-1.5">
            {field("Система", (
              <select id="mep-run-system" value={run.system} onChange={(ev) => execute(new UpdateMepRunCommand(fid, id, { system: ev.target.value as MepSystem, size: MEP_SYSTEM_INFO[ev.target.value as MepSystem].size }))} className={inputCls} style={inputStyle}>
                {MEP_SYSTEMS.map((sys) => <option key={sys} value={sys} style={{ color: "#0b1220" }}>{MEP_SYSTEM_INFO[sys].section} · {MEP_SYSTEM_INFO[sys].name}</option>)}
              </select>
            ))}
            {field(info.shape === "duct" ? "Сечение, мм" : info.shape === "pipe" ? "Труба (материал, диаметр)" : "Марка кабеля", (
              <input id="mep-run-size" defaultValue={run.size} key={`rs${id}${run.size}`} onBlur={(ev) => { if (ev.target.value !== run.size) execute(new UpdateMepRunCommand(fid, id, { size: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            {field("Высота от пола, м", (
              <input id="mep-run-height" type="number" step="0.05" min="0" max="20" defaultValue={(run.height / 1000).toFixed(2)} key={`rh${id}${run.height}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && Math.round(v * 1000) !== run.height) execute(new UpdateMepRunCommand(fid, id, { height: Math.max(0, Math.round(v * 1000)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {field("Обозначение (группа, участок)", (
              <input id="mep-run-label" defaultValue={run.label} key={`rl${id}${run.label}`} placeholder="гр. 1" onBlur={(ev) => { if (ev.target.value !== run.label) execute(new UpdateMepRunCommand(fid, id, { label: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            <button type="button" onClick={() => { execute(new DeleteMepRunCommand(fid, id)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить трассу</button>
          </div>
        )
      }
    } else {
      const dev = f?.mepDevices.find((d) => d.id === id)
      title = "Прибор сети"
      if (dev) {
        const info = MEP_SYSTEM_INFO[dev.system]
        const di = MEP_DEVICE_BY_KIND[dev.kind]
        rows.push(<Row key="s" label="Система" value={`${info.section} · ${info.name}`} accent={info.color} />)
        rows.push(<Row key="k" label="Прибор" value={di?.name ?? dev.kind} />)
        rows.push(<Row key="xy" label="X · Y" value={`${(dev.at.x / 1000).toFixed(2)} · ${(dev.at.y / 1000).toFixed(2)} м`} />)
        controls = (
          <div className="mt-2 flex flex-col gap-1.5">
            {field("Обозначение", (
              <input id="mep-dev-label" defaultValue={dev.label} key={`dl${id}${dev.label}`} placeholder={di?.riser ? "Ст В1-1" : "ЩР-1, гр. 2"} onBlur={(ev) => { if (ev.target.value !== dev.label) execute(new UpdateMepDeviceCommand(fid, id, { label: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            {!di?.riser && field("Высота установки, м", (
              <input id="mep-dev-height" type="number" step="0.05" min="0" max="20" defaultValue={(dev.height / 1000).toFixed(2)} key={`dh${id}${dev.height}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && Math.round(v * 1000) !== dev.height) execute(new UpdateMepDeviceCommand(fid, id, { height: Math.max(0, Math.round(v * 1000)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {(dev.power !== undefined || di?.power !== undefined || dev.kind === "panel") && field("Мощность, Вт", (
              <input id="mep-dev-power" type="number" step="10" min="0" defaultValue={dev.power ?? di?.power ?? 0} key={`dp${id}${dev.power}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && v !== dev.power) execute(new UpdateMepDeviceCommand(fid, id, { power: Math.max(0, Math.round(v)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {groupKindOf(dev) && f && (() => {
              const panels = (f.mepDevices ?? []).filter((d) => d.kind === "panel")
              return (
                <div className="flex gap-1">
                  {field("Щит", (
                    <select id="mep-dev-panel" value={dev.panelId ?? ""} onChange={(ev) => execute(new UpdateMepDeviceCommand(fid, id, { panelId: ev.target.value || undefined }))} className={inputCls} style={inputStyle}>
                      <option value="" style={{ color: "#0b1220" }}>—</option>
                      {panels.map((pn) => <option key={pn.id} value={pn.id} style={{ color: "#0b1220" }}>{pn.label || "ЩР"}</option>)}
                    </select>
                  ))}
                  {field("Группа", (
                    <input id="mep-dev-group" type="number" min="1" max="99" defaultValue={dev.group ?? ""} key={`dg${id}${dev.group}`} onBlur={(ev) => { const v = parseInt(ev.target.value, 10); execute(new UpdateMepDeviceCommand(fid, id, { group: Number.isFinite(v) && v > 0 ? v : undefined })) }} className={inputCls} style={inputStyle} />
                  ))}
                </div>
              )
            })()}
            {dev.kind === "panel" && f && (() => {
              const numbers = new Map(roomExplication(f).map((r) => [r.roomId, r.number]))
              const calc = calcPanels(f, (rid) => numbers.get(rid) ?? null).find((c) => c.panelId === id)
              return (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => {
                    const plan = autoAssignGroups(f).filter((a) => a.panelId === id)
                    if (plan.length) execute(new CompositeCommand("разбивка по группам", plan.map((a) => new UpdateMepDeviceCommand(fid, a.deviceId, { panelId: a.panelId, group: a.group }))))
                  }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.text }} title="Ближайшие приборы к этому щиту: свет и розетки — по помещениям (не больше 6 розеток), 380 В и оборудование — отдельными группами">
                    Разбить по группам
                  </button>
                  {calc && calc.groups.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]" style={{ fontVariantNumeric: "tabular-nums", color: TOKENS.text }}>
                        <thead><tr style={{ color: TOKENS.muted }}><th className="text-left">Гр.</th><th className="text-right">Р, кВт</th><th className="text-right">I, А</th><th className="text-right">QF</th><th className="text-right">S, мм²</th><th className="text-right">ΔU%</th></tr></thead>
                        <tbody>
                          {calc.groups.map((g) => (
                            <tr key={g.group} title={g.purpose}>
                              <td>{g.group}</td>
                              <td className="text-right">{(g.pInstW / 1000).toFixed(2)}</td>
                              <td className="text-right">{g.currentA.toFixed(1)}</td>
                              <td className="text-right">{g.breakerA}</td>
                              <td className="text-right">{String(g.cableMm2).replace(".", ",")}</td>
                              <td className="text-right" style={{ color: g.dropPct > 4 ? "#f87171" : undefined }}>{g.dropPct.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-[10px]" style={{ color: TOKENS.muted }}>Руст {(calc.pInstW / 1000).toFixed(2)} кВт · Рр {(calc.pCalcW / 1000).toFixed(2)} кВт · Iр {calc.currentA.toFixed(1)} А · вводной {calc.inputBreakerA} А</p>
                    </div>
                  )}
                </div>
              )
            })()}
            <div className="flex gap-1">
              <button type="button" onClick={() => execute(new UpdateMepDeviceCommand(fid, id, { rotation: (dev.rotation + 90) % 360 }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
              <button type="button" onClick={() => { execute(new DeleteMepDeviceCommand(fid, id)); useEditorStore.getState().setSelection({ type: "none" }) }} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить</button>
            </div>
            <p className="text-[10px]" style={{ color: TOKENS.muted }}>Стрелки — сдвиг на 100 мм, Shift — на 10 мм.</p>
          </div>
        )
      }
    }
  } else if (selection.type === "stair" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const st = f?.stairs.find((s) => s.id === selection.id)
    title = st?.shape === "porch" ? "Крыльцо" : st?.shape === "elevator" ? "Лифт" : st?.shape === "column" ? "Колонна" : "Лестница"
    if (f && st && st.shape === "column") {
      const fid = selection.floorId
      const sid = selection.id
      const num = (v: string) => parseFloat(v.replace(",", "."))
      const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
      rows.push(<Row key="sz" label="Сечение" value={`${st.width}×${st.depth ?? st.width} мм`} />)
      rows.push(<Row key="xy" label="X · Y" value={`${(st.position.x / 1000).toFixed(2)} · ${(st.position.y / 1000).toFixed(2)} м`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[11px]" style={{ color: TOKENS.text }} title="Сечение одно на весь этаж: ширина и глубина меняются у всех колонн">
            <input id="column-size-all" type="checkbox" checked={columnSizeAll} onChange={(ev) => setColumnSizeAll(ev.target.checked)} />
            Размер — у всех колонн этажа ({f.stairs.filter((x) => x.shape === "column").length})
          </label>
          {([["Ширина, мм", "width", st.width], ["Глубина, мм", "depth", st.depth ?? st.width]] as const).map(([label, key, value]) => (
            <label key={key} className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
              {label}
              <input id={`column-${key}`} type="number" step="10" min="100" max="3000" defaultValue={value} key={`c${key}${sid}${value}`}
                onBlur={(ev) => { const v = Math.round(num(ev.target.value)); if (Number.isFinite(v) && v >= 100 && v !== value) execute(setColumnSizeCommand(f, sid, { [key]: Math.min(3000, v) }, columnSizeAll)) }}
                className="w-20 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
            </label>
          ))}
          <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { rotationDeg: (st.rotationDeg + 90) % 360 }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
          {(() => {
            // ряд: соседние колонны в пределах 1 м по оси встают строго на линию этой колонны
            const rowX = columnRow(f, sid, "x"), rowY = columnRow(f, sid, "y")
            const align = (row: typeof rowX, label: string) => execute(new CompositeCommand(label, row.map((r) => new MoveStairCommand(fid, r.id, r.x, r.y))))
            return (
              <div className="flex gap-1">
                <button type="button" disabled={!rowX.length} onClick={() => align(rowX, "колонны в линию по вертикали")} title="Колонны выше и ниже (±1 м по X) встанут на одну вертикаль с этой" className="flex-1 rounded-md py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>↕ В линию{rowX.length ? ` (${rowX.length})` : ""}</button>
                <button type="button" disabled={!rowY.length} onClick={() => align(rowY, "колонны в линию по горизонтали")} title="Колонны левее и правее (±1 м по Y) встанут на одну горизонталь с этой" className="flex-1 rounded-md py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>↔ В линию{rowY.length ? ` (${rowY.length})` : ""}</button>
              </div>
            )
          })()}
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить колонну</button>
        </div>
      )
    } else if (f && st && st.shape === "porch") {
      const fid = selection.floorId
      const sid = selection.id
      const rise = st.rise ?? 450
      const n = Math.max(1, Math.round(rise / 170))
      rows.push(<Row key="w" label="Ширина" value={`${(st.width / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="h" label="Подъём" value={`${(rise / 1000).toFixed(2)} м`} />)
      rows.push(<Row key="n" label="Подступенков" value={String(n)} />)
      const inputCls = "w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs"
      const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
      const num = (v: string) => parseFloat(v.replace(",", "."))
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            Ширина, м
            <input type="number" step="0.1" min="0.9" max="12" defaultValue={(st.width / 1000).toFixed(2)} key={`pw${sid}${st.width}`}
              onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { width: Math.max(900, Math.min(12000, Math.round(v * 1000))) })) }}
              className={inputCls} style={inputStyle} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            Подъём, м
            <input type="number" step="0.05" min="0.15" max="2" defaultValue={(rise / 1000).toFixed(2)} key={`pr${sid}${rise}`}
              onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { rise: Math.max(150, Math.min(2000, Math.round(v * 1000))) })) }}
              className={inputCls} style={inputStyle} />
          </label>
          <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { rotationDeg: (st.rotationDeg + 90) % 360 }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>Удалить крыльцо</button>
        </div>
      )
    } else if (f && st) {
      const fid = selection.floorId
      const sid = selection.id
      const shapes: { s: "straight" | "l" | "u"; l: string }[] = [{ s: "straight", l: "Прямая" }, { s: "l", l: "Г" }, { s: "u", l: "П" }]
      const SHAPE_RU: Record<string, string> = { straight: "Прямая", l: "Г-образная", u: "П-образная", spiral: "Винтовая" }
      rows.push(<Row key="sh" label="Форма" value={SHAPE_RU[st.shape] ?? st.shape} />)
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
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            Ширина, м
            <input type="number" step="0.1" min="0.6" max="3" defaultValue={(st.width / 1000).toFixed(2)} key={`sw${sid}${st.width}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { width: Math.max(600, Math.min(3000, Math.round(v * 1000))) })) }}
              className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
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
      const curY = obj.scaleY && obj.scaleY > 0 ? obj.scaleY : 1
      const curZ = obj.scaleZ && obj.scaleZ > 0 ? obj.scaleZ : 1
      rows.push(<Row key="sx" label="Ширина ×" value={curX.toFixed(2)} />)
      rows.push(<Row key="sy" label="Высота ×" value={curY.toFixed(2)} />)
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
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>Высота</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(curY / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(curY * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>Глубина</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
          <label className="flex flex-1 items-center gap-1">Ш×
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curX.toFixed(2)} key={`ox${id}${curX}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">В×
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curY.toFixed(2)} key={`oy${id}${curY}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">Г×
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curZ.toFixed(2)} key={`oz${id}${curZ}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">М
            <input type="number" step="0.1" min="0.3" max="5" defaultValue={obj.scale.toFixed(2)} key={`om${id}${obj.scale}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectScaleCommand(target, id, Math.max(0.3, Math.min(5, v)))) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
        </div>
        {(() => {
          const base = assetBaseSizes[obj.assetId]
          if (!base || base.w <= 0 || base.d <= 0 || base.h <= 0) return null
          const widthM = (base.w * obj.scale * curX) / 1000
          const heightM = (base.h * obj.scale * curY) / 1000
          const depthM = (base.d * obj.scale * curZ) / 1000
          return (
            <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
              <label className="flex flex-1 items-center gap-1">Ш, м
                <input type="number" step="0.1" min="0.2" defaultValue={widthM.toFixed(2)} key={`mw${id}${widthM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize((v * 1000) / (base.w * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
              <label className="flex flex-1 items-center gap-1">В, м
                <input type="number" step="0.1" min="0.2" defaultValue={heightM.toFixed(2)} key={`mh${id}${heightM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize((v * 1000) / (base.h * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
              <label className="flex flex-1 items-center gap-1">Г, м
                <input type="number" step="0.1" min="0.2" defaultValue={depthM.toFixed(2)} key={`md${id}${depthM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize((v * 1000) / (base.d * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
            </div>
          )
        })()}
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectRotationCommand(target, id, (obj.rotationY + 45) % 360))}>⟳ 45°</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.min(5, obj.scale * 1.2)))}>＋ общий</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.max(0.3, obj.scale / 1.2)))}>－ общий</button>
          <button type="button" className={btnStyle} style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }} onClick={() => execute(new DeleteObjectCommand(target, id))}>Удалить</button>
        </div>
        {(() => {
          if (!floorObj) return null
          const bld = doc.buildings.find((b) => b.floors.some((fl) => fl.id === floorObj.f.id))
          if (!bld) return null
          const sorted = [...bld.floors].sort((a, b) => a.level - b.level)
          const i = sorted.findIndex((fl) => fl.id === floorObj.f.id)
          const up = sorted[i + 1]
          const down = sorted[i - 1]
          const copyTo = (fl: { id: string }) => execute(new AddObjectCommand({ floorId: fl.id }, { ...obj, id: uid("o") }))
          if (!up && !down) return null
          return (
            <div className="mt-1 flex flex-wrap gap-1">
              {down && <button type="button" className={btnStyle} style={neutral} onClick={() => copyTo(down)}>↓ копия: {down.name}</button>}
              {up && <button type="button" className={btnStyle} style={neutral} onClick={() => copyTo(up)}>↑ копия: {up.name}</button>}
            </div>
          )
        })()}
        </>
      )
    }
  }

  return (
    <div
      className="absolute right-3 top-[10rem] z-20 w-64 max-w-[calc(100vw-1.5rem)] max-h-[calc(100%-17rem)] overflow-y-auto overflow-x-hidden rounded-2xl p-3 shadow-2xl backdrop-blur-xl"
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

const PHASES: { p: "demolish" | "new" | undefined; l: string; c: string }[] = [
  { p: undefined, l: "Существ.", c: "rgba(148,163,184,0.25)" },
  { p: "demolish", l: "Демонтаж", c: "#ef4444" },
  { p: "new", l: "Новая", c: "#16a34a" },
]

function PhaseButtons({ value, onPick, noun }: { value: "demolish" | "new" | undefined; onPick: (p: "demolish" | "new" | undefined) => void; noun: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: TOKENS.muted }}>Перепланировка: {noun}</span>
      <div className="flex gap-1">
        {PHASES.map((ph) => {
          const on = value === ph.p
          return (
            <button key={ph.l} type="button" onClick={() => onPick(ph.p)} className="flex-1 rounded-md py-1 text-[10px] font-medium" style={{ background: on ? ph.c : "rgba(148,163,184,0.1)", color: on ? "#fff" : TOKENS.text }}>{ph.l}</button>
          )
        })}
      </div>
    </div>
  )
}
