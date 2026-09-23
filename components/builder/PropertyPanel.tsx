"use client"

// ADR: Правая панель свойств (§5.5). Контекст выделения: стена (длина/высота/толщина/тип),
// комната (площадь + привязка premise + статус), объект (ассет). Фаза 1 — чтение реальных
// значений из документа/ядра; инлайн-редактирование полей — Фаза 2.

import { floorRooms } from "@/lib/builder/rooms"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { roomWallsToDelete } from "@/lib/builder/room-delete"
import { type IslandTarget, findFloor, AddObjectCommand, SetObjectRotationCommand, SetObjectScaleCommand, SetObjectSizeCommand, DeleteObjectCommand, SetWallPropsCommand, DeleteWallCommand, MoveNodeCommand, CompositeCommand, SetOpeningSizeCommand, DeleteOpeningCommand, SetStairCommand, DeleteStairCommand, SetIslandCommand, DeleteIslandCommand, ApplyRoomPresetCommand, LinkPremiseCommand, UpdateMepRunCommand, UpdateMepDeviceCommand, DeleteMepRunCommand, DeleteMepDeviceCommand, UpdateSectionCommand, DeleteSectionCommand, SetWallPhaseCommand, SetOpeningPhaseCommand, UpdateAnnotationCommand, DeleteAnnotationCommand, SetRoomNameCommand, SetOpeningExitCommand, ToggleExitReverseCommand, MoveStairCommand, setColumnSizeCommand, SetRoomUseCommand } from "@/core/document/commands"
import { ISLAND_KINDS, MEP_SYSTEMS, type IslandKind, type MepSystem } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, deviceNameKey, polylineLengthMm } from "@/lib/builder/mep/catalog"
import { autoAssignGroups, calcPanels, groupKindOf } from "@/lib/builder/mep/panel-calc"
import { roomExplication } from "@/lib/builder/drawing/schedules"
import { usePremiseStore } from "@/store/premise-store"
import { createIslandPremise, syncIslandPremiseArea } from "@/app/actions/builder-premise"
import { PremisePicker, premiseItems } from "./PremisePicker"
import { IslandTenantPicker } from "./IslandTenantPicker"
import { uid } from "@/core/id"
import type { WallKind } from "@/core/geometry/wall-graph"
import { presetsFor } from "@/lib/builder/openings"
import { ISLAND_PRESETS, islandArea, islandLabel, isParking, isRoofPlace, isWallMounted, mountHeight } from "@/lib/builder/islands"
import { footprintArea } from "@/lib/builder/drawing/indicators"

/** Ключи подписей типов кровли — те же, что в панели уровней. */
const ROOF_LABEL = {
  flat: "roofFlat",
  gable: "roofGable",
  hip: "roofHip",
  fourslope: "roofFourslope",
  mansard: "roofMansard",
  shed: "roofShed",
} as const satisfies Record<string, string>
import { ROOM_PRESETS } from "@/lib/builder/room-presets"
import { distance } from "@/core/geometry/math"
import { columnRow } from "@/lib/builder/plan-editor-math"
import { suggestRoomName } from "@/lib/builder/room-naming"
import { openingsOfRoom } from "@/lib/builder/validate"
import { autoRoomUse, roomUse as roomUseOf, type RoomUse } from "@/lib/builder/room-use"
import { TOKENS, STATUS_COLOR } from "@/lib/builder/materials"
import { useT, useLocale } from "@/lib/i18n/client"
import { formatNumberL } from "@/lib/i18n/format"
import type { Messages } from "@/lib/i18n/messages"

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span style={{ color: TOKENS.muted }}>{label}</span>
      <span className="min-w-0 truncate text-right font-medium" title={value} style={{ color: accent ?? TOKENS.text }}>{value}</span>
    </div>
  )
}

const KIND_LABEL = { exterior: "wallKindExterior", interior: "wallKindInterior", partition: "wallKindPartition" } as const satisfies Record<string, string>

type PropsKey = keyof Messages["adminBuilder"]["props"]

// Обозначения единиц в казахском те же, что в русском (м, мм, м², кВт) — в
// словаре им не место, иначе пришлось бы дублировать строку ради одной буквы.
const M = "м"
const MM = "мм"
const M2 = "м²"

export function PropertyPanel({ buildingId }: { buildingId?: string } = {}) {
  const { t } = useT()
  const locale = useLocale()
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const selection = useEditorStore((s) => s.selection)
  const plan2d = useEditorStore((s) => s.cameraMode) === "plan2d"
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode)
  const assetBaseSizes = useEditorStore((s) => s.assetBaseSizes)
  const columnSizeAll = useEditorStore((s) => s.columnSizeAll)
  const setColumnSizeAll = useEditorStore((s) => s.setColumnSizeAll)
  const premisesById = usePremiseStore((s) => s.byId)
  // вид арендного места одной функцией: она нужна и в кровле, и в самом месте
  const islandKindName = (kind: IslandKind) => t(`adminBuilder.islands.kinds.${kind}`)
  const resolvePremise = usePremiseStore((s) => s.resolve)

  let title = t("adminBuilder.props.project")
  const rows: React.ReactNode[] = []
  let controls: React.ReactNode = null

  if (selection.type === "none") {
    title = doc.name
    const floors = doc.buildings.flatMap((b) => b.floors)
    rows.push(<Row key="b" label={t("adminBuilder.props.buildings")} value={String(doc.buildings.length)} />)
    rows.push(<Row key="f" label={t("adminBuilder.props.floors")} value={String(floors.length)} />)
    rows.push(<Row key="o" label={t("adminBuilder.props.objects")} value={String(doc.site.objects.length)} />)
    rows.push(<Row key="h" label={t("adminBuilder.props.hint")} value={t("adminBuilder.props.hintValue")} />)
  } else if (selection.type === "wall" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const e = f?.wallGraph.edges[selection.id]
    if (f && e) {
      title = t("adminBuilder.props.wall")
      const a = f.wallGraph.nodes[e.a]
      const b = f.wallGraph.nodes[e.b]
      const len = a && b ? distance(a, b) / 1000 : 0
      rows.push(<Row key="k" label={t("adminBuilder.props.wallKind")} value={e.kind in KIND_LABEL ? t(`adminBuilder.props.${KIND_LABEL[e.kind as keyof typeof KIND_LABEL]}`) : e.kind} />)
      rows.push(<Row key="h" label={t("adminBuilder.props.height")} value={`${(e.height / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="t" label={t("adminBuilder.props.thickness")} value={`${e.thickness} ${MM}`} />)
      rows.push(<Row key="fl" label={t("adminBuilder.props.floor")} value={f.name} />)
      const fid = selection.floorId
      const eid = selection.id
      const kinds: { k: WallKind; l: PropsKey }[] = [{ k: "exterior", l: "wallKindExteriorShort" }, { k: "interior", l: "wallKindInteriorShort" }, { k: "partition", l: "wallKindPartitionShort" }]
      const thicks = [100, 150, 200, 300]
      rows.push(<Row key="ph" label={t("adminBuilder.props.status")} value={t(e.phase === "demolish" ? "adminBuilder.props.phaseDemolish" : e.phase === "new" ? "adminBuilder.props.phaseNew" : "adminBuilder.props.phaseExisting")} accent={e.phase === "demolish" ? "#f87171" : e.phase === "new" ? "#4ade80" : undefined} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <PhaseButtons value={e.phase} noun={t("adminBuilder.props.phaseNounWall")} onPick={(ph) => execute(new SetWallPhaseCommand(fid, [eid], ph))} />
          {a && b && (
            <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }} title={t("adminBuilder.props.lengthHint")}>
              {t("adminBuilder.props.lengthM")}
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
            {t("adminBuilder.props.heightM")}
            <input type="number" step="0.1" min="2" max="6" defaultValue={(e.height / 1000).toFixed(1)} key={`h${eid}${e.height}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetWallPropsCommand(fid, eid, { height: Math.max(2000, Math.min(6000, Math.round(v * 1000))) })) }}
              className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <div className="flex gap-1">
            {thicks.map((mm) => (
              <button key={mm} type="button" onClick={() => execute(new SetWallPropsCommand(fid, eid, { thickness: mm }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: e.thickness === mm ? TOKENS.accent : "rgba(148,163,184,0.12)", color: e.thickness === mm ? "#0b1220" : TOKENS.text }}>{mm}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {kinds.map((kd) => (
              <button key={kd.k} type="button" onClick={() => execute(new SetWallPropsCommand(fid, eid, { kind: kd.k }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: e.kind === kd.k ? TOKENS.accent : "rgba(148,163,184,0.12)", color: e.kind === kd.k ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.props.${kd.l}`)}</button>
            ))}
          </div>
          <button type="button" onClick={() => execute(new DeleteWallCommand(fid, eid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteWall")}</button>
        </div>
      )
    }
  } else if (selection.type === "room" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    if (f) {
      const room = floorRooms(f).find((r) => r.id === selection.id)
      title = t("adminBuilder.props.premise")
      const drawnM2 = room ? room.areaMm2 / 1_000_000 : null
      const use: RoomUse = room ? roomUseOf(f, room) : "rent"
      const linkKey = use === "rent" ? f.premiseLinks[selection.id] : undefined
      const premise = linkKey ? resolvePremise(linkKey) : undefined
      if (use !== "rent") {
        rows.push(<Row key="u" label={t("adminBuilder.props.use")} value={t(use === "common" ? "adminBuilder.props.useCommon" : "adminBuilder.props.useTech")} />)
        if (drawnM2 != null) rows.push(<Row key="a" label={t("adminBuilder.props.area")} value={`${drawnM2.toFixed(1)} ${M2}`} />)
      } else if (premise) {
        rows.push(<Row key="n" label={t("adminBuilder.props.card")} value={t("adminBuilder.props.cardNumber", { number: premise.number })} />)
        rows.push(<Row key="t" label={t("adminBuilder.props.tenant")} value={premise.tenantName ?? t("adminBuilder.props.free")} />)
        rows.push(<Row key="s" label={t("adminBuilder.props.status")} value={t(`adminBuilder.premiseStatus.${premise.status}`)} accent={STATUS_COLOR[premise.status]} />)
        if (premise.debt > 0) rows.push(<Row key="d" label={t("adminBuilder.props.debt")} value={`${formatNumberL(locale, Math.round(premise.debt))} ₸`} accent="#f87171" />)
        // Площадь по договору — условие договора, рисунком не меняется; расхождение показываем.
        if (premise.areaM2 != null) rows.push(<Row key="ac" label={t("adminBuilder.props.byContract")} value={`${premise.areaM2.toFixed(1)} ${M2}`} />)
        if (drawnM2 != null) {
          const pct = premise.areaM2 ? Math.round(((drawnM2 - premise.areaM2) / premise.areaM2) * 100) : null
          const off = pct != null && Math.abs(pct) >= 2
          rows.push(<Row key="ag" label={t("adminBuilder.props.inModel")} value={`${drawnM2.toFixed(1)} ${M2}${off ? ` (${pct! > 0 ? "+" : ""}${pct}%)` : ""}`} accent={off ? "#fbbf24" : undefined} />)
        }
      } else {
        if (drawnM2 != null) rows.push(<Row key="a" label={t("adminBuilder.props.areaInModel")} value={`${drawnM2.toFixed(1)} ${M2}`} />)
        rows.push(<Row key="p" label={t("adminBuilder.props.card")} value={linkKey ? t("adminBuilder.props.cardMissing", { key: linkKey }) : t("adminBuilder.props.cardUnlinked")} />)
      }
      if (room) {
        // периметр и проёмы: нужны для отделки и при разговоре с арендатором
        const per = room.polygon.reduce((sum, p, i) => {
          const q = room.polygon[(i + 1) % room.polygon.length]
          return sum + Math.hypot(q.x - p.x, q.y - p.y)
        }, 0)
        const ops = openingsOfRoom(f, room)
        const win = ops.filter((o) => o.type === "window").length
        const doors = ops.length - win
        rows.push(<Row key="per" label={t("adminBuilder.props.perimeter")} value={`${(per / 1000).toFixed(1).replace(".", ",")} ${M}`} />)
        rows.push(<Row key="ops" label={t("adminBuilder.props.windowsDoors")} value={`${win} / ${doors}`} />)
      }
      rows.push(<Row key="fl" label={t("adminBuilder.props.floor")} value={f.name} />)
      const fid = selection.floorId
      const rid = selection.id
      const options = Array.from(premisesById.values())
      const auto = room ? autoRoomUse(f, room) : { use: "rent" as RoomUse, name: null }
      const explicit = f.roomUse?.[rid]
      controls = (
        <div className="mt-2">
          <p className="pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.useSection")}</p>
          <div className="mb-1 flex gap-1">
            {(["rent", "common", "tech"] as const).map((u) => (
              <button key={u} type="button" onClick={() => execute(new SetRoomUseCommand(fid, rid, u === auto.use ? undefined : u))}
                title={t(u === "rent" ? "adminBuilder.props.useRentHint" : u === "common" ? "adminBuilder.props.useCommonHint" : "adminBuilder.props.useTechHint")}
                className="flex-1 rounded-md py-1 text-[11px] font-medium" style={{ background: use === u ? TOKENS.accent : "rgba(148,163,184,0.12)", color: use === u ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.roomUse.${u}`)}</button>
            ))}
          </div>
          <p className="mb-2 text-[10px]" style={{ color: TOKENS.muted }}>{explicit ? t("adminBuilder.props.useManual") : auto.name ? t("adminBuilder.props.useAutoNamed", { name: t(`adminBuilder.roomNames.${auto.name}`).toLowerCase() }) : t("adminBuilder.props.useAuto")}</p>
          <label className="mb-2 flex flex-col gap-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.roomName")}
            <input
              id="room-name"
              defaultValue={f.roomNames?.[rid] ?? ""}
              key={`rn${rid}${f.roomNames?.[rid] ?? ""}`}
              placeholder={auto.name ? t(`adminBuilder.roomNames.${auto.name}`) : t("adminBuilder.props.roomNamePlaceholder")}
              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur() }}
              onBlur={(ev) => { const v = ev.target.value.trim().slice(0, 60); if (v !== (f.roomNames?.[rid] ?? "")) execute(new SetRoomNameCommand(fid, rid, v)) }}
              className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs normal-case tracking-normal"
              style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            />
          </label>
          {room && !f.roomNames?.[rid] && (() => {
            // подсказка по геометрии — то же правило, что у кнопки «Подставить наименования»
            const hintKey = suggestRoomName(f, room)
            if (!hintKey) return null
            const hint = t(`adminBuilder.roomNames.${hintKey}`)
            return (
              <button
                type="button"
                onClick={() => execute(new SetRoomNameCommand(fid, rid, hint))}
                className="mb-2 w-full rounded-md py-1 text-[11px] font-medium"
                style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.accent }}
              >
                {t("adminBuilder.props.roomNameSuggest", { name: hint })}
              </button>
            )
          })()}
          {options.length > 0 && use === "rent" && (
            <div className="mb-2">
              <PremisePicker
                label={t("adminBuilder.props.premiseCard")}
                items={premiseItems(options, (n) => t("adminBuilder.picker.floorGroup", { number: n }))}
                value={premise?.id ?? null}
                emptyLabel={t("adminBuilder.props.notLinked")}
                onChange={(id) => execute(new LinkPremiseCommand({ floorId: fid }, rid, id))}
              />
            </div>
          )}
          <p className="pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.roomStyle")}</p>
          <div className="flex flex-wrap gap-1">
            {ROOM_PRESETS.map((pr) => (
              <button key={pr.id} type="button" onClick={() => execute(new ApplyRoomPresetCommand(fid, rid, pr))} className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "rgba(167,139,250,0.16)", color: TOKENS.accent2 }}>{t(`adminBuilder.roomPresets.${pr.id}`)}</button>
            ))}
          </div>
          <button
            type="button"
            title={t("adminBuilder.props.deleteRoomHint")}
            onClick={() => {
              const ids = roomWallsToDelete(f.wallGraph, rid)
              const commands = [
                ...(linkKey ? [new LinkPremiseCommand({ floorId: fid }, rid, null)] : []),
                ...ids.map((id) => new DeleteWallCommand(fid, id)),
              ]
              if (commands.length) execute(new CompositeCommand(t("adminBuilder.props.deleteRoomCommand"), commands))
              useEditorStore.getState().setSelection({ type: "none" })
            }}
            className="mt-2 w-full rounded-md py-1.5 text-xs font-medium"
            style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
          >
            {t("adminBuilder.props.deleteRoom")}
          </button>
        </div>
      )
    }
  } else if (selection.type === "opening" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const op = f?.openings.find((o) => o.id === selection.id)
    title = t(op?.type === "window" ? "adminBuilder.props.window" : "adminBuilder.props.door")
    if (f && op) {
      const fid = selection.floorId
      const oid = selection.id
      rows.push(<Row key="w" label={t("adminBuilder.props.width")} value={`${(op.width / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="h" label={t("adminBuilder.props.height")} value={`${(op.height / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="s" label={t("adminBuilder.props.sill")} value={`${(op.sillHeight / 1000).toFixed(2)} ${M}`} />)
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
          <PhaseButtons value={op.phase} noun={t(op.phase === "demolish" ? "adminBuilder.props.phaseNounOpeningClosed" : "adminBuilder.props.phaseNounOpening")} onPick={(ph) => execute(new SetOpeningPhaseCommand(fid, oid, ph))} />
          {op.type === "door" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.doorPurpose")}</span>
              <div className="flex gap-1">
                {([[undefined, "doorPlain", "rgba(148,163,184,0.25)"], ["main", "doorMain", "#2563eb"], ["emergency", "doorEmergency", "#16a34a"]] as const).map(([v, label, c]) => (
                  <button key={label} type="button" onClick={() => execute(new SetOpeningExitCommand(fid, oid, v))} className="flex-1 rounded-md py-1 text-[10px] font-medium" style={{ background: op.exit === v ? c : "rgba(148,163,184,0.1)", color: op.exit === v ? "#fff" : TOKENS.text }}>{t(`adminBuilder.props.${label}`)}</button>
                ))}
              </div>
              {op.exit && (
                <button type="button" onClick={() => execute(new ToggleExitReverseCommand(fid, oid))} className="rounded-md py-1 text-[10px] font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }} title={t("adminBuilder.props.reverseArrowHint")}>
                  {t("adminBuilder.props.reverseArrow")}
                </button>
              )}
            </div>
          )}
          {numInput(t("adminBuilder.props.widthM"), op.width, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { width: mm })), 400, 6000)}
          {numInput(t("adminBuilder.props.heightM"), op.height, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { height: mm })), 400, 3000)}
          {numInput(t("adminBuilder.props.sillM"), op.sillHeight, (mm) => execute(new SetOpeningSizeCommand(fid, oid, { sillHeight: mm })), 0, 2000)}
          <div className="flex flex-wrap gap-1">
            {presetsFor(op.type).map((pr) => (
              <button key={pr.variant} type="button" onClick={() => execute(new SetOpeningSizeCommand(fid, oid, { variant: pr.variant, width: pr.width, height: pr.height, sillHeight: pr.sill }))} className="rounded-md px-1.5 py-1 text-[10px]" style={{ background: op.variant === pr.variant ? TOKENS.accent : "rgba(148,163,184,0.12)", color: op.variant === pr.variant ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.openingPresets.${pr.label}`)}</button>
            ))}
          </div>
          <button type="button" onClick={() => execute(new DeleteOpeningCommand(fid, oid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteOpening")}</button>
        </div>
      )
    }
  } else if (selection.type === "annotation" && selection.floorId && selection.id) {
    const fid = selection.floorId
    const aid = selection.id
    const an = findFloor(doc, fid)?.annotations?.find((x) => x.id === aid)
    title = t(an?.kind === "text" ? "adminBuilder.props.note" : "adminBuilder.props.dimension")
    const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
    if (an?.kind === "dim") {
      rows.push(<Row key="l" label={t("adminBuilder.props.length")} value={`${Math.round(Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y))} ${MM}`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.dimOffset")}
            <input id="annotation-offset" type="number" step="0.1" defaultValue={(an.offset / 1000).toFixed(2)} key={`ao${aid}${an.offset}`} onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new UpdateAnnotationCommand(fid, aid, { offset: Math.round(v * 1000) })) }} className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          <button type="button" onClick={() => execute(new UpdateAnnotationCommand(fid, aid, { offset: -an.offset }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>{t("adminBuilder.props.dimFlip")}</button>
          <button type="button" onClick={() => { execute(new DeleteAnnotationCommand(fid, aid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteDim")}</button>
        </div>
      )
    } else if (an?.kind === "text") {
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5 text-[11px]" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.text")}
            <textarea id="annotation-text" rows={2} defaultValue={an.text} key={`at${aid}${an.text}`} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== an.text) execute(new UpdateAnnotationCommand(fid, aid, { text: v.slice(0, 200) })) }} className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          <button type="button" onClick={() => { execute(new DeleteAnnotationCommand(fid, aid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteNote")}</button>
        </div>
      )
    }
  } else if (selection.type === "section" && selection.buildingId && selection.id) {
    const bid = selection.buildingId
    const sid = selection.id
    const sec = doc.buildings.find((b) => b.id === bid)?.sections?.find((x) => x.id === sid)
    title = sec ? t("adminBuilder.props.sectionNamed", { name: sec.name }) : t("adminBuilder.props.section")
    if (sec) {
      const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y) / 1000
      rows.push(<Row key="l" label={t("adminBuilder.props.sectionLength")} value={`${L.toFixed(2)} ${M}`} />)
      rows.push(<Row key="v" label={t("adminBuilder.props.sectionLook")} value={t(sec.look === 1 ? "adminBuilder.props.sectionLookLeft" : "adminBuilder.props.sectionLookRight")} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5 text-[11px]" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.sectionMark")}
            <input id="section-name" defaultValue={sec.name} key={`sn${sid}${sec.name}`} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== sec.name) execute(new UpdateSectionCommand(bid, sid, { name: v.slice(0, 12) })) }} className="w-full rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <button type="button" onClick={() => execute(new UpdateSectionCommand(bid, sid, { look: sec.look === 1 ? -1 : 1 }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>{t("adminBuilder.props.sectionFlip")}</button>
          {buildingId && (
            <a href={`/admin/builder/${buildingId}/sheet?view=section:${sid}`} target="_blank" rel="noreferrer" className="rounded-md py-1.5 text-center text-xs font-medium" style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}>{t("adminBuilder.props.sectionSheet")}</a>
          )}
          <button type="button" onClick={() => { execute(new DeleteSectionCommand(bid, sid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteSection")}</button>
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
      title = t("adminBuilder.props.mepRun")
      if (run) {
        const info = MEP_SYSTEM_INFO[run.system]
        rows.push(<Row key="s" label={t("adminBuilder.props.mepSystem")} value={`${info.section} · ${t(`adminBuilder.mep.systems.${run.system}`)}`} accent={info.color} />)
        rows.push(<Row key="l" label={t("adminBuilder.props.length")} value={`${(polylineLengthMm(run.points) / 1000).toFixed(2)} ${M}`} />)
        rows.push(<Row key="p" label={t("adminBuilder.props.mepSegments")} value={String(run.points.length - 1)} />)
        controls = (
          <div className="mt-2 flex flex-col gap-1.5">
            {field(t("adminBuilder.props.mepSystem"), (
              <select id="mep-run-system" value={run.system} onChange={(ev) => execute(new UpdateMepRunCommand(fid, id, { system: ev.target.value as MepSystem, size: MEP_SYSTEM_INFO[ev.target.value as MepSystem].size }))} className={inputCls} style={inputStyle}>
                {MEP_SYSTEMS.map((sys) => <option key={sys} value={sys} style={{ color: "#0b1220" }}>{MEP_SYSTEM_INFO[sys].section} · {t(`adminBuilder.mep.systems.${sys}`)}</option>)}
              </select>
            ))}
            {field(t(info.shape === "duct" ? "adminBuilder.props.mepDuct" : info.shape === "pipe" ? "adminBuilder.props.mepPipe" : "adminBuilder.props.mepCable"), (
              <input id="mep-run-size" defaultValue={run.size} key={`rs${id}${run.size}`} onBlur={(ev) => { if (ev.target.value !== run.size) execute(new UpdateMepRunCommand(fid, id, { size: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            {field(t("adminBuilder.props.mepHeight"), (
              <input id="mep-run-height" type="number" step="0.05" min="0" max="20" defaultValue={(run.height / 1000).toFixed(2)} key={`rh${id}${run.height}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && Math.round(v * 1000) !== run.height) execute(new UpdateMepRunCommand(fid, id, { height: Math.max(0, Math.round(v * 1000)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {field(t("adminBuilder.props.mepRunLabel"), (
              <input id="mep-run-label" defaultValue={run.label} key={`rl${id}${run.label}`} placeholder={t("adminBuilder.props.mepRunLabelPlaceholder")} onBlur={(ev) => { if (ev.target.value !== run.label) execute(new UpdateMepRunCommand(fid, id, { label: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            <button type="button" onClick={() => { execute(new DeleteMepRunCommand(fid, id)); useEditorStore.getState().setSelection({ type: "none" }) }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteRun")}</button>
          </div>
        )
      }
    } else {
      const dev = f?.mepDevices.find((d) => d.id === id)
      title = t("adminBuilder.props.mepDevice")
      if (dev) {
        const info = MEP_SYSTEM_INFO[dev.system]
        const di = MEP_DEVICE_BY_KIND[dev.kind]
        rows.push(<Row key="s" label={t("adminBuilder.props.mepSystem")} value={`${info.section} · ${t(`adminBuilder.mep.systems.${dev.system}`)}`} accent={info.color} />)
        rows.push(<Row key="k" label={t("adminBuilder.props.mepDevice")} value={t(`adminBuilder.mep.devices.${deviceNameKey(dev.kind)}`)} />)
        rows.push(<Row key="xy" label={t("adminBuilder.props.xy")} value={`${(dev.at.x / 1000).toFixed(2)} · ${(dev.at.y / 1000).toFixed(2)} ${M}`} />)
        controls = (
          <div className="mt-2 flex flex-col gap-1.5">
            {field(t("adminBuilder.props.mepLabel"), (
              <input id="mep-dev-label" defaultValue={dev.label} key={`dl${id}${dev.label}`} placeholder={t(di?.riser ? "adminBuilder.props.mepRiserPlaceholder" : "adminBuilder.props.mepPanelPlaceholder")} onBlur={(ev) => { if (ev.target.value !== dev.label) execute(new UpdateMepDeviceCommand(fid, id, { label: ev.target.value.trim() })) }} className={inputCls} style={inputStyle} />
            ))}
            {!di?.riser && field(t("adminBuilder.props.mepMountHeight"), (
              <input id="mep-dev-height" type="number" step="0.05" min="0" max="20" defaultValue={(dev.height / 1000).toFixed(2)} key={`dh${id}${dev.height}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && Math.round(v * 1000) !== dev.height) execute(new UpdateMepDeviceCommand(fid, id, { height: Math.max(0, Math.round(v * 1000)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {(dev.power !== undefined || di?.power !== undefined || dev.kind === "panel") && field(t("adminBuilder.props.mepPower"), (
              <input id="mep-dev-power" type="number" step="10" min="0" defaultValue={dev.power ?? di?.power ?? 0} key={`dp${id}${dev.power}`} onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v) && v !== dev.power) execute(new UpdateMepDeviceCommand(fid, id, { power: Math.max(0, Math.round(v)) })) }} className={inputCls} style={inputStyle} />
            ))}
            {groupKindOf(dev) && f && (() => {
              const panels = (f.mepDevices ?? []).filter((d) => d.kind === "panel")
              return (
                <div className="flex gap-1">
                  {field(t("adminBuilder.props.mepPanel"), (
                    <select id="mep-dev-panel" value={dev.panelId ?? ""} onChange={(ev) => execute(new UpdateMepDeviceCommand(fid, id, { panelId: ev.target.value || undefined }))} className={inputCls} style={inputStyle}>
                      <option value="" style={{ color: "#0b1220" }}>—</option>
                      {panels.map((pn) => <option key={pn.id} value={pn.id} style={{ color: "#0b1220" }}>{pn.label || t("adminBuilder.props.mepPanelDefault")}</option>)}
                    </select>
                  ))}
                  {field(t("adminBuilder.props.mepGroup"), (
                    <input id="mep-dev-group" type="number" min="1" max="99" defaultValue={dev.group ?? ""} key={`dg${id}${dev.group}`} onBlur={(ev) => { const v = parseInt(ev.target.value, 10); execute(new UpdateMepDeviceCommand(fid, id, { group: Number.isFinite(v) && v > 0 ? v : undefined })) }} className={inputCls} style={inputStyle} />
                  ))}
                </div>
              )
            })()}
            {dev.kind === "panel" && f && (() => {
              const numbers = new Map(roomExplication(f).map((r) => [r.roomId, r.number]))
              const calc = calcPanels(f, t, (rid: string) => numbers.get(rid) ?? null).find((c) => c.panelId === id)
              return (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => {
                    const plan = autoAssignGroups(f).filter((a) => a.panelId === id)
                    if (plan.length) execute(new CompositeCommand(t("adminBuilder.props.splitGroupsCommand"), plan.map((a) => new UpdateMepDeviceCommand(fid, a.deviceId, { panelId: a.panelId, group: a.group }))))
                  }} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.text }} title={t("adminBuilder.props.splitGroupsHint")}>
                    {t("adminBuilder.props.splitGroups")}
                  </button>
                  {calc && calc.groups.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]" style={{ fontVariantNumeric: "tabular-nums", color: TOKENS.text }}>
                        <thead><tr style={{ color: TOKENS.muted }}><th className="text-left">{t("adminBuilder.props.thGroup")}</th><th className="text-right">{t("adminBuilder.props.thPowerKw")}</th><th className="text-right">{t("adminBuilder.props.thCurrent")}</th><th className="text-right">{t("adminBuilder.props.thBreaker")}</th><th className="text-right">{t("adminBuilder.props.thCable")}</th><th className="text-right">{t("adminBuilder.props.thDrop")}</th></tr></thead>
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
                      <p className="mt-1 text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.panelTotals", { inst: (calc.pInstW / 1000).toFixed(2), calc: (calc.pCalcW / 1000).toFixed(2), current: calc.currentA.toFixed(1), breaker: calc.inputBreakerA })}</p>
                    </div>
                  )}
                </div>
              )
            })()}
            <div className="flex gap-1">
              <button type="button" onClick={() => execute(new UpdateMepDeviceCommand(fid, id, { rotation: (dev.rotation + 90) % 360 }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
              <button type="button" onClick={() => { execute(new DeleteMepDeviceCommand(fid, id)); useEditorStore.getState().setSelection({ type: "none" }) }} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.remove")}</button>
            </div>
            <p className="text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.arrowsHint")}</p>
          </div>
        )
      }
    }
  } else if (selection.type === "roof" && selection.floorId) {
    // Кровля — полноценный элемент: её площадь, тип и места, которые на ней
    // сдаются (антенны операторов, базовые станции).
    const f = findFloor(doc, selection.floorId)
    title = t("adminBuilder.props.roofTitle")
    if (f) {
      const fid = selection.floorId
      const roof = f.roof
      const footM2 = footprintArea(f.wallGraph)
      // скатная кровля длиннее плана: делим на косинус уклона и добавляем свес
      const pitch = roof && roof.type !== "flat" ? (roof.pitchDeg || 0) : 0
      const slopeK = Math.cos((pitch * Math.PI) / 180) || 1
      const roofM2 = Math.round((footM2 / slopeK) * 10) / 10
      const places = (f.islands ?? []).filter((i) => isRoofPlace(i))
      const taken = places.filter((i) => (i.tenant ?? "").trim() || resolvePremise(f.premiseLinks?.[i.id] ?? ""))
      rows.push(<Row key="fl" label={t("adminBuilder.props.floor")} value={f.name} />)
      rows.push(<Row key="t" label={t("adminBuilder.props.roofType")} value={roof ? t(`adminBuilder.props.${ROOF_LABEL[roof.type]}`) : t("adminBuilder.props.roofNone")} />)
      if (roof && roof.type !== "flat") rows.push(<Row key="p" label={t("adminBuilder.props.roofPitch")} value={`${roof.pitchDeg}°`} />)
      rows.push(<Row key="a" label={t("adminBuilder.props.roofPlanArea")} value={`${Math.round(footM2 * 10) / 10} ${M2}`} />)
      if (pitch > 0) rows.push(<Row key="ar" label={t("adminBuilder.props.roofArea")} value={`${roofM2} ${M2}`} />)
      rows.push(<Row key="pl" label={t("adminBuilder.props.roofPlaces")} value={`${places.length}${places.length ? t("adminBuilder.props.roofLeased", { count: taken.length }) : ""}`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          {places.length > 0 && (
            <div className="flex flex-col gap-1">
              {places.map((p) => {
                const prem = resolvePremise(f.premiseLinks?.[p.id] ?? "")
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => useEditorStore.getState().setSelection({ type: "island", id: p.id, floorId: fid })}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[11px]"
                    style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
                  >
                    <span>{islandLabel(p, islandKindName)}</span>
                    <span style={{ color: prem?.tenantName || p.tenant ? TOKENS.accent : TOKENS.muted }}>{prem?.tenantName || p.tenant || t("adminBuilder.props.free")}</span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.roofNote")}</p>
        </div>
      )
    }
  } else if (selection.type === "island" && selection.id) {
    // место живёт на этаже или на участке (парковка) — панель одна и та же
    const onSite = !selection.floorId || selection.floorId === "site"
    const f = onSite ? null : findFloor(doc, selection.floorId as string)
    const islandTarget: IslandTarget = onSite ? { site: true } : { floorId: selection.floorId as string }
    const links = onSite ? doc.site.premiseLinks ?? {} : f?.premiseLinks ?? {}
    const isl = (onSite ? doc.site.islands ?? [] : f?.islands ?? []).find((x) => x.id === selection.id)
    title = t(isl && isParking(isl) ? "adminBuilder.props.parkingPlace" : "adminBuilder.props.rentPlace")
    if (isl) {
      const iid = selection.id
      const num = (v: string) => parseFloat(v.replace(",", "."))
      const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
      rows.push(<Row key="n" label={t("adminBuilder.props.name")} value={islandLabel(isl, islandKindName)} />)
      rows.push(<Row key="s" label={t("adminBuilder.props.size")} value={`${isl.width}×${isl.depth} ${MM}`} />)
      rows.push(<Row key="a" label={t("adminBuilder.props.area")} value={`${islandArea(isl).toFixed(2)} ${M2}`} />)
      rows.push(<Row key="xy" label={t("adminBuilder.props.xy")} value={`${(isl.position.x / 1000).toFixed(2)} · ${(isl.position.y / 1000).toFixed(2)} ${M}`} />)
      // привязка к карточке помещения: если она есть, арендатор и статус —
      // из базы, а не из подписи руками
      const islPremise = resolvePremise(links[iid] ?? "")
      const islOptions = Array.from(premisesById.values())
      if (islPremise) {
        rows.push(<Row key="st" label={t("adminBuilder.props.status")} value={t(`adminBuilder.premiseStatus.${islPremise.status}`)} />)
        if (islPremise.tenantName) rows.push(<Row key="tn" label={t("adminBuilder.props.tenant")} value={islPremise.tenantName} />)
      } else if (isl.tenant) rows.push(<Row key="t" label={t("adminBuilder.props.tenant")} value={isl.tenant} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.islandKind")}
            <select
              id="island-kind"
              value={isl.kind}
              onChange={(ev) => {
                const kind = ev.target.value as IslandKind
                const pr = ISLAND_PRESETS[kind]
                // вид меняет и габарит — но только если размеры остались типовыми
                const typical = isl.width === ISLAND_PRESETS[isl.kind].width && isl.depth === ISLAND_PRESETS[isl.kind].depth
                execute(new SetIslandCommand(islandTarget, iid, typical ? { kind, width: pr.width, depth: pr.depth, height: pr.height } : { kind }))
              }}
              className="w-40 rounded-md bg-white/5 px-1.5 py-1 text-xs"
              style={inputStyle}
            >
              {ISLAND_KINDS.map((k) => <option key={k} value={k} style={{ color: "#0f172a" }}>{t(`adminBuilder.islands.kinds.${k}`)}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.islandName")}
            <input id="island-name" type="text" defaultValue={isl.name} key={`nm${iid}${isl.name}`} placeholder={t(`adminBuilder.islands.kinds.${isl.kind}`)}
              onBlur={(ev) => { const v = ev.target.value.trim().slice(0, 60); if (v !== isl.name) execute(new SetIslandCommand(islandTarget, iid, { name: v })) }}
              className="w-40 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.tenant")}
            <input id="island-tenant" type="text" defaultValue={isl.tenant} key={`tn${iid}${isl.tenant}`} placeholder={t("adminBuilder.props.islandTenantPlaceholder")}
              onBlur={(ev) => { const v = ev.target.value.trim().slice(0, 60); if (v !== isl.tenant) execute(new SetIslandCommand(islandTarget, iid, { tenant: v })) }}
              className="w-40 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
          </label>
          {([["widthMm", "width", isl.width], ["depthMm", "depth", isl.depth], ["heightMm", "height", isl.height],
             ...(isWallMounted(isl) || isRoofPlace(isl) ? [["mountMm", "mountHeight", mountHeight(isl)] as const] : [])] as const).map(([label, key, value]) => (
            <label key={key} className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
              {t(`adminBuilder.props.${label}`)}
              <input id={`island-${key}`} type="number" step="50" min="200" max="12000" defaultValue={value} key={`i${key}${iid}${value}`}
                onBlur={(ev) => {
                  const v = Math.round(num(ev.target.value))
                  if (!Number.isFinite(v) || v < 200 || v === value) return
                  const next = Math.min(12000, v)
                  execute(new SetIslandCommand(islandTarget, iid, { [key]: next }))
                  // Площадь карточки места = габариты объекта: меняем размер
                  // здесь — меняется площадь в «Помещениях» и эксп. сбор.
                  if (islPremise && (key === "width" || key === "depth")) {
                    const w = key === "width" ? next : isl.width
                    const d = key === "depth" ? next : isl.depth
                    void syncIslandPremiseArea(islPremise.id, (w * d) / 1_000_000).then((row) => {
                      if (!row) return
                      const st = usePremiseStore.getState()
                      st.setRows([...Array.from(st.byId.values()).filter((x) => x.id !== row.id), { ...row, tenantName: islPremise.tenantName }])
                    }).catch(() => {})
                  }
                }}
                className="w-20 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={inputStyle} />
            </label>
          ))}
          <div className="flex gap-1">
            <button type="button" onClick={() => execute(new SetIslandCommand(islandTarget, iid, { rotationDeg: (isl.rotationDeg + 90) % 360 }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
            <button type="button" onClick={() => { execute(new DeleteIslandCommand(islandTarget, iid)); useEditorStore.getState().setSelection({ type: "none" }) }} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.remove")}</button>
          </div>
          {islOptions.length > 0 && (
            <PremisePicker
              label={t("adminBuilder.props.placeCard")}
              items={premiseItems(islOptions, (n) => t("adminBuilder.picker.floorGroup", { number: n }))}
              value={islPremise?.id ?? null}
              emptyLabel={t("adminBuilder.props.notLinked")}
              onChange={(id) => execute(new LinkPremiseCommand(islandTarget, iid, id))}
            />
          )}
          {buildingId && (
            <IslandTenantPicker
              buildingId={buildingId}
              premiseId={islPremise?.id ?? null}
              currentTenant={islPremise?.tenantName ?? null}
              linkPremise={(spaceId) => execute(new LinkPremiseCommand(islandTarget, iid, spaceId))}
              ensurePremise={async () => {
                const row = await createIslandPremise({ floorId: f?.sourceFloorId ?? null, buildingId, areaM2: islandArea(isl), name: islandLabel(isl, islandKindName) })
                if (!row) return null
                const st = usePremiseStore.getState()
                st.setRows([...Array.from(st.byId.values()), row])
                execute(new LinkPremiseCommand(islandTarget, iid, row.id))
                return row.id
              }}
            />
          )}
          {!islPremise && (
            <button
              type="button"
              disabled={!f?.sourceFloorId && !buildingId}
              title={t(f?.sourceFloorId ? "adminBuilder.props.createPlaceCardFloor" : buildingId ? "adminBuilder.props.createPlaceCardSite" : "adminBuilder.props.createPlaceCardNone")}
              onClick={() => {
                if (!f?.sourceFloorId && !buildingId) return
                void createIslandPremise({ floorId: f?.sourceFloorId ?? null, buildingId, areaM2: islandArea(isl), name: islandLabel(isl, islandKindName) })
                  .then((row) => {
                    if (!row) return
                    const st = usePremiseStore.getState()
                    st.setRows([...Array.from(st.byId.values()), row])
                    execute(new LinkPremiseCommand(islandTarget, iid, row.id))
                  })
                  .catch(() => {})
              }}
              className="rounded-md py-1.5 text-xs font-medium disabled:opacity-40"
              style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.accent }}
            >
              {t("adminBuilder.props.createPlaceCard")}
            </button>
          )}
          <p className="text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.arrowsHint")}</p>
          <p className="text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.islandNote")}</p>
        </div>
      )
    }
  } else if (selection.type === "stair" && selection.floorId && selection.id) {
    const f = findFloor(doc, selection.floorId)
    const st = f?.stairs.find((s) => s.id === selection.id)
    title = t(st?.shape === "porch" ? "adminBuilder.props.porch" : st?.shape === "ramp" ? "adminBuilder.props.ramp" : st?.shape === "elevator" ? "adminBuilder.props.elevator" : st?.shape === "column" ? "adminBuilder.props.column" : "adminBuilder.props.stair")
    if (f && st && st.shape === "column") {
      const fid = selection.floorId
      const sid = selection.id
      const num = (v: string) => parseFloat(v.replace(",", "."))
      const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
      rows.push(<Row key="sz" label={t("adminBuilder.props.columnSize")} value={`${st.width}×${st.depth ?? st.width} ${MM}`} />)
      rows.push(<Row key="xy" label={t("adminBuilder.props.xy")} value={`${(st.position.x / 1000).toFixed(2)} · ${(st.position.y / 1000).toFixed(2)} ${M}`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[11px]" style={{ color: TOKENS.text }} title={t("adminBuilder.props.columnSizeAllHint")}>
            <input id="column-size-all" type="checkbox" checked={columnSizeAll} onChange={(ev) => setColumnSizeAll(ev.target.checked)} />
            {t("adminBuilder.props.columnSizeAll", { count: f.stairs.filter((x) => x.shape === "column").length })}
          </label>
          {([["widthMm", "width", st.width], ["depthMm", "depth", st.depth ?? st.width]] as const).map(([label, key, value]) => (
            <label key={key} className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
              {t(`adminBuilder.props.${label}`)}
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
            // подпись кнопки короткая: в панели 120 px, полная формулировка в title
            return (
              <div className="flex gap-1">
                <button type="button" disabled={!rowX.length} onClick={() => align(rowX, t("adminBuilder.props.alignVerticalCommand"))} title={t("adminBuilder.props.alignVerticalHint")} className="flex-1 rounded-md py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>{t("adminBuilder.props.alignVertical")}{rowX.length ? ` (${rowX.length})` : ""}</button>
                <button type="button" disabled={!rowY.length} onClick={() => align(rowY, t("adminBuilder.props.alignHorizontalCommand"))} title={t("adminBuilder.props.alignHorizontalHint")} className="flex-1 rounded-md py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>{t("adminBuilder.props.alignHorizontal")}{rowY.length ? ` (${rowY.length})` : ""}</button>
              </div>
            )
          })()}
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteColumn")}</button>
        </div>
      )
    } else if (f && st && (st.shape === "porch" || st.shape === "ramp")) {
      const fid = selection.floorId
      const sid = selection.id
      const rise = st.rise ?? 450
      const n = Math.max(1, Math.round(rise / 170))
      rows.push(<Row key="w" label={t("adminBuilder.props.width")} value={`${(st.width / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="h" label={t("adminBuilder.props.rise")} value={`${(rise / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="n" label={t("adminBuilder.props.risers")} value={String(n)} />)
      const inputCls = "w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs"
      const inputStyle = { color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }
      const num = (v: string) => parseFloat(v.replace(",", "."))
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.widthM")}
            <input type="number" step="0.1" min="0.9" max="12" defaultValue={(st.width / 1000).toFixed(2)} key={`pw${sid}${st.width}`}
              onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { width: Math.max(900, Math.min(12000, Math.round(v * 1000))) })) }}
              className={inputCls} style={inputStyle} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.riseM")}
            <input type="number" step="0.05" min="0.15" max="2" defaultValue={(rise / 1000).toFixed(2)} key={`pr${sid}${rise}`}
              onBlur={(ev) => { const v = num(ev.target.value); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { rise: Math.max(150, Math.min(2000, Math.round(v * 1000))) })) }}
              className={inputCls} style={inputStyle} />
          </label>
          <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { rotationDeg: (st.rotationDeg + 90) % 360 }))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deletePorch")}</button>
        </div>
      )
    } else if (f && st) {
      const fid = selection.floorId
      const sid = selection.id
      const shapes: { s: "straight" | "l" | "u"; l: PropsKey }[] = [{ s: "straight", l: "stairStraightShort" }, { s: "l", l: "stairLShort" }, { s: "u", l: "stairUShort" }]
      const SHAPE_LABEL = { straight: "stairStraight", l: "stairL", u: "stairU", spiral: "stairSpiral" } as const satisfies Record<string, string>
      rows.push(<Row key="sh" label={t("adminBuilder.props.stairShape")} value={st.shape in SHAPE_LABEL ? t(`adminBuilder.props.${SHAPE_LABEL[st.shape as keyof typeof SHAPE_LABEL]}`) : st.shape} />)
      rows.push(<Row key="w" label={t("adminBuilder.props.width")} value={`${(st.width / 1000).toFixed(2)} ${M}`} />)
      rows.push(<Row key="r" label={t("adminBuilder.props.rotation")} value={`${Math.round(st.rotationDeg)}°`} />)
      controls = (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-1">
            {shapes.map((sh) => (
              <button key={sh.s} type="button" onClick={() => execute(new SetStairCommand(fid, sid, { shape: sh.s }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: st.shape === sh.s ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.shape === sh.s ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.props.${sh.l}`)}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[900, 1100, 1400].map((w) => (
              <button key={w} type="button" onClick={() => execute(new SetStairCommand(fid, sid, { width: w }))} className="flex-1 rounded-md py-1 text-[10px]" style={{ background: st.width === w ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.width === w ? "#0b1220" : TOKENS.text }}>{(w / 1000).toFixed(1)} {M}</button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.props.widthM")}
            <input type="number" step="0.1" min="0.6" max="3" defaultValue={(st.width / 1000).toFixed(2)} key={`sw${sid}${st.width}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetStairCommand(fid, sid, { width: Math.max(600, Math.min(3000, Math.round(v * 1000))) })) }}
              className="w-16 rounded-md bg-white/5 px-1.5 py-1 text-xs" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <div className="flex gap-1">
            <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { rotationDeg: (st.rotationDeg + 90) % 360 }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>⟳ 90°</button>
            <button type="button" onClick={() => execute(new SetStairCommand(fid, sid, { mirror: !st.mirror }))} className="flex-1 rounded-md py-1.5 text-xs font-medium" style={{ background: st.mirror ? TOKENS.accent : "rgba(148,163,184,0.12)", color: st.mirror ? "#0b1220" : TOKENS.text }}>{t("adminBuilder.props.mirror")}</button>
          </div>
          <button type="button" onClick={() => execute(new DeleteStairCommand(fid, sid))} className="rounded-md py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{t("adminBuilder.props.deleteStair")}</button>
        </div>
      )
    }
  } else if (selection.type === "object" && selection.id) {
    const inSite = doc.site.objects.find((o) => o.id === selection.id)
    const floorObj = !inSite ? doc.buildings.flatMap((b) => b.floors).map((f) => ({ f, o: f.objects.find((ob) => ob.id === selection.id) })).find((x) => x.o) : null
    const obj = inSite ?? floorObj?.o
    title = t("adminBuilder.props.object")
    if (obj) {
      const target = inSite ? ({ site: true } as const) : ({ floorId: floorObj?.f.id ?? "" } as const)
      const id = obj.id
      rows.push(<Row key="a" label={t("adminBuilder.props.asset")} value={obj.assetId} />)
      rows.push(<Row key="x" label={t("adminBuilder.props.posX")} value={`${(obj.position.x / 1000).toFixed(1)} ${M}`} />)
      rows.push(<Row key="z" label={t("adminBuilder.props.posZ")} value={`${(obj.position.z / 1000).toFixed(1)} ${M}`} />)
      rows.push(<Row key="r" label={t("adminBuilder.props.rotation")} value={`${Math.round(obj.rotationY)}°`} />)
      rows.push(<Row key="sc" label={t("adminBuilder.props.scale")} value={obj.scale.toFixed(2)} />)
      const curX = obj.scaleX && obj.scaleX > 0 ? obj.scaleX : 1
      const curY = obj.scaleY && obj.scaleY > 0 ? obj.scaleY : 1
      const curZ = obj.scaleZ && obj.scaleZ > 0 ? obj.scaleZ : 1
      rows.push(<Row key="sx" label={t("adminBuilder.props.scaleX")} value={curX.toFixed(2)} />)
      rows.push(<Row key="sy" label={t("adminBuilder.props.scaleY")} value={curY.toFixed(2)} />)
      rows.push(<Row key="sz" label={t("adminBuilder.props.scaleZ")} value={curZ.toFixed(2)} />)
      const btnStyle = "flex-1 rounded-md px-2 py-1.5 text-xs font-medium"
      const smallBtn = "rounded-md px-2 py-1 text-[11px] font-medium"
      const neutral = { background: "rgba(148,163,184,0.12)", color: TOKENS.text }
      const gz = (m: "move" | "rotate") => ({ background: gizmoMode === m ? TOKENS.accent : "rgba(148,163,184,0.12)", color: gizmoMode === m ? "#0b1220" : TOKENS.text })
      const clampSize = (v: number) => Math.max(0.3, Math.min(6, v))
      controls = (
        <>
        <div className="mt-2 flex gap-1">
          <button type="button" className={btnStyle} style={gz("move")} onClick={() => setGizmoMode("move")}>{t("adminBuilder.props.move")}</button>
          <button type="button" className={btnStyle} style={gz("rotate")} onClick={() => setGizmoMode("rotate")}>{t("adminBuilder.props.rotate")}</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.widthShort")}</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(curX / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(curX * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleX: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.heightShort")}</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(curY / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(curY * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleY: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="w-16 text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.depthShort")}</span>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ / 1.2) }))}>－</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(curZ * 1.2) }))}>＋</button>
          <button type="button" className={smallBtn} style={neutral} onClick={() => execute(new SetObjectSizeCommand(target, id, { scaleZ: 1 }))}>1×</button>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
          <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.wAbbr")}
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curX.toFixed(2)} key={`ox${id}${curX}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.hAbbr")}
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curY.toFixed(2)} key={`oy${id}${curY}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.dAbbr")}
            <input type="number" step="0.1" min="0.3" max="6" defaultValue={curZ.toFixed(2)} key={`oz${id}${curZ}`}
              onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v)) execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize(v) })) }}
              className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
          </label>
          <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.sAbbr")}
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
              <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.wMeters")}
                <input type="number" step="0.1" min="0.2" defaultValue={widthM.toFixed(2)} key={`mw${id}${widthM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleX: clampSize((v * 1000) / (base.w * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
              <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.hMeters")}
                <input type="number" step="0.1" min="0.2" defaultValue={heightM.toFixed(2)} key={`mh${id}${heightM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleY: clampSize((v * 1000) / (base.h * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
              <label className="flex flex-1 items-center gap-1">{t("adminBuilder.props.dMeters")}
                <input type="number" step="0.1" min="0.2" defaultValue={depthM.toFixed(2)} key={`md${id}${depthM.toFixed(2)}`}
                  onBlur={(ev) => { const v = parseFloat(ev.target.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) execute(new SetObjectSizeCommand(target, id, { scaleZ: clampSize((v * 1000) / (base.d * obj.scale)) })) }}
                  className="w-full rounded-md bg-white/5 px-1 py-1" style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
              </label>
            </div>
          )
        })()}
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectRotationCommand(target, id, (obj.rotationY + 45) % 360))}>⟳ 45°</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.min(5, obj.scale * 1.2)))}>{t("adminBuilder.props.scaleUp")}</button>
          <button type="button" className={btnStyle} style={neutral} onClick={() => execute(new SetObjectScaleCommand(target, id, Math.max(0.3, obj.scale / 1.2)))}>{t("adminBuilder.props.scaleDown")}</button>
          <button type="button" className={btnStyle} style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }} onClick={() => execute(new DeleteObjectCommand(target, id))}>{t("adminBuilder.props.remove")}</button>
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
              {down && <button type="button" className={btnStyle} style={neutral} onClick={() => copyTo(down)}>{t("adminBuilder.props.copyDown", { name: down.name })}</button>}
              {up && <button type="button" className={btnStyle} style={neutral} onClick={() => copyTo(up)}>{t("adminBuilder.props.copyUp", { name: up.name })}</button>}
            </div>
          )
        })()}
        </>
      )
    }
  }

  return (
    <div
      // в 3D над панелью лежит блок переключателей вида, в плане его нет
      className={`absolute right-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto overflow-x-hidden rounded-2xl p-3 shadow-2xl backdrop-blur-xl ${
        plan2d ? "top-[10rem] max-h-[calc(100%-17rem)]" : "top-[12.6rem] max-h-[calc(100%-19.5rem)]"
      }`}
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="mb-1.5 text-sm font-semibold">{title}</div>
      <div className="flex flex-col">{rows}</div>
      {controls}
      <div className="mt-2 border-t pt-2 text-[10px]" style={{ borderColor: TOKENS.panelBorder, color: TOKENS.muted }}>
        {t("adminBuilder.props.footer")}
      </div>
    </div>
  )
}

// Три кнопки в узкой панели: подписи сокращённые, полная формулировка стоит
// строкой выше («Перепланировка: стена»).
const PHASES: { p: "demolish" | "new" | undefined; l: PropsKey; c: string }[] = [
  { p: undefined, l: "phaseExistingShort", c: "rgba(148,163,184,0.25)" },
  { p: "demolish", l: "phaseDemolish", c: "#ef4444" },
  { p: "new", l: "phaseNewShort", c: "#16a34a" },
]

function PhaseButtons({ value, onPick, noun }: { value: "demolish" | "new" | undefined; onPick: (p: "demolish" | "new" | undefined) => void; noun: string }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.props.phaseLabel", { noun })}</span>
      <div className="flex gap-1">
        {PHASES.map((ph) => {
          const on = value === ph.p
          return (
            <button key={ph.l} type="button" onClick={() => onPick(ph.p)} className="flex-1 rounded-md py-1 text-[10px] font-medium" style={{ background: on ? ph.c : "rgba(148,163,184,0.1)", color: on ? "#fff" : TOKENS.text }}>{t(`adminBuilder.props.${ph.l}`)}</button>
          )
        })}
      </div>
    </div>
  )
}
