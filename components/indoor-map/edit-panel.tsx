"use client"

// Панель выбранного помещения в режиме правки: размеры с клавиатуры,
// привязка к карточке, тип зоны и расхождение площадей.
//
// Инструмент для внедренца, а не для случайного пользователя: поля ввода
// узкие, значения в метрах, Enter применяет.

import { Columns2, Rows2, Trash2 } from "lucide-react"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { areaMismatch, findRoom } from "@/lib/indoor-map/edit"
import { area as polygonArea, roomPolygon } from "@/lib/indoor-map/geometry"
import type { SpaceLite } from "@/lib/indoor-map/model"
import { useT } from "@/lib/i18n/client"
import type { FloorEditor } from "./use-floor-editor"

type Props = {
  editor: FloorEditor
  layout: FloorLayoutV2
  spaces: SpaceLite[]
}

export function EditPanel({ editor, layout, spaces }: Props) {
  const { t } = useT()
  const roomId = editor.selectedId
  const room = roomId ? findRoom(layout, roomId) : null

  if (!room) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Выберите помещение на плане или нарисуйте новое инструментом «Помещение».
      </div>
    )
  }

  const linked = room.spaceId ? spaces.find((space) => space.id === room.spaceId) : undefined
  const drawn = polygonArea(roomPolygon(room))
  const mismatch = areaMismatch(room, linked?.area ?? null)
  const isRect = room.type === "rect"

  function setSize(field: "width" | "height", value: number) {
    if (!isRect || !Number.isFinite(value) || value < 0.4) return
    editor.actions.replace({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === room!.id && element.type === "rect"
          ? { ...element, [field]: Math.round(value * 100) / 100 }
          : element,
      ),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      {isRect ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">Размер, м</span>
          <input
            id="room-width"
            type="number"
            step="0.1"
            min="0.4"
            defaultValue={room.width}
            key={`w-${room.id}-${room.width}`}
            onBlur={(event) => setSize("width", Number(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
            className="h-7 w-16 rounded-md border border-slate-200 px-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
          />
          <span className="text-slate-400">×</span>
          <input
            id="room-height"
            type="number"
            step="0.1"
            min="0.4"
            defaultValue={room.height}
            key={`h-${room.id}-${room.height}`}
            onBlur={(event) => setSize("height", Number(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
            className="h-7 w-16 rounded-md border border-slate-200 px-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      ) : (
        <span className="text-xs text-slate-500">Полигон, {room.points.length} углов</span>
      )}

      <span className="text-xs text-slate-500">
        На плане <b className="tabular-nums text-slate-900 dark:text-slate-100">{drawn.toFixed(1)} м²</b>
      </span>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">Карточка</span>
        <select
          id="room-space"
          value={room.spaceId ?? ""}
          onChange={(event) => editor.actions.link(room.id, event.target.value || null)}
          className="h-7 rounded-md border border-slate-200 px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">не привязано</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.number} · {space.area} м²
              {space.tenantName ? ` · ${space.tenantName}` : ""}
            </option>
          ))}
        </select>
      </label>

      {mismatch ? (
        <span
          className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
          title={t("adminObjects.map.edit.areaLocked")}
        >
          По договору {mismatch.contract} м², на плане {mismatch.drawn} м² ({mismatch.percent > 0 ? "+" : ""}
          {mismatch.percent}%)
        </span>
      ) : null}

      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        <input
          id="room-common"
          type="checkbox"
          checked={(room.kind ?? "rentable") === "common"}
          onChange={(event) =>
            editor.actions.setKind(room.id, event.target.checked ? "common" : "rentable")
          }
        />
        Общая зона
      </label>

      <div className="ml-auto flex items-center gap-1">
        {isRect ? (
          <>
            <button
              type="button"
              title={t("adminObjects.map.edit.splitVertical")}
              onClick={() => editor.actions.split(room.id, "vertical")}
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t("adminObjects.map.edit.splitHorizontal")}
              onClick={() => editor.actions.split(room.id, "horizontal")}
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Rows2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          title={t("adminObjects.map.edit.removePremise")}
          onClick={() => editor.actions.remove(room.id)}
          className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
