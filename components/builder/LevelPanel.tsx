"use client"

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
import { issuesSummary, validateDocument, type Issue } from "@/lib/builder/validate"
import { suggestFloorNames } from "@/lib/builder/room-naming"
import { floorRooms } from "@/lib/builder/rooms"

const DISPLAY: { id: DisplayMode; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "active", label: "Этаж" },
  { id: "cutaway", label: "Срез" },
  { id: "ghost", label: "Призрак" },
]

function LevelRow({ name, sub, Icon, active, onClick, onRename, onDelete }: { name: string; sub?: string; Icon: typeof Layers; active: boolean; onClick: () => void; onRename?: () => void; onDelete?: () => void }) {
  return (
    <div
      className="group flex w-full items-center gap-1 rounded-xl pr-1 transition-all"
      style={{ background: active ? "rgba(56,189,248,0.16)" : "transparent", border: `1px solid ${active ? TOKENS.accent : "transparent"}` }}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onRename}
        title={onRename ? "Двойной клик — переименовать уровень" : undefined}
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
          title="Удалить этаж"
          aria-label="Удалить этаж"
          className="shrink-0 rounded-md p-1 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
        </button>
      )}
    </div>
  )
}

/**
 * Проверка модели: то, что в чертеже заметят первым — помещение без двери,
 * окно за краем стены, вход без пандуса. Клик по замечанию открывает этаж и
 * выделяет элемент.
 */
function CheckBlock() {
  const doc = useDocumentStore((s) => s.doc)
  const rev = useDocumentStore((s) => s.rev)
  const setActiveLevel = useEditorStore((s) => s.setActiveLevel)
  const setSelection = useEditorStore((s) => s.setSelection)
  const [open, setOpen] = useState(false)
  const issues = useMemo(() => {
    try {
      return validateDocument(doc)
    } catch {
      return []
    }
    // rev меняется при каждой правке модели — пересчитываем список
  }, [doc, rev])
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
      else byKey.set(key, { key, level: i.level, text: i.text, items: [i] })
    }
    return [...byKey.values()].map((g) => ({ ...g, cursor: cursors[g.key] ?? 0 }))
  }, [issues, cursors])
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
        for (const [roomId, name] of Object.entries(names)) cmds.push(new SetRoomNameCommand(f.id, roomId, name))
      }
    }
    if (cmds.length) execute(new CompositeCommand("наименования помещений", cmds))
  }
  const color = errors ? "#f87171" : issues.length ? "#fbbf24" : "#4ade80"
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Проверка модели перед выпуском чертежей"
        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-medium"
        style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
      >
        <span>Проверка модели</span>
        <span style={{ color }}>{issuesSummary(issues)}</span>
      </button>
      {open && (
        <div className="flex max-h-56 flex-col gap-0.5 overflow-auto rounded-lg p-1.5 text-[10px]" style={{ background: "rgba(15,23,42,0.35)" }}>
          {issues.length === 0 && <span style={{ color: TOKENS.muted }}>Модель без замечаний.</span>}
          {unnamed > 0 && (
            <button
              type="button"
              onClick={fillNames}
              title="Подставит типовые наименования по геометрии: офис, коридор, санузел, кладовая. Любое можно переписать, Ctrl+Z отменяет всё разом"
              className="mb-1 rounded-md px-1.5 py-1 text-left font-medium"
              style={{ background: "rgba(56,189,248,0.16)", color: TOKENS.accent }}
            >
              Подставить наименования ({unnamed})
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
  const ROOF_NAME: Record<string, string> = { flat: "плоская", gable: "двускатная", hip: "вальмовая", fourslope: "четырёхскатная", mansard: "мансардная", shed: "односкатная" }
  const ROOFS: { t: RoofConfig["type"] | "none"; l: string }[] = [
    { t: "flat", l: "Плоск." },
    { t: "gable", l: "Двускат" },
    { t: "hip", l: "Вальм." },
    { t: "fourslope", l: "4-скат" },
    { t: "mansard", l: "Мансард" },
    { t: "shed", l: "Односкат" },
    { t: "none", l: "Нет" },
  ]
  // верхний этаж: его кровля и есть кровля здания
  const topFloor = floors.length ? floors.reduce((a, b) => (b.elevation > a.elevation ? b : a)) : undefined
  // на уровне «Кровля» кнопки типа крыши правят верхний этаж
  const roofFloor = activeLevelId === "roof" ? topFloor : activeFloor
  const setRoof = (t: RoofConfig["type"] | "none") => {
    if (!roofFloor) return
    const cfg: RoofConfig | undefined = t === "none" ? undefined : { type: t, pitchDeg: t === "flat" ? 0 : 28, overhang: 500, thickness: 200, materialId: roofFloor.roof?.materialId ?? "metal_roof" }
    execute(new SetRoofCommand(roofFloor.id, cfg))
  }

  const addFloor = () => {
    if (!building) return
    const top = [...building.floors].sort((a, b) => a.level - b.level).pop()
    const level = (top?.level ?? 0) + 1
    const floor: Floor = {
      id: uid("f"),
      name: level >= 1 ? `${level} этаж` : level === 0 ? "Подвал" : `Подвал ${1 - level}`,
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
      name: `${level} этаж`,
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
      name: level === 0 ? "Подвал" : `Подвал ${1 - level}`,
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

  const deleteFloor = (f: Floor) => {
    if (!building) return
    if (building.floors.length <= 1) {
      window.alert("Нельзя удалить единственный этаж — в здании должен остаться хотя бы один уровень.")
      return
    }
    if (!window.confirm(`Удалить «${f.name}» со всем содержимым (стены, объекты, помещения)? Это можно отменить (Ctrl+Z).`)) return
    execute(new DeleteFloorCommand(building.id, f.id))
    if (activeLevelId === f.id) {
      const rest = building.floors.filter((fl) => fl.id !== f.id).sort((a, b) => b.level - a.level)
      if (rest[0]) setActiveLevel(rest[0].id)
    }
  }

  const renameFloor = (f: Floor) => {
    const next = window.prompt("Название уровня (напр. «1 этаж», «Цоколь», «Подвал»):", f.name)
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
        {building?.name ?? "Проект"}
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
            {d.label}
          </button>
        ))}
      </div>
      {/* Кровля — отдельный уровень: на ней сдают места под антенны и базовые
          станции, у неё своя площадь и свой тип */}
      {topFloor && (
        <LevelRow
          name="Кровля"
          sub={topFloor.roof ? `${topFloor.name} · ${ROOF_NAME[topFloor.roof.type] ?? ""}` : "кровли нет"}
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
        <p className="px-1 text-[10px] leading-snug" style={{ color: TOKENS.muted }}>
          Видна крыша. Инструмент «Островок» ставит на неё антенны и базовые станции, клик по кровле — её свойства.
        </p>
      )}
      {floors.map((f) => (
        <LevelRow
          key={f.id}
          name={f.name}
          sub={f.level < 0 ? "подвал" : undefined}
          Icon={f.level < 0 ? Layers : Building2}
          active={activeLevelId === f.id}
          onClick={() => setActiveLevel(f.id)}
          onRename={() => renameFloor(f)}
          onDelete={floors.length > 1 ? () => deleteFloor(f) : undefined}
        />
      ))}
      <LevelRow
        name="Участок"
        sub={activeLevelId === "site" ? (siteFloor ? `правка: ${siteFloor.name}` : "выберите элемент") : undefined}
        Icon={Trees}
        active={activeLevelId === "site"}
        onClick={() => setActiveLevel("site")}
      />
      {activeLevelId === "site" && (
        // на участке здание видно целиком: кликнул по окну третьего этажа — правишь его,
        // переключать уровень не нужно
        <p className="px-1 text-[10px] leading-snug" style={{ color: TOKENS.muted }}>
          Видно всё здание. Клик по любому элементу — правка идёт по его этажу.
        </p>
      )}
      <button
        type="button"
        onClick={addFloor}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(56,189,248,0.12)", color: TOKENS.accent, border: `1px dashed ${TOKENS.accent}` }}
      >
        <Plus className="h-3.5 w-3.5" /> Добавить этаж
      </button>
      <button
        type="button"
        onClick={duplicateActive}
        className="rounded-lg py-1.5 text-[11px] font-medium"
        style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
      >
        Дублировать этаж
      </button>
      {buildingId && activeLevelId && activeLevelId !== "site" && (
        <a
          href={`/admin/builder/${buildingId}/sheet?floor=${activeLevelId}`}
          target="_blank"
          rel="noreferrer"
          title="Лист плана этажа со размерами, осями и штампом: PDF и DXF для AutoCAD"
          className="rounded-lg py-1.5 text-center text-[11px] font-medium"
          style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}
        >
          Чертежи: план, фасады, разрезы
        </a>
      )}
      <CheckBlock />
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
                {resetBusy ? "Собираю…" : armed === "reset" ? "Да, собрать из данных" : "Да, очистить этаж"}
              </button>
              <button
                type="button"
                onClick={() => setArmed(null)}
                className="rounded-lg px-2 py-1.5 text-[11px] font-medium"
                style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
              >
                Нет
              </button>
            </>
          ) : (
            <>
              {buildingId && (
                <button
                  type="button"
                  onClick={() => setArmed("reset")}
                  title="Собрать этот этаж заново из помещений здания. Нарисованное на этаже заменится, подложка останется. Откат — Ctrl+Z"
                  className="flex-1 rounded-lg py-1.5 text-[11px] font-medium"
                  style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
                >
                  Из данных
                </button>
              )}
              <button
                type="button"
                onClick={() => setArmed("clear")}
                title="Убрать со этажа стены, проёмы, лестницы и объекты — чтобы обвести план по скану с нуля. Подложка останется. Откат — Ctrl+Z"
                className="flex-1 rounded-lg py-1.5 text-[11px] font-medium"
                style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
              >
                Очистить этаж
              </button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={addBasement}
        title="Вырыть подвал — уровень в земле под зданием (двойной клик по уровню — переименовать, напр. «Цоколь»)"
        className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.muted, border: `1px dashed ${TOKENS.panelBorder}` }}
      >
        ⛏ Подвал (вниз)
      </button>
      {activeFloor && (
        <div className="mt-1 rounded-xl p-1.5" style={{ background: "rgba(148,163,184,0.08)" }}>
          <label
            className="flex items-center justify-between gap-2 px-0.5 pb-1 text-[11px]"
            style={{ color: TOKENS.muted }}
            title="Отметка пола относительно земли. Минус — ниже земли. Этажи выше сдвигаются вместе с этим"
          >
            Отметка пола, м
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
              title="Цокольный этаж целиком в земле, 1 этаж — с уровня земли; этажи выше сдвинутся вместе с ним"
              className="mb-1.5 w-full rounded-md py-1 text-[11px] font-medium"
              style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}
            >
              Цоколь в землю, 1 этаж — с земли
            </button>
          )}
          <p className="px-0.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>Крыша · {activeFloor.name}</p>
          <div className="grid grid-cols-3 gap-1">
            {ROOFS.map((r) => {
              const on = r.t === "none" ? !activeFloor.roof : activeFloor.roof?.type === r.t
              return (
                <button key={r.t} type="button" onClick={() => setRoof(r.t)} className="rounded-md py-1 text-[10px] font-medium" style={{ background: on ? TOKENS.accent : "rgba(148,163,184,0.12)", color: on ? "#0b1220" : TOKENS.text }}>{r.l}</button>
              )
            })}
          </div>
        </div>
      )}
      {/* уровень «Кровля»: тип крыши и сводка по местам на ней */}
      {activeLevelId === "roof" && topFloor && (
        <div className="flex flex-col gap-1 rounded-lg p-1.5" style={{ border: `1px solid ${TOKENS.panelBorder}` }}>
          <p className="px-0.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>Крыша · {topFloor.name}</p>
          <div className="grid grid-cols-3 gap-1">
            {ROOFS.map((r) => {
              const on = r.t === "none" ? !topFloor.roof : topFloor.roof?.type === r.t
              return (
                <button key={r.t} type="button" onClick={() => setRoof(r.t)} className="rounded-md py-1 text-[10px] font-medium" style={{ background: on ? TOKENS.accent : "rgba(148,163,184,0.12)", color: on ? "#0b1220" : TOKENS.text }}>{r.l}</button>
              )
            })}
          </div>
          {(() => {
            const places = (topFloor.islands ?? []).filter((i) => ROOF_KINDS.has(i.kind))
            const leased = places.filter((i) => (i.tenant ?? "").trim()).length
            return (
              <p className="px-0.5 text-[10px]" style={{ color: TOKENS.muted }}>
                Мест на кровле: {places.length}{places.length ? ` · сдано ${leased}` : ""}
              </p>
            )
          })()}
        </div>
      )}
      <button
        type="button"
        onClick={toggleWallsDown}
        title="Опускать ближние стены (как в Sims) — Фаза 2"
        className="mt-0.5 rounded-xl py-1.5 text-[11px] transition-all"
        style={{ background: wallsDown ? "rgba(167,139,250,0.18)" : "rgba(148,163,184,0.08)", color: wallsDown ? TOKENS.accent2 : TOKENS.muted }}
      >
        Стены вниз {wallsDown ? "✓" : ""}
      </button>
      <UnderlayPanel pending={measure} onConsumed={onMeasureConsumed} />
    </div>
  )
}

function ReplanBlock({ floor, buildingId }: { floor: Floor; buildingId?: string }) {
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
        title="Удаление помечает существующие стены и проёмы под демонтаж, новые рисуются как «новые». Было и стало хранятся в одной модели."
        className="rounded-md py-1.5 text-[11px] font-semibold"
        style={{ background: on ? "#dc2626" : "rgba(148,163,184,0.12)", color: on ? "#fff" : TOKENS.text }}
      >
        {on ? "Перепланировка: включена" : "Перепланировка"}
      </button>
      {sum && (
        <div className="grid grid-cols-2 gap-x-2 text-[10px]" style={{ color: TOKENS.muted, fontVariantNumeric: "tabular-nums" }}>
          <span>Демонтаж стен</span><span className="text-right" style={{ color: "#f87171" }}>{fmt(sum.demolishWallM)} м</span>
          <span>Новые стены</span><span className="text-right" style={{ color: "#4ade80" }}>{fmt(sum.newWallM)} м</span>
          <span>Проёмы нов./закл.</span><span className="text-right" style={{ color: TOKENS.text }}>{sum.openingsNew} / {sum.openingsClosed}</span>
          <span>Площадь было</span><span className="text-right" style={{ color: TOKENS.text }}>{fmt(sum.areaBefore)} м²</span>
          <span>Площадь стало</span><span className="text-right" style={{ color: TOKENS.text }}>{fmt(sum.areaAfter)} м²</span>
        </div>
      )}
      {sum && buildingId && (
        <a href={`/admin/builder/${buildingId}/sheet?floor=${floor.id}&view=replan:demolish`} target="_blank" rel="noreferrer" className="rounded-md py-1 text-center text-[10px] font-medium" style={{ background: "rgba(56,189,248,0.14)", color: TOKENS.text }}>
          Листы: демонтаж, монтаж, стало
        </a>
      )}
    </div>
  )
}
