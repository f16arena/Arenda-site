"use client"

// Оболочка indoor-карты: лента этажей справа (как в 2ГИС), фильтры, поиск и
// карточка помещения. Сам план рисует FloorMap. Фаза 1 — плоский режим;
// объёмный включается здесь же кнопкой 2D/3D, когда будет готов (SPEC §8).

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"
import {
  Box,
  Download,
  LayoutGrid,
  MousePointer2,
  PencilRuler,
  Printer,
  Search,
  SquarePlus,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react"
import { deleteFloorPlan, saveFloorLayout } from "@/app/actions/floor-layout"
import { EditPanel } from "./edit-panel"
import { UnderlayPanel } from "./underlay-panel"
import { useFloorEditor } from "./use-floor-editor"
import { generateBuildingSchemas, generateFloorSchema } from "@/app/actions/indoor-map"
import { readLayout as parseLayout } from "@/lib/indoor-map/layout-source"
import { buildFloorView, type SpaceLite } from "@/lib/indoor-map/model"
import { STATUS_ORDER, STATUS_STYLE } from "@/lib/indoor-map/tokens"
import { useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { FloorMap, type FloorMapHandle, type MapFilter } from "./floor-map"
import type { RoomView } from "@/lib/indoor-map/model"

export type FloorData = {
  id: string
  number: number
  name: string
  kind: string
  layoutJson: string | null
  spaces: SpaceLite[]
}

type Props = {
  buildingId: string
  floors: FloorData[]
  /** Есть ли право править планы (capability floors.edit). */
  canEdit?: boolean
}

export function IndoorMapApp({
  buildingId,
  floors,
  canEdit = false,
}: Props) {
  const { t, tp, locale } = useT()
  const withPlan = useMemo(
    () => floors.filter((floor) => parseLayout(floor.layoutJson) !== null),
    [floors],
  )
  const [activeId, setActiveId] = useState<string>(withPlan[0]?.id ?? floors[0]?.id ?? "")
  const [filter, setFilter] = useState<MapFilter>("all")
  const [selected, setSelected] = useState<RoomView | null>(null)
  const [query, setQuery] = useState("")
  const mapRef = useRef<FloorMapHandle>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  // удаление с этажа: «scan» — только скан-подложку, «plan» — весь план
  const [confirmDelete, setConfirmDelete] = useState<"plan" | "scan" | null>(null)
  const [deleting, setDeleting] = useState(false)

  function buildAllSchemas() {
    setSchemaError(null)
    startTransition(async () => {
      const result = await generateBuildingSchemas(buildingId)
      if (result.built === 0) {
        setSchemaError(t("adminObjects.map.noAreasBuilding"))
        return
      }
      router.refresh()
    })
  }

  function buildSchema(floorId: string, replace: boolean) {
    setSchemaError(null)
    startTransition(async () => {
      const result = await generateFloorSchema(floorId, replace)
      if (result.success) {
        setConfirmReplace(false)
        router.refresh()
        return
      }
      if (result.reason === "no-spaces") {
        setSchemaError(t("adminObjects.map.noAreasFloor"))
      } else {
        setConfirmReplace(true)
      }
    })
  }

  const active = floors.find((floor) => floor.id === activeId) ?? floors[0] ?? null
  const layout = active ? parseLayout(active.layoutJson) : null
  // скан может лежать и на этаже без помещений — смотрим сырой JSON
  const hasScan = (() => {
    if (!active?.layoutJson) return false
    try {
      const raw = JSON.parse(active.layoutJson) as { underlay?: unknown; underlayUrl?: unknown }
      return !!raw.underlay || !!raw.underlayUrl
    } catch {
      return false
    }
  })()

  async function removeFromFloor(what: "plan" | "scan") {
    if (!active) return
    setDeleting(true)
    try {
      await deleteFloorPlan(active.id, what)
      setEditing(false)
      setSelected(null)
      router.refresh()
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }
  const editor = useFloorEditor(layout)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const shownLayout = editing ? editor.layout : layout
  const view = useMemo(
    () => (shownLayout && active ? buildFloorView(shownLayout, active.spaces) : null),
    [shownLayout, active],
  )

  async function save() {
    if (!active || !editor.draft) return
    setSaving(true)
    try {
      await saveFloorLayout(active.id, JSON.stringify(editor.draft))
      editor.markSaved()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // Поиск арендатора по активному этажу: найденное помещение выделяем и
  // подводим к нему камеру прямо из обработчика ввода.
  function handleQuery(value: string) {
    setQuery(value)
    const needle = value.trim().toLowerCase()
    if (!view || needle.length < 2) return
    const room = view.rooms.find((candidate) => candidate.title.toLowerCase().includes(needle))
    if (!room) return
    setSelected(room)
    mapRef.current?.focus(room)
  }

  const occupancy =
    view && view.rentableArea > 0
      ? Math.round(((view.rentableArea - view.vacantArea) / view.rentableArea) * 100)
      : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* печатная шапка — на экране не видна */}
      <div className="hidden print:block">
        <p className="text-base font-semibold">{active?.name ?? t("adminObjects.map.floorFallback")}</p>
        <p className="text-xs text-slate-500">
          {view
            ? `${tp("adminObjects.map.printVacant", view.vacantCount, {
                area: view.vacantArea.toFixed(0),
              })}${
                occupancy !== null
                  ? ` · ${t("adminObjects.map.occupancy", { percent: occupancy })}`
                  : ""
              }`
            : ""}
        </p>
      </div>

      {/* панель управления */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/admin/builder/${buildingId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          <Box className="h-3.5 w-3.5" /> {t("adminObjects.map.builder3d")}
        </Link>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              { key: "all", label: t("adminObjects.map.filters.all") },
              { key: "vacant", label: t("adminObjects.map.filters.vacant") },
              { key: "expiring", label: t("adminObjects.map.filters.expiring") },
              { key: "debt", label: t("adminObjects.map.filters.debt") },
            ] as Array<{ key: MapFilter; label: string }>
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === item.key
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="indoor-map-search"
            value={query}
            onChange={(event) => handleQuery(event.target.value)}
            placeholder={t("adminObjects.map.searchTenant")}
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {view ? (
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Свободно{" "}
              <b className="text-slate-900 tabular-nums dark:text-slate-100">
                {view.vacantArea.toFixed(0)} м²
              </b>{" "}
              в {view.vacantCount} помещ.
            </span>
            {occupancy !== null ? (
              <span>
                Заполняемость{" "}
                <b className="text-slate-900 tabular-nums dark:text-slate-100">{occupancy}%</b>
              </span>
            ) : null}
            {view.debtCount > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                С долгом <b className="tabular-nums">{view.debtCount}</b>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2.5 md:flex">
            {STATUS_ORDER.map((status) => (
              <span key={status} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm border"
                  style={{
                    background: STATUS_STYLE[status].fill,
                    borderColor: STATUS_STYLE[status].edge,
                  }}
                />
                {t(`adminObjects.map.status.${status}` as "adminObjects.map.status.VACANT")}
              </span>
            ))}
          </div>
          {layout ? (
            <>
              <button
                type="button"
                onClick={() =>
                  mapRef.current?.exportPng(
                    t("adminObjects.map.fileNamePlan", {
                      floor: active?.name ?? t("adminObjects.map.fileNameFloorFallback"),
                    }).replace(/[\/:*?"<>|]/g, "-"),
                  )
                }
                title={t("adminObjects.map.downloadPng")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" /> PNG
              </button>
              {active ? (
                <Link
                  href={`/admin/builder/${buildingId}/sheet?dbFloor=${active.id}`}
                  title={t("adminObjects.map.sheetHint")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <PencilRuler className="h-3.5 w-3.5" /> {t("adminObjects.map.sheet")}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => window.print()}
                title={t("adminObjects.map.printHint")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Printer className="h-3.5 w-3.5" /> {t("adminObjects.map.print")}
              </button>
            </>
          ) : null}
          {canEdit && !editing && (hasScan || layout) ? (
            <div className="flex items-center gap-1">
              {hasScan ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete("scan")}
                  title={t("adminObjects.map.dropScanHint")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-800 dark:text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Скан
                </button>
              ) : null}
              {layout ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete("plan")}
                  title={t("adminObjects.map.dropPlanHint")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-800 dark:text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> План
                </button>
              ) : null}
            </div>
          ) : null}
          {canEdit && shownLayout ? (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                editing
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <PencilRuler className="h-3.5 w-3.5" /> {editing ? t("adminObjects.map.editOn") : t("adminObjects.map.editOff")}
            </button>
          ) : null}
        </div>
      </div>

      {/* схему честно помечаем: это не обмерный план */}
      {layout?.source === "schema" && active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t("adminObjects.map.schemaNotice")}
          </span>
          <button
            type="button"
            disabled={pending}
            // контур один на всё здание, поэтому пересобираем все этажи разом
            onClick={buildAllSchemas}
            className="ml-auto rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/40 dark:hover:bg-amber-500/20"
          >
            {pending ? "Собираю…" : "Пересобрать схемы здания"}
          </button>
        </div>
      ) : null}

      {confirmDelete && active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span>
            {confirmDelete === "scan"
              ? t("adminObjects.map.dropScanConfirm", { floor: active.name })
              : t("adminObjects.map.dropPlanConfirm", { floor: active.name })}
          </span>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void removeFromFloor(confirmDelete)}
            className="ml-auto rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? t("adminObjects.map.deleting") : t("adminObjects.map.confirmDelete")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="rounded-md border border-red-300 px-2 py-1 font-medium hover:bg-red-100 dark:border-red-500/40 dark:hover:bg-red-500/20"
          >
            Отмена
          </button>
        </div>
      ) : null}

      {confirmReplace && active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{t("adminObjects.map.replaceWarn")}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => buildSchema(active.id, true)}
            className="ml-auto rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {t("adminObjects.map.replaceConfirm")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmReplace(false)}
            className="rounded-md border border-red-300 px-2 py-1 font-medium hover:bg-red-100 dark:border-red-500/40 dark:hover:bg-red-500/20"
          >
            Отмена
          </button>
        </div>
      ) : null}

      {/* инструменты правки */}
      {editing && shownLayout ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(
              [
                {
                  key: "select",
                  label: t("adminObjects.map.tools.select"),
                  icon: MousePointer2,
                },
                { key: "rect", label: t("adminObjects.map.tools.rect"), icon: SquarePlus },
              ] as Array<{ key: "select" | "rect"; label: string; icon: typeof Box }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => editor.setTool(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  editor.tool === item.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!editor.canUndo}
            onClick={editor.undo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-400"
          >
            <Undo2 className="h-3.5 w-3.5" /> {t("common.actions.undo")}
          </button>
          <span className="text-xs text-slate-500">
            {editor.dirty ? t("adminObjects.map.dirty") : t("adminObjects.map.clean")}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                editor.reset()
                setEditing(false)
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400"
            >
              {t("adminObjects.map.exitNoSave")}
            </button>
            <button
              type="button"
              disabled={!editor.dirty || saving}
              onClick={save}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? t("common.actions.saving") : t("adminObjects.map.savePlan")}
            </button>
          </div>
        </div>
      ) : null}

      {editing && shownLayout ? <UnderlayPanel editor={editor} layout={shownLayout} /> : null}

      {editing && shownLayout && active ? (
        <EditPanel editor={editor} layout={shownLayout} spaces={active.spaces} />
      ) : null}

      {/* карта + лента этажей */}
      <div className="flex min-h-0 flex-1 gap-3 print:block">
        <div className="min-w-0 flex-1">
          {shownLayout && view ? (
            <FloorMap
              key={active?.id ?? "none"}
              ref={mapRef}
              layout={shownLayout}
              view={view}
              filter={filter}
              selectedRoomId={editing ? editor.selectedId : (selected?.id ?? null)}
              onSelect={setSelected}
              edit={
                editing
                  ? {
                      tool: editor.tool,
                      onSelectRoom: editor.setSelectedId,
                      onMoveVertex: editor.actions.moveVertex,
                      onMoveRoom: editor.actions.moveRoom,
                      onCreateRect: editor.actions.createRect,
                      onMeasure: editor.actions.measure,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("adminObjects.map.noPlanTitle")}
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                {t("adminObjects.map.noPlanHint")}
              </p>
              {active ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => buildSchema(active.id, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    {pending ? t("adminObjects.map.rebuilding") : t("adminObjects.map.buildFromSpaces")}
                  </button>
                  {floors.length > 1 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={buildAllSchemas}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" /> {t("adminObjects.map.allFloorsSchema")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <PencilRuler className="h-3.5 w-3.5" /> Нарисовать самому
                  </button>
                </div>
              ) : null}
              {schemaError ? (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">{schemaError}</p>
              ) : null}
            </div>
          )}
        </div>

        {/* лента этажей: активный подсвечен, без плана — приглушён */}
        {floors.length > 1 ? (
          <div className="flex w-12 shrink-0 flex-col-reverse gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 print:hidden dark:border-slate-800 dark:bg-slate-900">
            {floors.map((floor) => {
              const has = parseLayout(floor.layoutJson) !== null
              const isActive = floor.id === activeId
              return (
                <button
                  key={floor.id}
                  type="button"
                  title={has ? floor.name : t("adminObjects.map.floorNoPlan", { floor: floor.name })}
                  onClick={() => {
                    setActiveId(floor.id)
                    setSelected(null)
                  }}
                  className={`h-9 shrink-0 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : has
                        ? "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        : "text-slate-300 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {floor.number}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* карточка выбранного помещения */}
      {selected ? (
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
          <span
            className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm border"
            style={{
              background: STATUS_STYLE[selected.status].fill,
              borderColor: STATUS_STYLE[selected.status].edge,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selected.title}
              </span>
              <span className="text-xs text-slate-500">
                {t(`adminObjects.map.status.${selected.status}` as "adminObjects.map.status.VACANT")}
                {selected.number
                  ? ` · ${t("adminObjects.map.selectedPremise", { number: selected.number })}`
                  : ""}{" "}
                ·{" "}
                {selected.area.toFixed(1)} м²
              </span>
            </div>
            {selected.debt > 0 ? (
              <p className="mt-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                {t("adminObjects.map.debtTitle", {
                  amount: formatMoneyL(locale, Math.round(selected.debt)),
                })}
              </p>
            ) : null}
            {selected.contractEnd ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t("adminObjects.map.contractUntil", {
                  date: formatDateShortL(locale, selected.contractEnd),
                })}
                {selected.daysLeft !== null && selected.daysLeft >= 0
                  ? ` — ${t("adminObjects.map.daysLeftSuffix", { days: selected.daysLeft })}`
                  : ""}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.tenantId ? (
                <Link
                  href={`/admin/tenants/${selected.tenantId}`}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                >
                  {t("adminObjects.map.tenantCard")}
                </Link>
              ) : null}
              {selected.spaceId ? (
                <Link
                  href={`/admin/spaces?buildingId=${buildingId}&spaceId=${selected.spaceId}`}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t("adminObjects.map.premiseLink")}
                </Link>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label={t("adminObjects.map.closeCard")}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
