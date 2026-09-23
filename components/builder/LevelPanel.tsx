"use client"
import { askConfirm, askText } from "@/components/ui/dialog-host"
import { toast } from "sonner"

// ADR: Левая панель уровней (§5.4). Список этажей (сверху вниз) + «Участок», активный
// уровень, режимы отображения (всё/активный/срез/призрак), «стены вниз», добавление
// этажа копией плана нижнего (remapGraph — свежие id, без коллизий мешей).

import { useMemo, useState } from "react"
import { Building2, Home, Layers, Plus, Trees, Trash2 } from "lucide-react"
import { rebuildModelFloor } from "@/app/actions/building-model"
import { ROOF_KINDS } from "@/lib/builder/islands"
import { uid } from "@/core/id"
import { emptyGraph, remapGraph } from "@/core/geometry/wall-graph"
import { AddFloorCommand, CompositeCommand, DeleteFloorCommand, SetRoomNameCommand, ReplaceFloorCommand, SetRoofCommand, SetFloorNameCommand, SetFloorElevationCommand } from "@/core/document/commands"
import { UnderlayPanel, type PendingMeasure } from "./UnderlayPanel"
import type { RoofConfig } from "@/types/builder"
import type { Floor } from "@/types/builder"
import { useDocumentStore, useEditorStore, type DisplayMode } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"
import { hasReplan, replanSummary } from "@/lib/builder/replan"
import { issuesCount, validateDocument, type Issue } from "@/lib/builder/validate"
import { suggestFloorNames } from "@/lib/builder/room-naming"
import { floorRooms } from "@/lib/builder/rooms"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"

type LevelsKey = keyof Messages["adminBuilder"]["levels"]

// Четыре кнопки в одну строку на 240 px: подписи в словаре короткие.
const DISPLAY: { id: DisplayMode; label: LevelsKey }[] = [
  { id: "all", label: "displayAll" },
  { id: "active", label: "displayActive" },
  { id: "cutaway", label: "displayCutaway" },
  { id: "ghost", label: "displayGhost" },
]

function LevelRow({ name, sub, Icon, active, onClick, onRename, onDelete }: { name: string; sub?: string; Icon: typeof Layers; active: boolean; onClick: () => void; onRename?: () => void; onDelete?: () => void }) {
  const { t } = useT()
  return (
    <div
      className="group flex w-full items-center gap-1 rounded-xl pr-1 transition-all"
      style={{ background: active ? "rgba(56,189,248,0.16)" : "transparent", border: `1px solid ${active ? TOKENS.accent : "transparent"}` }}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onRename}
        title={onRename ? t("adminBuilder.levels.renameHint") : undefined}
        className="flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm"
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: active ? TOKENS.accent : TOKENS.muted }} />
        <span className="flex-1 truncate">{name}</span>
        {sub && <span className="text-[10px]" style={{ color: TOKENS.muted }}>{sub}</span>}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title={t("adminBuilder.levels.deleteFloor")}
          aria-label={t("adminBuilder.levels.deleteFloor")}
          className="shrink-0 rounded-md p-1 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
        </button>
      )}
    </div>
  )
}

/**
 * Текст замечания: ключ + подстановки из модуля проверки. Существительные
 * («Дверь», «Лифт») тоже приходят ключами — иначе их не согласовать.
 */
function issueText(t: ReturnType<typeof useT>["t"], issue: Issue): string {
  const vars = issue.vars ? { ...issue.vars } : undefined
  if (vars && typeof vars.noun === "string" && vars.noun.startsWith("noun")) {
    vars.noun = t(`adminBuilder.checks.${vars.noun as "nounDoor"}`)
  }
  return t(`adminBuilder.checks.${issue.key}`, vars)
}

/**
 * Проверка модели: то, что в чертеже заметят первым — помещение без двери,
 * окно за краем стены, вход без пандуса. Клик по замечанию открывает этаж и
 * выделяет элемент.
 */
function CheckBlock() {
  const { t, tp } = useT()
  const doc = useDocumentStore((s) => s.doc)
  const rev = useDocumentStore((s) => s.rev)
  const setActiveLevel = useEditorStore((s) => s.setActiveLevel)
  const setSelection = useEditorStore((s) => s.setSelection)
  const [open, setOpen] = useState(false)
  const issues = useMemo(() => {
    try {
      return validateDocument(doc, (kind) => t(`adminBuilder.islands.kinds.${kind}`))
    } catch {
      return []
    }
    // rev меняется при каждой правке модели — пересчитываем список
  }, [doc, rev, t])
  // одинаковые замечания сводим в строку со счётчиком: 45 «без наименования»
  // подряд читать невозможно
  const [cursors, setCursors] = useState<Record<string, number>>({})
  const bump = (key: string) => setCursors((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }))
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; level: Issue["level"]; text: string; items: Issue[] }>()
    for (const i of issues) {
      // ключ — вид замечания: id вида «room-noname-<id>» даёт «room-noname»
      const key = i.id.replace(/-[^-]+$/, "")
      const g = byKey.get(key)
      if (g) g.items.push(i)
      else byKey.set(key, { key, level: i.level, text: issueText(t, i), items: [i] })
    }
    return [...byKey.values()].map((g) => ({ ...g, cursor: cursors[g.key] ?? 0 }))
  }, [issues, cursors, t])
  const errors = issues.filter((i) => i.level === "error").length
  const unnamed = issues.filter((i) => i.id.startsWith("room-noname-")).length
  const execute = useDocumentStore((s) => s.execute)
  // одно действие на всё здание: Ctrl+Z возвращает прежние наименования разом
  const fillNames = () => {
    const cmds: SetRoomNameCommand[] = []
    for (const b of doc.buildings) {
      for (const f of b.floors) {
        if (!Object.keys(f.wallGraph.edges).length) continue
        const names = suggestFloorNames(f, floorRooms(f))
        for (const [roomId, key] of Object.entries(names)) cmds.push(new SetRoomNameCommand(f.id, roomId, t(`adminBuilder.roomNames.${key}`)))
      }
    }
    if (cmds.length) execute(new CompositeCommand(t("adminBuilder.levels.fillNamesCommand"), cmds))
  }
  const color = errors ? "#f87171" : issues.length ? "#fbbf24" : "#4ade80"
  const counts = issuesCount(issues)
  const summary = issues.length === 0
    ? t("adminBuilder.checks.clean")
    : [counts.errors ? tp("adminBuilder.checks.errors", counts.errors) : "", counts.warns ? tp("adminBuilder.checks.warns", counts.warns) : ""].filter(Boolean).join(", ")
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("adminBuilder.levels.checkHint")}
        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-medium"
        style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
      >
        <span>{t("adminBuilder.levels.checkTitle")}</span>
        <span style={{ color }}>{summary}</span>
      </button>
      {open && (
        <div className="flex max-h-56 flex-col gap-0.5 overflow-auto rounded-lg p-1.5 text-[10px]" style={{ background: "rgba(15,23,42,0.35)" }}>
          {issues.length === 0 && <span style={{ color: TOKENS.muted }}>{t("adminBuilder.levels.checkClean")}</span>}
          {unnamed > 0 && (
            <button
              type="button"
              onClick={fillNames}
              title={t("adminBuilder.levels.fillNamesHint")}
              className="mb-1 rounded-md px-1.5 py-1 text-left font-medium"
              style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.accent }}
            >
              {t("adminBuilder.levels.fillNames", { count: unnamed })}
            </button>
          )}
          {groups.map((gr) => (
            <button
              key={gr.key}
              type="button"
              onClick={() => {
                // переходим по очереди: второй клик показывает следующее такое же замечание
                const i = gr.items[gr.cursor % gr.items.length]
                bump(gr.key)
                if (i.floorId) setActiveLevel(i.floorId)
                if (i.target && i.floorId) setSelection({ type: i.target.type, id: i.target.id, floorId: i.floorId })
              }}
              className="flex items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-white/5"
            >
              <span style={{ color: gr.level === "error" ? "#f87171" : "#fbbf24" }}>{gr.level === "error" ? "●" : "▲"}</span>
              <span className="flex-1" style={{ color: TOKENS.text }}>
                {gr.items.length > 1 ? `${gr.items.length}× ${gr.text}` : gr.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LevelPanel({
  measure = null,
  onMeasureConsumed = () => {},
  buildingId,
  onLookAtRoof,
}: {
  measure?: PendingMeasure
  onMeasureConsumed?: () => void
  /** здание в базе — даёт «сброс этажа к данным» */
  buildingId?: string
  /** поднять камеру на кровлю при выборе уровня «Кровля» */
  onLookAtRoof?: () => void
}) {
  const { t } = useT()
  // Сброс к данным: двухшаговое подтверждение прямо в кнопке, без window.confirm
  const [armed, setArmed] = useState<"reset" | "clear" | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const siteFloorId = useEditorStore((s) => s.siteFloorId)
  const setActiveLevel = useEditorStore((s) => s.setActiveLevel)
  const displayMode = useEditorStore((s) => s.displayMode)
  const setDisplayMode = useEditorStore((s) => s.setDisplayMode)
  const wallsDown = useEditorStore((s) => s.wallsDown)
  const toggleWallsDown = useEditorStore((s) => s.toggleWallsDown)

  const building = doc.buildings[0]
  const floors = building ? [...building.floors].sort((a, b) => b.level - a.level) : []
  const activeFloor = building?.floors.find((f) => f.id === activeLevelId)
  // этаж, по которому идёт правка в режиме «Участок»
  const siteFloor = building?.floors.find((f) => f.id === siteFloorId)
  const ROOF_NAME = { flat: "roofNameFlat", gable: "roofNameGable", hip: "roofNameHip", fourslope: "roofNameFourslope", mansard: "roofNameMansard", shed: "roofNameShed" } as const satisfies Record<string, string>
  // Семь кнопок в сетке 3×3 по 70 px: подписи в словаре сокращены до предела.
  const ROOFS: { type: RoofConfig["type"] | "none"; l: LevelsKey }[] = [
    { type: "flat", l: "roofFlat" },
    { type: "gable", l: "roofGable" },
    { type: "hip", l: "roofHip" },
    { type: "fourslope", l: "roofFourslope" },
    { type: "mansard", l: "roofMansard" },
    { type: "shed", l: "roofShed" },
    { type: "none", l: "roofNone" },
  ]
  // верхний этаж: его кровля и есть кровля здания
  const topFloor = floors.length ? floors.reduce((a, b) => (b.elevation > a.elevation ? b : a)) : undefined
  // на уровне «Кровля» кнопки типа крыши правят верхний этаж
  const roofFloor = activeLevelId === "roof" ? topFloor : activeFloor
  const setRoof = (type: RoofConfig["type"] | "none") => {
    if (!roofFloor) return
    const cfg: RoofConfig | undefined = type === "none" ? undefined : { type, pitchDeg: type === "flat" ? 0 : 28, overhang: 500, thickness: 200, materialId: roofFloor.roof?.materialId ?? "metal_roof" }
    execute(new SetRoofCommand(roofFloor.id, cfg))
  }

  const addFloor = () => {
    if (!building) return
    const top = [...building.floors].sort((a, b) => a.level - b.level).pop()
    const level = (top?.level ?? 0) + 1
    const floor: Floor = {
      id: uid("f"),
      name: level >= 1 ? t("adminBuilder.levels.newFloorName", { level }) : level === 0 ? t("adminBuilder.levels.basementName") : t("adminBuilder.levels.basementNumbered", { number: 1 - level }),
      level,
      // Стопка этажей непрерывна: новый этаж кладётся НАД верхним (top.elevation +
      // его высота), а не по абсолютной формуле level*H — иначе при подвалах/смещениях
      // этажи «разъезжаются» по высоте.
      elevation: top ? top.elevation + top.height : 0,
      height: 3500,
      visible: true,
      locked: false,
      opacity: 1,
      wallGraph: top ? remapGraph(top.wallGraph) : emptyGraph(),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      floorMaterialId: "laminate",
      roomMaterials: {},
      mepRuns: [],
      mepDevices: [],
    }
    execute(new AddFloorCommand(building.id, floor))
    setActiveLevel(floor.id)
  }

  // Этаж испорчен (утащили узел, снесли стену) — собрать его заново из данных
  // здания. Подложка-скан остаётся, id этажа тот же; откатывается Ctrl+Z.
  const resetActiveToData = async () => {
    if (!building || !buildingId) return
    const current = building.floors.find((f) => f.id === activeLevelId)
    if (!current) return
    setResetBusy(true)
    try {
      const fresh = await rebuildModelFloor(buildingId, current.level)
      if (!fresh) return
      useDocumentStore
        .getState()
        .execute(new ReplaceFloorCommand(building.id, { ...fresh, id: current.id, underlay: current.underlay }, current))
    } finally {
      setResetBusy(false)
      setArmed(null)
    }
  }

  // Чистый лист для обводки по скану: геометрия этажа уходит, подложка,
  // имя, высота и отметка остаются. Одна команда — один Ctrl+Z.
  const clearActive = () => {
    if (!building) return
    const current = building.floors.find((f) => f.id === activeLevelId)
    if (!current) return
    useDocumentStore.getState().execute(
      new ReplaceFloorCommand(
        building.id,
        { ...current, wallGraph: emptyGraph(), openings: [], stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [], annotations: [] },
        current,
      ),
    )
    useEditorStore.getState().setSelection({ type: "none" })
    setArmed(null)
  }

  // Дубль активного этажа: стены и проёмы копируются, привязки к карточкам — нет
  // (карточка одна, помещение на другом этаже другое).
  const duplicateActive = () => {
    if (!building) return
    const src = building.floors.find((f) => f.id === activeLevelId)
    if (!src) return
    const top = [...building.floors].sort((a, b) => a.level - b.level).pop()
    const level = (top?.level ?? 0) + 1
    const floor: Floor = {
      ...src,
      id: uid("f"),
      name: t("adminBuilder.levels.newFloorName", { level }),
      level,
      elevation: top ? top.elevation + top.height : 0,
      wallGraph: remapGraph(src.wallGraph),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      roomMaterials: {},
      roof: undefined,
    }
    execute(new AddFloorCommand(building.id, floor))
    setActiveLevel(floor.id)
  }

  const addBasement = () => {
    if (!building || building.floors.length === 0) return
    // Подвал должен встать СТРОГО под самым нижним этажом. Берём нижний этаж и
    // считаем отметку от него (lowest.elevation − высота), а не по level*H —
    // иначе при нижнем этаже с level=1 подвал получал elevation 0 и вставал «как
    // 1 этаж» на землю вместо −1.
    const lowest = building.floors.reduce((m, f) => (f.level < m.level ? f : m), building.floors[0])
    const level = lowest.level - 1
    const height = 3500
    const floor: Floor = {
      id: uid("f"),
      name: level === 0 ? t("adminBuilder.levels.basementName") : t("adminBuilder.levels.basementNumbered", { number: 1 - level }),
      level,
      elevation: lowest.elevation - height,
      height,
      visible: true,
      locked: false,
      opacity: 1,
      wallGraph: emptyGraph(),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      floorMaterialId: "tile",
      roomMaterials: {},
      mepRuns: [],
      mepDevices: [],
    }
    execute(new AddFloorCommand(building.id, floor))
    setActiveLevel(floor.id)
  }

  const deleteFloor = async (f: Floor) => {
    if (!building) return
    if (building.floors.length <= 1) {
      toast.error(t("adminBuilder.levels.deleteLastFloor"))
      return
    }
    if (!(await askConfirm({ title: t("adminBuilder.levels.deleteFloorTitle", { name: f.name }), description: t("adminBuilder.levels.deleteFloorText"), confirmLabel: t("adminBuilder.levels.deleteConfirm"), danger: true }))) return
    execute(new DeleteFloorCommand(building.id, f.id))
    if (activeLevelId === f.id) {
      const rest = building.floors.filter((fl) => fl.id !== f.id).sort((a, b) => b.level - a.level)
      if (rest[0]) setActiveLevel(rest[0].id)
    }
  }

  const renameFloor = async (f: Floor) => {
    const next = await askText({ title: t("adminBuilder.levels.renameTitle"), placeholder: t("adminBuilder.levels.renamePlaceholder"), defaultValue: f.name, confirmLabel: t("adminBuilder.levels.renameConfirm") })
    const name = next?.trim()
    if (!name || name === f.name) return
    execute(new SetFloorNameCommand(f.id, name))
  }

  return (
    <div
      className="absolute left-3 top-40 z-20 flex max-h-[calc(100%-22rem)] w-60 flex-col overflow-x-hidden gap-1 overflow-y-auto rounded-2xl p-2 shadow-2xl backdrop-blur-xl [@media(max-height:820px)]:max-h-[calc(100%-13rem)]"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: TOKENS.muted }}>
        {building?.name ?? t("adminBuilder.levels.project")}
      </div>
      <div className="grid grid-cols-4 gap-1 px-0.5 pb-1">
        {DISPLAY.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDisplayMode(d.id)}
            className="rounded-lg py-1 text-[10px] font-medium transition-all"
            style={{
              background: displayMode === d.id ? TOKENS.accent : "rgba(148,163,184,0.1)",
              color: displayMode === d.id ? "#0b1220" : TOKENS.text,
            }}
          >
            {t(`adminBuilder.levels.${d.label}`)}
          </button>
        ))}
      </div>
      {/* Кровля — отдельный уровень: на ней сдают места под антенны и базовые
          станции, у неё своя площадь и свой тип */}
      {topFloor && (
        <LevelRow
          name={t("adminBuilder.levels.roof")}
          sub={topFloor.roof ? `${topFloor.name} · ${topFloor.roof.type in ROOF_NAME ? t(`adminBuilder.levels.${ROOF_NAME[topFloor.roof.type as keyof typeof ROOF_NAME]}`) : ""}` : t("adminBuilder.levels.noRoof")}
          Icon={Home}
          active={activeLevelId === "roof"}
          onClick={() => {
            setActiveLevel("roof")
            // правка на кровле идёт по верхнему этажу, а панель сразу показывает саму кровлю
            useEditorStore.getState().setSiteFloor(topFloor.id)
            useEditorStore.getState().setSelection({ type: "roof", id: `roof_${topFloor.id}`, floorId: topFloor.id })
            onLookAtRoof?.()
          }}
        />
      )}
      {activeLevelId === "roof" && (
        <p className="px-1 text-[10px] leading-snug" style={{ color: TOKENS.muted }}>{t("adminBuilder.levels.roofNote")}</p>
      )}
      {floors.map((f) => (
        <LevelRow
          key={f.id}
          name={f.name}
          sub={f.level < 0 ? t("adminBuilder.levels.basementTag") : undefined}
          Icon={f.level < 0 ? Layers : Building2}
          active={activeLevelId === f.id}
          onClick={() => setActiveLevel(f.id)}
          onRename={() => renameFloor(f)}
          onDelete={floors.length > 1 ? () => deleteFloor(f) : undefined}
        />
      ))}
      <LevelRow
        name={t("adminBuilder.levels.site")}
        sub={activeLevelId === "site" ? (siteFloor ? t("adminBuilder.levels.siteEditing", { name: siteFloor.name }) : t("adminBuilder.levels.sitePickElement")) : undefined}
        Icon={Trees}
        active={activeLevelId === "site"}
        onClick={() => setActiveLevel("site")}
      />
      {activeLevelId === "site" && (
        // на участке здание видно целиком: кликнул по окну третьего этажа — правишь его,
        // переключать уровень не нужно
        <p className="px-1 text-[10px] leading-snug" style={{ color: TOKENS.muted }}>{t("adminBuilder.levels.siteNote")}</p>
      )}
      <button
        type="button"
        onClick={addFloor}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(56,189,248,0.12)", color: TOKENS.accent, border: `1px dashed ${TOKENS.accent}` }}
      >
        <Plus className="h-3.5 w-3.5" /> {t("adminBuilder.levels.addFloor")}
      </button>
      {activeFloor && (
        <div className="mt-1 rounded-xl p-1.5" style={{ background: "rgba(148,163,184,0.08)" }}>
          <label
            className="flex items-center justify-between gap-2 px-0.5 pb-1 text-[11px]"
            style={{ color: TOKENS.muted }}
            title={t("adminBuilder.levels.elevationHint")}
          >
            {t("adminBuilder.levels.elevation")}
            <input
              id="builder-floor-elevation"
              type="number"
              step="0.05"
              key={`el${activeFloor.id}${activeFloor.elevation}`}
              defaultValue={(activeFloor.elevation / 1000).toFixed(2)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") (ev.target as HTMLInputElement).blur()
              }}
              onBlur={(ev) => {
                const v = Number(ev.target.value.replace(",", "."))
                if (!Number.isFinite(v)) return
                const mm = Math.round(v * 1000)
                if (mm !== activeFloor.elevation) useDocumentStore.getState().execute(new SetFloorElevationCommand(activeFloor.id, mm))
              }}
              className="w-16 rounded-md bg-white/5 px-1.5 py-0.5 text-right text-[11px] tabular-nums"
              style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            />
          </label>
          {activeFloor.level === 0 && building.floors.some((f) => f.level >= 1) && activeFloor.elevation !== -activeFloor.height && (
            <button
              type="button"
              onClick={() => useDocumentStore.getState().execute(new SetFloorElevationCommand(activeFloor.id, -activeFloor.height))}
              title={t("adminBuilder.levels.plinthToGroundHint")}
              className="mb-1.5 w-full rounded-md py-1 text-[11px] font-medium"
              style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}
            >
              {t("adminBuilder.levels.plinthToGround")}
            </button>
          )}
          <p className="px-0.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>{t("adminBuilder.levels.roofOfFloor", { name: activeFloor.name })}</p>
          <div className="grid grid-cols-3 gap-1">
            {ROOFS.map((r) => {
              const on = r.type === "none" ? !activeFloor.roof : activeFloor.roof?.type === r.type
              return (
                <button key={r.type} type="button" onClick={() => setRoof(r.type)} className="rounded-md py-1 text-[10px] font-medium" style={{ background: on ? TOKENS.accent : "rgba(148,163,184,0.12)", color: on ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.levels.${r.l}`)}</button>
              )
            })}
          </div>
        </div>
      )}
      {buildingId && activeLevelId && activeLevelId !== "site" && (
        <a
          href={`/admin/builder/${buildingId}/sheet?floor=${activeLevelId}`}
          target="_blank"
          rel="noreferrer"
          title={t("adminBuilder.levels.sheetsHint")}
          className="rounded-lg py-1.5 text-center text-[11px] font-medium"
          style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}
        >
          {t("adminBuilder.levels.sheets")}
        </a>
      )}
      <CheckBlock />
      {/* Редко нужное и опасное — под «Ещё», чтобы не мешало каждый день */}
      <details className="group rounded-xl" style={{ background: "rgba(148,163,184,0.06)" }}>
        <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium [&::-webkit-details-marker]:hidden" style={{ color: TOKENS.muted }}>
          {t("adminBuilder.levels.more")}
        </summary>
        <div className="flex flex-col gap-1 p-1.5 pt-0">
      <button
        type="button"
        onClick={duplicateActive}
        className="rounded-lg py-1.5 text-[11px] font-medium"
        style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
      >
        {t("adminBuilder.levels.duplicateFloor")}
      </button>
      {activeFloor && <ReplanBlock floor={activeFloor} buildingId={buildingId} />}
      {activeLevelId && activeLevelId !== "site" && (
        <div className="flex gap-1">
          {armed ? (
            <>
              <button
                type="button"
                onClick={() => void (armed === "reset" ? resetActiveToData() : clearActive())}
                disabled={resetBusy}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold disabled:opacity-50"
                style={{ background: "#f59e0b", color: "#0b1220" }}
              >
                {resetBusy ? t("adminBuilder.levels.building") : t(armed === "reset" ? "adminBuilder.levels.fromDataConfirm" : "adminBuilder.levels.clearFloorConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setArmed(null)}
                className="rounded-lg px-2 py-1.5 text-[11px] font-medium"
                style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
              >
                {t("adminBuilder.levels.no")}
              </button>
            </>
          ) : (
            <>
              {buildingId && (
                <button
                  type="button"
                  onClick={() => setArmed("reset")}
                  title={t("adminBuilder.levels.fromDataHint")}
                  className="flex-1 rounded-lg py-1.5 text-[11px] font-medium"
                  style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
                >
                  {t("adminBuilder.levels.fromData")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setArmed("clear")}
                title={t("adminBuilder.levels.clearFloorHint")}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-medium"
                style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
              >
                {t("adminBuilder.levels.clearFloor")}
              </button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={addBasement}
        title={t("adminBuilder.levels.addBasementHint")}
        className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.muted, border: `1px dashed ${TOKENS.panelBorder}` }}
      >
        {t("adminBuilder.levels.addBasement")}
      </button>
      <button
        type="button"
        onClick={toggleWallsDown}
        title={t("adminBuilder.levels.wallsDownHint")}
        className="mt-0.5 rounded-xl py-1.5 text-[11px] transition-all"
        style={{ background: wallsDown ? "rgba(167,139,250,0.18)" : "rgba(148,163,184,0.08)", color: wallsDown ? TOKENS.accent2 : TOKENS.muted }}
      >
        {t("adminBuilder.levels.wallsDown")} {wallsDown ? "✓" : ""}
      </button>
        </div>
      </details>
      {/* уровень «Кровля»: тип крыши и сводка по местам на ней */}
      {activeLevelId === "roof" && topFloor && (
        <div className="flex flex-col gap-1 rounded-lg p-1.5" style={{ border: `1px solid ${TOKENS.panelBorder}` }}>
          <p className="px-0.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>{t("adminBuilder.levels.roofOfFloor", { name: topFloor.name })}</p>
          <div className="grid grid-cols-3 gap-1">
            {ROOFS.map((r) => {
              const on = r.type === "none" ? !topFloor.roof : topFloor.roof?.type === r.type
              return (
                <button key={r.type} type="button" onClick={() => setRoof(r.type)} className="rounded-md py-1 text-[10px] font-medium" style={{ background: on ? TOKENS.accent : "rgba(148,163,184,0.12)", color: on ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.levels.${r.l}`)}</button>
              )
            })}
          </div>
          {(() => {
            const places = (topFloor.islands ?? []).filter((i) => ROOF_KINDS.has(i.kind))
            const leased = places.filter((i) => (i.tenant ?? "").trim()).length
            return (
              <p className="px-0.5 text-[10px]" style={{ color: TOKENS.muted }}>
                {t("adminBuilder.levels.roofPlaces", { count: places.length })}{places.length ? t("adminBuilder.levels.roofPlacesLeased", { count: leased }) : ""}
              </p>
            )
          })()}
        </div>
      )}
      <UnderlayPanel pending={measure} onConsumed={onMeasureConsumed} />
    </div>
  )
}

function ReplanBlock({ floor, buildingId }: { floor: Floor; buildingId?: string }) {
  const { t } = useT()
  const on = useEditorStore((s) => s.replanMode)
  const toggle = useEditorStore((s) => s.toggleReplan)
  const any = hasReplan(floor)
  const sum = any ? replanSummary(floor) : null
  const fmt = (x: number) => x.toFixed(1).replace(".", ",")
  return (
    <div className="flex flex-col gap-1 rounded-lg p-1.5" style={{ background: on ? "rgba(239,68,68,0.08)" : "transparent", border: `1px solid ${on ? "rgba(239,68,68,0.45)" : TOKENS.panelBorder}` }}>
      <button
        type="button"
        onClick={toggle}
        title={t("adminBuilder.levels.replanHint")}
        className="rounded-md py-1.5 text-[11px] font-semibold"
        style={{ background: on ? "#dc2626" : "rgba(148,163,184,0.12)", color: on ? "#fff" : TOKENS.text }}
      >
        {t(on ? "adminBuilder.levels.replanOn" : "adminBuilder.levels.replan")}
      </button>
      {sum && (
        <div className="grid grid-cols-2 gap-x-2 text-[10px]" style={{ color: TOKENS.muted, fontVariantNumeric: "tabular-nums" }}>
          <span>{t("adminBuilder.levels.replanDemolishWalls")}</span><span className="text-right" style={{ color: "#f87171" }}>{fmt(sum.demolishWallM)} м</span>
          <span>{t("adminBuilder.levels.replanNewWalls")}</span><span className="text-right" style={{ color: "#4ade80" }}>{fmt(sum.newWallM)} м</span>
          <span>{t("adminBuilder.levels.replanOpenings")}</span><span className="text-right" style={{ color: TOKENS.text }}>{sum.openingsNew} / {sum.openingsClosed}</span>
          <span>{t("adminBuilder.levels.replanAreaBefore")}</span><span className="text-right" style={{ color: TOKENS.text }}>{fmt(sum.areaBefore)} м²</span>
          <span>{t("adminBuilder.levels.replanAreaAfter")}</span><span className="text-right" style={{ color: TOKENS.text }}>{fmt(sum.areaAfter)} м²</span>
        </div>
      )}
      {sum && buildingId && (
        <a href={`/admin/builder/${buildingId}/sheet?floor=${floor.id}&view=replan:demolish`} target="_blank" rel="noreferrer" className="rounded-md py-1 text-center text-[10px] font-medium" style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}>
          {t("adminBuilder.levels.replanSheets")}
        </a>
      )}
    </div>
  )
}
