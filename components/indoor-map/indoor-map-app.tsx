"use client"

// Оболочка indoor-карты: лента этажей справа (как в 2ГИС), фильтры, поиск и
// карточка помещения. Сам план рисует FloorMap. Фаза 1 — плоский режим;
// объёмный включается здесь же кнопкой 2D/3D, когда будет готов (SPEC §8).

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"
import { Box, LayoutGrid, Map as MapIcon, PencilRuler, Search, TriangleAlert, X } from "lucide-react"
import { generateFloorSchema } from "@/app/actions/indoor-map"
import { layoutBox } from "@/lib/indoor-map/geometry"
import { VolumeLoader } from "./volume-loader"
import type { VolumeFloor } from "./volume-view"
import { isLayoutV2, type FloorLayoutV2 } from "@/lib/floor-layout"
import { buildFloorView, type SpaceLite } from "@/lib/indoor-map/model"
import { STATUS_ORDER, STATUS_STYLE } from "@/lib/indoor-map/tokens"
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
}

function parseLayout(raw: string | null): FloorLayoutV2 | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isLayoutV2(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function IndoorMapApp({ buildingId, floors }: Props) {
  const withPlan = useMemo(
    () => floors.filter((floor) => parseLayout(floor.layoutJson) !== null),
    [floors],
  )
  const [activeId, setActiveId] = useState<string>(withPlan[0]?.id ?? floors[0]?.id ?? "")
  const [mode, setMode] = useState<"plan" | "volume">("plan")
  const [filter, setFilter] = useState<MapFilter>("all")
  const [selected, setSelected] = useState<RoomView | null>(null)
  const [query, setQuery] = useState("")
  const mapRef = useRef<FloorMapHandle>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)

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
        setSchemaError("У этажа нет помещений с площадью — собирать схему не из чего.")
      } else {
        setConfirmReplace(true)
      }
    })
  }

  const active = floors.find((floor) => floor.id === activeId) ?? floors[0] ?? null
  const layout = active ? parseLayout(active.layoutJson) : null
  const view = useMemo(
    () => (layout && active ? buildFloorView(layout, active.spaces) : null),
    [layout, active],
  )

  // Объём собирается из планов всех этажей, у которых они есть
  const volumeFloors = useMemo<VolumeFloor[]>(() => {
    const built: VolumeFloor[] = []
    for (const floor of floors) {
      const floorLayout = parseLayout(floor.layoutJson)
      if (!floorLayout) continue
      built.push({
        id: floor.id,
        number: floor.number,
        name: floor.name,
        box: layoutBox(floorLayout),
        rooms: buildFloorView(floorLayout, floor.spaces).rooms,
      })
    }
    return built
  }, [floors])

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
      {/* панель управления */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              { key: "plan", label: "План", icon: MapIcon },
              { key: "volume", label: "Объём", icon: Box },
            ] as Array<{ key: "plan" | "volume"; label: string; icon: typeof Box }>
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.key === "volume" && volumeFloors.length === 0}
              onClick={() => setMode(item.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                mode === item.key
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              { key: "all", label: "Все" },
              { key: "vacant", label: "Свободные" },
              { key: "expiring", label: "Освобождаются" },
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
            placeholder="Найти арендатора на этаже"
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
                {STATUS_STYLE[status].label}
              </span>
            ))}
          </div>
          {active ? (
            <Link
              href={`/admin/floors/${active.id}/visualization`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <PencilRuler className="h-3.5 w-3.5" /> Редактор плана
            </Link>
          ) : null}
        </div>
      </div>

      {/* схему честно помечаем: это не обмерный план */}
      {layout?.source === "schema" && active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span>
            Схема по площадям помещений, а не обмерный план: расположение условное, площади
            настоящие. Точную геометрию даст обводка по подложке в редакторе.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => buildSchema(active.id, true)}
            className="ml-auto rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/40 dark:hover:bg-amber-500/20"
          >
            {pending ? "Собираю…" : "Пересобрать"}
          </button>
        </div>
      ) : null}

      {confirmReplace && active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span>У этажа есть нарисованный план. Схема затрёт его — это не отменить.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => buildSchema(active.id, true)}
            className="ml-auto rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            Затереть и собрать
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

      {/* карта + лента этажей */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1">
          {mode === "volume" && volumeFloors.length > 0 ? (
            <VolumeLoader
              floors={volumeFloors}
              activeFloorId={active?.id ?? null}
              onPickFloor={(floorId) => {
                setActiveId(floorId)
                setSelected(null)
              }}
              onPickRoom={(floorId, room) => {
                setActiveId(floorId)
                setSelected(room)
              }}
            />
          ) : layout && view ? (
            <FloorMap
              key={active?.id ?? "none"}
              ref={mapRef}
              layout={layout}
              view={view}
              filter={filter}
              selectedRoomId={selected?.id ?? null}
              onSelect={setSelected}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                У этого этажа ещё нет плана
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Точный план обводится в редакторе по подложке из PDF архитектора. Если его пока
                нет, соберём схему по площадям помещений — статусы и арендаторы будут видны сразу.
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
                    {pending ? "Собираю…" : "Собрать схему из помещений"}
                  </button>
                  <Link
                    href={`/admin/floors/${active.id}/visualization`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <PencilRuler className="h-3.5 w-3.5" /> Нарисовать план
                  </Link>
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
          <div className="flex w-12 shrink-0 flex-col-reverse gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {floors.map((floor) => {
              const has = parseLayout(floor.layoutJson) !== null
              const isActive = floor.id === activeId
              return (
                <button
                  key={floor.id}
                  type="button"
                  title={`${floor.name}${has ? "" : " — плана нет"}`}
                  onClick={() => {
                    setActiveId(floor.id)
                    setSelected(null)
                  }}
                  className={`h-9 shrink-0 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : has
                        ? "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        : "text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800/60"
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
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
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
                {STATUS_STYLE[selected.status].label}
                {selected.number ? ` · помещение ${selected.number}` : ""} ·{" "}
                {selected.area.toFixed(1)} м²
              </span>
            </div>
            {selected.contractEnd ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Договор до {new Date(selected.contractEnd).toLocaleDateString("ru-RU")}
                {selected.daysLeft !== null && selected.daysLeft >= 0
                  ? ` — осталось ${selected.daysLeft} дн.`
                  : ""}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.tenantId ? (
                <Link
                  href={`/admin/tenants/${selected.tenantId}`}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                >
                  Карточка арендатора
                </Link>
              ) : null}
              {selected.spaceId ? (
                <Link
                  href={`/admin/spaces?buildingId=${buildingId}&spaceId=${selected.spaceId}`}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Помещение
                </Link>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Закрыть карточку"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
