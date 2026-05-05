"use client"

import { useState } from "react"
import { toast } from "sonner"
import { clearFloorPlan } from "@/app/actions/floor-layout"
import { deleteAllSpacesOnFloor } from "@/app/actions/spaces"
import { deleteFloor } from "@/app/actions/buildings"
import { Square, Trash2 } from "lucide-react"
import {
  type FloorLayoutV2,
  type FloorElement,
  type RoomKind,
  polygonArea,
  summarizeAreas,
} from "@/lib/floor-layout"

type SpaceLite = { id: string; number: string; status: string }

export function PropertiesPanel({
  element, spaces, onUpdate, onDelete,
}: {
  element: FloorElement
  spaces: SpaceLite[]
  onUpdate: (patch: Partial<FloorElement>) => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">
          {element.type === "rect" ? "Прямоугольник"
            : element.type === "polygon" ? "Многоугольник"
            : element.type === "door" ? "Дверь"
            : element.type === "window" ? "Окно"
            : element.type === "label" ? "Подпись"
            : element.type === "icon" ? `Иконка: ${element.kind}`
            : "Стена"}
        </p>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(element.type === "rect" || element.type === "polygon") && (
        <>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Тип помещения</label>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              <button
                onClick={() => onUpdate({ kind: "rentable", spaceId: element.spaceId ?? null } as Partial<FloorElement>)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  (element.kind ?? "rentable") === "rentable"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Арендуемое
              </button>
              <button
                onClick={() => onUpdate({ kind: "common", spaceId: null } as Partial<FloorElement>)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  element.kind === "common"
                    ? "bg-slate-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Общая зона
              </button>
            </div>
          </div>
          {element.kind !== "common" && (
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Связать со Space</label>
              <select
                value={element.spaceId ?? ""}
                onChange={(e) => onUpdate({ spaceId: e.target.value || null } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value="">— Не связано —</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>Каб. {s.number} ({s.status})</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Цвет фигуры берётся из статуса помещения</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Подпись</label>
            <input
              value={element.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value } as Partial<FloorElement>)}
              placeholder={element.kind === "common" ? "Коридор / Туалет / Тех ..." : "Холл / Кабинет / ..."}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      {element.type === "rect" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
          <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
          <Field label="Ширина (м)" value={element.width} onChange={(v) => onUpdate({ width: Math.max(0.1, v) } as Partial<FloorElement>)} />
          <Field label="Длина (м)" value={element.height} onChange={(v) => onUpdate({ height: Math.max(0.1, v) } as Partial<FloorElement>)} />
          <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1.5">
            Площадь: <b>{(element.width * element.height).toFixed(2)} м²</b>
          </div>
        </div>
      )}

      {element.type === "polygon" && (
        <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1.5">
          Вершин: {element.points.length} · Площадь: <b>{polygonArea(element.points).toFixed(2)} м²</b>
        </div>
      )}

      {element.type === "door" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Ширина (м)" value={element.width} onChange={(v) => onUpdate({ width: Math.max(0.4, v) } as Partial<FloorElement>)} step={0.1} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Поворот</label>
              <select
                value={element.rotation}
                onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value={0}>0°</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Сторона петель</label>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate({ swing: "left" } as Partial<FloorElement>)}
                className={`flex-1 rounded border px-3 py-1.5 text-xs ${element.swing === "left" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}
              >
                Слева
              </button>
              <button
                onClick={() => onUpdate({ swing: "right" } as Partial<FloorElement>)}
                className={`flex-1 rounded border px-3 py-1.5 text-xs ${element.swing === "right" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}
              >
                Справа
              </button>
            </div>
          </div>
        </>
      )}

      {element.type === "label" && (
        <>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Текст</label>
            <input
              value={element.text}
              onChange={(e) => onUpdate({ text: e.target.value } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Размер (м)</label>
            <input
              type="number"
              min="0.2"
              max="2"
              step="0.1"
              value={element.fontSize ?? 0.5}
              onChange={(e) => onUpdate({ fontSize: parseFloat(e.target.value) } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      {element.type === "wall" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X1 (м)" value={element.x1} onChange={(v) => onUpdate({ x1: v } as Partial<FloorElement>)} />
            <Field label="Y1 (м)" value={element.y1} onChange={(v) => onUpdate({ y1: v } as Partial<FloorElement>)} />
            <Field label="X2 (м)" value={element.x2} onChange={(v) => onUpdate({ x2: v } as Partial<FloorElement>)} />
            <Field label="Y2 (м)" value={element.y2} onChange={(v) => onUpdate({ y2: v } as Partial<FloorElement>)} />
          </div>
          <Field label="Толщина (м)" value={element.thickness ?? 0.15} step={0.05} onChange={(v) => onUpdate({ thickness: Math.max(0.05, v) } as Partial<FloorElement>)} />
        </>
      )}

      {element.type === "window" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Ширина (м)" value={element.width} step={0.1} onChange={(v) => onUpdate({ width: Math.max(0.3, v) } as Partial<FloorElement>)} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Поворот</label>
              <select
                value={element.rotation}
                onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value={0}>0°</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </div>
          </div>
        </>
      )}

      {element.type === "icon" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Размер (м)" value={element.size} step={0.1} onChange={(v) => onUpdate({ size: Math.max(0.5, v) } as Partial<FloorElement>)} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Тип</label>
              <select
                value={element.kind}
                onChange={(e) => onUpdate({ kind: e.target.value } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value="stairs">Лестница</option>
                <option value="elevator">Лифт</option>
                <option value="toilet">Туалет</option>
                <option value="kitchen">Кухня</option>
                <option value="parking">Парковка</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Подпись</label>
            <input
              value={element.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}
    </div>
  )
}



export function InsertRoomPanel({ onInsert }: { onInsert: (name: string, width: number, height: number, kind: RoomKind) => void }) {
  const [mode, setMode] = useState<"lw" | "area">("lw")
  const [kind, setKind] = useState<RoomKind>("rentable")
  const [name, setName] = useState("")
  const [length, setLength] = useState<string>("4")
  const [width, setWidth] = useState<string>("3")
  const [area, setArea] = useState<string>("12")
  const [areaSide, setAreaSide] = useState<string>("4")
  const [areaSideKind, setAreaSideKind] = useState<"length" | "width">("length")

  const numL = parseFloat(length.replace(",", ".")) || 0
  const numW = parseFloat(width.replace(",", ".")) || 0
  const numA = parseFloat(area.replace(",", ".")) || 0
  const numSide = parseFloat(areaSide.replace(",", ".")) || 0

  let computedArea = 0
  let computedL = 0
  let computedW = 0

  if (mode === "lw") {
    computedL = numL
    computedW = numW
    computedArea = numL * numW
  } else {
    computedArea = numA
    if (numSide > 0 && numA > 0) {
      const other = numA / numSide
      if (areaSideKind === "length") {
        computedL = numSide
        computedW = other
      } else {
        computedW = numSide
        computedL = other
      }
    }
  }

  const canInsert = computedL > 0.1 && computedW > 0.1 && computedL <= 100 && computedW <= 100

  const handle = () => {
    if (!canInsert) {
      toast.error("Укажите корректные размеры (от 0.1 до 100 м)")
      return
    }
    onInsert(name.trim(), Math.round(computedL * 100) / 100, Math.round(computedW * 100) / 100, kind)
    setName("")
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <Square className="h-3.5 w-3.5" />
          Вставить помещение
        </p>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
          <button
            onClick={() => setMode("lw")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${mode === "lw" ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
          >
            Д × Ш
          </button>
          <button
            onClick={() => setMode("area")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${mode === "area" ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
          >
            м² + сторона
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          onClick={() => setKind("rentable")}
          className={`flex flex-col items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium transition ${
            kind === "rentable"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
          title="Помещение, которое сдаётся в аренду (можно привязать к Space)"
        >
          <span>Арендуемое</span>
          <span className="text-[9px] opacity-80">кабинет / офис</span>
        </button>
        <button
          onClick={() => setKind("common")}
          className={`flex flex-col items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium transition ${
            kind === "common"
              ? "bg-slate-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
          title="Общая зона, которая не сдаётся (коридор, тех.помещение)"
        >
          <span>Общая зона</span>
          <span className="text-[9px] opacity-80">коридор / тех</span>
        </button>
      </div>

      <div>
        <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Название (необязательно)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "common" ? "Коридор / Туалет / Тех ..." : "Кабинет / Офис / 101 ..."}
          className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
        />
      </div>

      {mode === "lw" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Длина (м)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Ширина (м)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Площадь (м²)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Известная сторона (м)</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={areaSide}
                onChange={(e) => setAreaSide(e.target.value)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
              />
            </div>
            <select
              value={areaSideKind}
              onChange={(e) => setAreaSideKind(e.target.value as "length" | "width")}
              className="rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
            >
              <option value="length">— длина</option>
              <option value="width">— ширина</option>
            </select>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between text-blue-700 dark:text-blue-300">
          <span>Площадь:</span>
          <b>{computedArea > 0 ? `${computedArea.toFixed(2)} м²` : "—"}</b>
        </div>
        <div className="flex items-center justify-between text-blue-600/80 dark:text-blue-400/80 mt-0.5">
          <span>Размер:</span>
          <b>{computedL > 0 && computedW > 0 ? `${computedL.toFixed(2)} × ${computedW.toFixed(2)} м` : "—"}</b>
        </div>
      </div>

      <button
        onClick={handle}
        disabled={!canInsert}
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 text-sm font-medium transition-colors ${
          kind === "common" ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        <Square className="h-4 w-4" />
        {kind === "common" ? "Вставить общую зону" : "Вставить помещение"}
      </button>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 -mt-1">
        {kind === "common"
          ? "Общая зона входит в общую площадь этажа, но не сдаётся в аренду."
          : "Помещение войдёт в арендопригодную площадь и может быть привязано к Space."}
      </p>
    </div>
  )
}

// ── Areas breakdown panel: rentable + common = drawn, vs Floor.totalArea ─
// ── Danger zone: clear elements / clear plan / delete spaces / delete floor ─


export function DangerZone({
  floorId, floorName, spacesCount, elementsCount,
  onClearElements, onPlanCleared, onFloorDeleted,
}: {
  floorId: string
  floorName: string
  spacesCount: number
  elementsCount: number
  onClearElements: () => void
  onPlanCleared: () => void
  onFloorDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const handleClearElements = () => {
    if (elementsCount === 0) {
      toast.message("На плане нет элементов")
      return
    }
    if (!window.confirm(
      `Удалить все ${elementsCount} элемент${elementsCount === 1 ? "" : "ов"} с плана?\n\n` +
      `Подложка, общая площадь и сетка останутся.\n` +
      `Помещения (Space) тоже не затрагиваются — стираются только нарисованные прямоугольники, двери, иконки и подписи.\n\n` +
      `Можно отменить через Ctrl+Z до сохранения.`,
    )) return
    onClearElements()
  }

  const handleClearPlan = async () => {
    if (!window.confirm(
      `Очистить нарисованный план «${floorName}»?\n\n` +
      `Будут стёрты:\n• Все нарисованные прямоугольники, стены, двери, иконки\n• Подложка (фото плана)\n• Общая площадь этажа\n\n` +
      `Помещения (Space) останутся на месте — это только визуальный слой.`,
    )) return
    setBusy("plan")
    try {
      await clearFloorPlan(floorId)
      onPlanCleared()
      toast.success("План очищен. Можно рисовать заново.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось очистить")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteAllSpaces = async () => {
    if (spacesCount === 0) {
      toast.message("На этаже нет помещений")
      return
    }
    if (!window.confirm(
      `Удалить ВСЕ ${spacesCount} помещени${spacesCount === 1 ? "е" : spacesCount < 5 ? "я" : "й"} этажа «${floorName}»?\n\n` +
      `⚠ Помещения с активными арендаторами удалить нельзя — придётся сначала выселить.\n\n` +
      `Это действие необратимо.`,
    )) return
    setBusy("spaces")
    try {
      const r = await deleteAllSpacesOnFloor(floorId)
      toast.success(`Удалено помещений: ${r.count}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteFloor = async () => {
    const cascade = spacesCount > 0
    const cascadeNote = cascade
      ? `\n\nНа этаже ${spacesCount} помещени${spacesCount === 1 ? "е" : spacesCount < 5 ? "я" : "й"} — они тоже будут удалены (если ни одно не занято арендатором).`
      : ""
    if (!window.confirm(
      `УДАЛИТЬ ЭТАЖ «${floorName}» полностью?${cascadeNote}\n\n` +
      `⚠ Это действие необратимо. План, помещения и сам этаж исчезнут безвозвратно.`,
    )) return
    if (!window.confirm("Точно удалить? Это последнее предупреждение.")) return
    setBusy("floor")
    try {
      await deleteFloor(floorId, { cascade })
      toast.success(`Этаж «${floorName}» удалён`)
      onFloorDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
      setBusy(null)
    }
  }

  return (
    <details
      className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-500/30 overflow-hidden"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide flex items-center gap-1.5 hover:bg-red-50/50 dark:hover:bg-red-500/5">
        <Trash2 className="h-3.5 w-3.5" />
        Опасная зона
      </summary>
      <div className="px-4 py-3 space-y-2 border-t border-red-100 dark:border-red-500/20">
        <button
          onClick={handleClearElements}
          disabled={elementsCount === 0}
          className="w-full text-left px-3 py-2 rounded-lg border border-yellow-200 dark:border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-500/5 hover:bg-yellow-100 dark:hover:bg-yellow-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
            Очистить элементы ({elementsCount})
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Стирает все нарисованные комнаты/двери/иконки. Подложка и площадь остаются. Можно отменить Ctrl+Z.
          </p>
        </button>

        <button
          onClick={handleClearPlan}
          disabled={!!busy}
          className="w-full text-left px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {busy === "plan" ? "Очистка..." : "Очистить план"}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Стирает рисунок, подложку и общ. площадь. Помещения остаются.
          </p>
        </button>

        <button
          onClick={handleDeleteAllSpaces}
          disabled={!!busy || spacesCount === 0}
          className="w-full text-left px-3 py-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/5 hover:bg-orange-100 dark:hover:bg-orange-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
            {busy === "spaces" ? "Удаление..." : `Удалить все помещения (${spacesCount})`}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Массово удалит Space-записи. Только если ни одно не занято.
          </p>
        </button>

        <button
          onClick={handleDeleteFloor}
          disabled={!!busy}
          className="w-full text-left px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            {busy === "floor" ? "Удаление..." : "Удалить этаж целиком"}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Удалит этаж со всеми помещениями (если ни одно не занято).
          </p>
        </button>
      </div>
    </details>
  )
}

export function AreasPanel({
  layout, totalArea, setTotalArea, setLayout,
}: {
  layout: FloorLayoutV2
  totalArea: number | null
  setTotalArea: (v: number | null) => void
  setLayout: (next: FloorLayoutV2 | ((prev: FloorLayoutV2) => FloorLayoutV2)) => void
}) {
  const sums = summarizeAreas(layout)
  const hasFloorArea = totalArea !== null && totalArea > 0
  const remaining = hasFloorArea ? (totalArea - sums.total) : null
  // Допуск 5% на стены/конструкции
  const tolerance = hasFloorArea ? totalArea * 0.05 : 0
  const overflow = hasFloorArea && sums.total > totalArea + 0.01
  const tightFit = hasFloorArea && remaining !== null && remaining < tolerance && !overflow

  const pctRentable = hasFloorArea && totalArea > 0 ? Math.min(100, (sums.rentable / totalArea) * 100) : 0
  const pctCommon = hasFloorArea && totalArea > 0 ? Math.min(100, (sums.common / totalArea) * 100) : 0
  const pctOver = overflow ? Math.min(100, ((sums.total - totalArea) / totalArea) * 100) : 0

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Площади этажа</p>

      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
          Общая площадь этажа (м²)
          <span className="ml-1 text-[10px] text-slate-300 dark:text-slate-600">из тех. паспорта</span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="напр. 250"
            value={totalArea ?? ""}
            onChange={(e) => {
              const v = e.target.value
              setTotalArea(v === "" ? null : Math.max(0, parseFloat(v) || 0))
            }}
            className="flex-1 rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
          />
          <button
            onClick={() => {
              if (sums.total > 0) {
                setTotalArea(Math.round(sums.total * 10) / 10)
                toast.success("Площадь рассчитана из нарисованного")
              } else {
                toast.error("Сначала добавьте помещения на план")
              }
            }}
            title="Подставить сумму нарисованных помещений и общих зон"
            className="rounded border border-slate-200 dark:border-slate-800 px-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Σ
          </button>
        </div>
      </div>

      {/* Высота потолка — из метки H=X,XX на плане, для будущего 3D-вида */}
      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
          Высота потолка (м)
          <span className="ml-1 text-[10px] text-slate-300 dark:text-slate-600">метка H=X,XX</span>
        </label>
        <input
          type="number"
          min="2"
          max="6"
          step="0.05"
          placeholder="напр. 3.5"
          value={layout.ceilingHeight ?? ""}
          onChange={(e) => {
            const v = e.target.value
            setLayout((prev) => ({
              ...prev,
              ceilingHeight: v === "" ? null : Math.max(0, parseFloat(v) || 0),
            }))
          }}
          className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
        />
      </div>

      {/* Stacked breakdown */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            Арендопригодные
          </span>
          <b className="tabular-nums text-slate-700 dark:text-slate-300">{sums.rentable.toFixed(1)} м²</b>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-slate-400" />
            Общие зоны
          </span>
          <b className="tabular-nums text-slate-700 dark:text-slate-300">{sums.common.toFixed(1)} м²</b>
        </div>
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-600 dark:text-slate-400">Итого нарисовано</span>
          <b className="tabular-nums text-slate-900 dark:text-slate-100">{sums.total.toFixed(1)} м²</b>
        </div>
        {hasFloorArea && (
          <div className={`flex items-center justify-between text-xs ${overflow ? "text-red-600 dark:text-red-400" : tightFit ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
            <span>{overflow ? "Превышение" : "Свободно (стены/Δ)"}</span>
            <b className="tabular-nums">
              {overflow
                ? `+${(sums.total - totalArea).toFixed(1)} м²`
                : `${(remaining ?? 0).toFixed(1)} м²`}
            </b>
          </div>
        )}
      </div>

      {/* Visual progress bar against floor.totalArea */}
      {hasFloorArea && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctRentable}%` }} />
            <div className="h-full bg-slate-400 transition-all" style={{ width: `${pctCommon}%` }} />
            {overflow && <div className="h-full bg-red-500" style={{ width: `${pctOver}%` }} />}
          </div>
          {overflow && (
            <p className="text-[10px] text-red-600 dark:text-red-400">
              ⚠ Сумма помещений превышает общую площадь этажа. Уменьшите размеры или увеличьте «общую площадь».
            </p>
          )}
          {!overflow && tightFit && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Почти заполнено. Учтите, что стены и конструкции занимают ~3–5% от общей площади.
            </p>
          )}
        </div>
      )}

      {/* Canvas size — менее заметно, для подгонки рабочей области */}
      <details className="group">
        <summary className="text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
          ▸ Размер холста для редактирования
        </summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1">Длина (м)</label>
            <input
              type="number"
              min="5"
              max="200"
              step="0.5"
              value={layout.width}
              onChange={(e) => setLayout((p) => ({ ...p, width: parseFloat(e.target.value) || 30 }))}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1">Ширина (м)</label>
            <input
              type="number"
              min="5"
              max="200"
              step="0.5"
              value={layout.height}
              onChange={(e) => setLayout((p) => ({ ...p, height: parseFloat(e.target.value) || 20 }))}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Рабочая область, в которую помещаются нарисованные зоны (не путать с площадью этажа).
        </p>
      </details>
    </div>
  )
}

function Field({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
      />
    </div>
  )
}
