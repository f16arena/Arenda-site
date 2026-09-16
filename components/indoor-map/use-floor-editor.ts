"use client"

// Состояние правки плана: черновик, история отмен, выбранный инструмент.
// Вся геометрия живёт в lib/indoor-map/edit — здесь только «что нажали».

import { useCallback, useMemo, useState } from "react"
import type { FloorLayoutV2, Point } from "@/lib/floor-layout"
import {
  addRect,
  calibrateUnderlay,
  distance,
  linkSpace,
  moveRoom,
  moveVertex,
  removeElement,
  setRoomKind,
  setUnderlay,
  splitRoom,
} from "@/lib/indoor-map/edit"
import type { FloorUnderlay } from "@/lib/floor-layout"

export type EditorTool = "select" | "rect" | "ruler"

const UNDO_LIMIT = 50

export type FloorEditor = ReturnType<typeof useFloorEditor>

export function useFloorEditor(source: FloorLayoutV2 | null) {
  const [draft, setDraft] = useState<FloorLayoutV2 | null>(null)
  const [history, setHistory] = useState<FloorLayoutV2[]>([])
  const [tool, setTool] = useState<EditorTool>("select")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Отрезок калибровки: длина в метрах текущей системы координат ждёт,
  // пока человек скажет, сколько это на самом деле.
  const [measured, setMeasured] = useState<number | null>(null)

  const layout = draft ?? source
  const dirty = draft !== null

  /** Записать новое состояние плана, запомнив предыдущее для отмены. */
  const commit = useCallback(
    (next: FloorLayoutV2 | null) => {
      if (!next || !layout) return
      setHistory((prev) => [...prev.slice(-UNDO_LIMIT + 1), layout])
      setDraft(next)
    },
    [layout],
  )

  const actions = useMemo(
    () => ({
      moveVertex(roomId: string, index: number, to: Point) {
        if (layout) commit(moveVertex(layout, roomId, index, to))
      },
      moveRoom(roomId: string, delta: Point) {
        if (layout) commit(moveRoom(layout, roomId, delta))
      },
      createRect(from: Point, to: Point) {
        if (!layout) return
        const result = addRect(layout, from, to)
        if (!result) return
        commit(result.layout)
        setSelectedId(result.id)
        setTool("select")
      },
      split(roomId: string, direction: "vertical" | "horizontal") {
        if (!layout) return
        const result = splitRoom(layout, roomId, direction)
        if (!result) return
        commit(result.layout)
        setSelectedId(result.id)
      },
      remove(roomId: string) {
        if (!layout) return
        commit(removeElement(layout, roomId))
        setSelectedId(null)
      },
      link(roomId: string, spaceId: string | null) {
        if (layout) commit(linkSpace(layout, roomId, spaceId))
      },
      setKind(roomId: string, kind: "rentable" | "common") {
        if (layout) commit(setRoomKind(layout, roomId, kind))
      },
      /** Заменить план целиком — например, задав размеры с клавиатуры. */
      replace(next: FloorLayoutV2) {
        commit(next)
      },
      setUnderlay(underlay: FloorUnderlay | null) {
        if (layout) commit(setUnderlay(layout, underlay))
      },
      measure(from: Point, to: Point) {
        setMeasured(distance(from, to))
      },
      calibrate(realMeters: number) {
        if (!layout || !measured) return
        commit(calibrateUnderlay(layout, measured, realMeters))
        setMeasured(null)
        setTool("select")
      },
    }),
    [layout, commit, measured],
  )

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setDraft(last)
      return prev.slice(0, -1)
    })
  }, [])

  /** Отказаться от правок и вернуться к сохранённому плану. */
  const reset = useCallback(() => {
    setDraft(null)
    setHistory([])
    setSelectedId(null)
  }, [])

  /** После успешного сохранения черновик становится основой. */
  const markSaved = useCallback(() => {
    setHistory([])
    setDraft(null)
  }, [])

  return {
    layout,
    draft,
    dirty,
    canUndo: history.length > 0,
    tool,
    setTool,
    selectedId,
    setSelectedId,
    measured,
    clearMeasure: () => setMeasured(null),
    actions,
    undo,
    reset,
    markSaved,
  }
}
