"use client"

// ADR: Мини-карта активного этажа (вид сверху) для Building Studio (§5.4). Чистый
// canvas 2D: bbox узлов графа стен активного этажа вписывается в холст с отступом,
// Y инвертируется (план — Y вниз). Комнаты (detectRooms) заливаются полупрозрачным
// accent, стены (edges→nodes) обводятся светлым. Перерисовка по [rev, activeLevelId].

import { useEffect, useRef } from "react"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { detectRooms } from "@/core/geometry/room-detection"
import { TOKENS } from "@/lib/builder/materials"
import type { Floor } from "@/types/builder"

const PADDING = 12 // отступ внутри холста, px
const DPR_CAP = 2 // ограничиваем devicePixelRatio для производительности

export function MiniMap() {
  const doc = useDocumentStore((s) => s.doc)
  const rev = useDocumentStore((s) => s.rev)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Активный этаж по любому из зданий; если не найден (например "site") — берём
  // первый этаж первого здания как ближайший доступный план.
  const building = doc.buildings[0]
  let floor: Floor | undefined
  for (const b of doc.buildings) {
    const f = b.floors.find((fl) => fl.id === activeLevelId)
    if (f) {
      floor = f
      break
    }
  }
  const isSite = !floor
  const fallback = building?.floors[0]
  const drawFloor: Floor | undefined = floor ?? fallback
  const title = floor ? floor.name : isSite && activeLevelId === "site" ? "Участок" : (drawFloor?.name ?? "—")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    const cssW = canvas.clientWidth || 180
    const cssH = canvas.clientHeight || 110
    const pxW = Math.round(cssW * dpr)
    const pxH = Math.round(cssH * dpr)
    if (canvas.width !== pxW) canvas.width = pxW
    if (canvas.height !== pxH) canvas.height = pxH

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const graph = drawFloor?.wallGraph
    const nodes = graph ? Object.values(graph.nodes) : []
    if (!graph || nodes.length === 0) {
      ctx.fillStyle = TOKENS.muted
      ctx.font = "11px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(isSite ? "Участок" : "Пусто", cssW / 2, cssH / 2)
      return
    }

    // bbox всех узлов этажа (мм).
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    const innerW = Math.max(cssW - PADDING * 2, 1)
    const innerH = Math.max(cssH - PADDING * 2, 1)
    const scale = Math.min(innerW / spanX, innerH / spanY)
    // центрируем содержимое в холсте
    const offX = PADDING + (innerW - spanX * scale) / 2
    const offY = PADDING + (innerH - spanY * scale) / 2

    // Мир (мм) → экран (px). Инверсия Y: план растёт вниз.
    const sx = (wx: number) => offX + (wx - minX) * scale
    const sy = (wy: number) => offY + (maxY - wy) * scale

    // Заливка комнат полупрозрачным accent.
    const rooms = detectRooms(graph)
    ctx.fillStyle = "rgba(56,189,248,0.22)"
    for (const room of rooms) {
      const poly = room.polygon
      if (poly.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(sx(poly[0].x), sy(poly[0].y))
      for (let i = 1; i < poly.length; i++) ctx.lineTo(sx(poly[i].x), sy(poly[i].y))
      ctx.closePath()
      ctx.fill()
    }

    // Обводка стен светлыми линиями.
    ctx.strokeStyle = "rgba(226,232,240,0.85)"
    ctx.lineWidth = 1.25
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    for (const e of Object.values(graph.edges)) {
      const a = graph.nodes[e.a]
      const b = graph.nodes[e.b]
      if (!a || !b) continue
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
    }
    ctx.stroke()
  }, [rev, activeLevelId, drawFloor, isSite])

  return (
    <div
      className="absolute left-3 bottom-9 z-20 flex flex-col gap-1 rounded-2xl p-2 shadow-2xl backdrop-blur-xl"
      style={{ width: 180, background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="truncate px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: TOKENS.muted }}>
        {title}
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl"
        style={{ height: 110, background: "rgba(7,10,18,0.6)" }}
      />
    </div>
  )
}
