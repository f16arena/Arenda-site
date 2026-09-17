// DXF → прозрачная PNG-подложка в настоящем масштабе (только браузер).

import type { DxfImport } from "./dxf-import"

export interface RasterUnderlay {
  url: string
  widthMm: number
  aspect: number
  /** левый нижний угол картинки в мм плана */
  x: number
  y: number
}

export function rasterizeDxf(d: DxfImport, maxDim = 3000): RasterUnderlay {
  const pad = Math.max(d.bounds.maxX - d.bounds.minX, d.bounds.maxY - d.bounds.minY) * 0.01 + 1
  const minX = d.bounds.minX - pad, minY = d.bounds.minY - pad
  const wMm = d.bounds.maxX - d.bounds.minX + pad * 2
  const hMm = d.bounds.maxY - d.bounds.minY + pad * 2
  const k = maxDim / Math.max(wMm, hMm)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(wMm * k))
  canvas.height = Math.max(1, Math.round(hMm * k))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Браузер не дал нарисовать подложку")
  ctx.strokeStyle = "#0f172a"
  ctx.lineWidth = 1.4
  ctx.lineCap = "round"
  ctx.beginPath()
  for (const [ax, ay, bx, by] of d.segments) {
    // ось Y чертежа вверх, у картинки — вниз
    ctx.moveTo((ax - minX) * k, (minY + hMm - ay) * k)
    ctx.lineTo((bx - minX) * k, (minY + hMm - by) * k)
  }
  ctx.stroke()
  return { url: canvas.toDataURL("image/png"), widthMm: wMm, aspect: canvas.width / canvas.height, x: minX, y: minY }
}
