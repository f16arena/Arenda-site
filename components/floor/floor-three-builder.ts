// Сборка three.js-сцены этажа из 2D-плана (FloorLayoutV2).
// Общий код для Floor3D (один этаж) и Building3D (здание целиком, этажи стопкой).
// Координаты: план (x, y) в метрах → 3D (x, высота, y).

import * as THREE from "three"
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { type SpaceInfo, STATUS_FILL, detectStatus } from "./floor-view"

type Pt = { x: number; y: number }

export const WALL_THICKNESS = 0.12
export const WALL_COLOR = 0xcbd5e1
export const WALL_SELECTED = 0x3b82f6
const COMMON_FILL = "#e2e8f0"
const DOOR_COLOR = 0x9a6b3f
const WINDOW_COLOR = 0x7dd3fc

export type BuildFloorOptions = {
  /** Высота потолка, м (по умолчанию из layout.ceilingHeight или 3) */
  ceilingHeight?: number
  /** Подписи комнат (CSS2D). "none" — без подписей (неактивные этажи здания). */
  labels?: "full" | "none"
  /** Прозрачность стен поверх базовой (для «призрачных» этажей в режиме всего здания) */
  wallOpacityScale?: number
  /** Помечать комнаты/иконки draggable (режим редактора) */
  editable?: boolean
  /** Территория: комнаты — плоские площадки (парковка) без стен */
  flat?: boolean
  /** Тени у стен и объектов */
  shadows?: boolean
}

export type BuiltFloor = {
  group: THREE.Group
  /** Группы комнат с userData.elId (+ spaceId) — для raycast-клика */
  clickable: THREE.Object3D[]
  /** Объекты, которые можно таскать в режиме editable (комнаты + иконки) */
  draggable: THREE.Object3D[]
  /** Материалы стен по elId — для подсветки выбранного без пересборки */
  wallMaterials: Map<string, THREE.MeshStandardMaterial>
}

export function roomPoints(el: Record<string, unknown>): Pt[] | null {
  if (el.type === "rect") {
    const { x, y, width, height } = el as { x: number; y: number; width: number; height: number }
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]
  }
  if (el.type === "polygon") {
    const points = (el as { points?: Pt[] }).points
    return points && points.length >= 3 ? points : null
  }
  return null
}

export function makeLabel(title: string, sub?: string): CSS2DObject {
  const div = document.createElement("div")
  div.style.cssText = "pointer-events:none;text-align:center;font-family:Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,0.9)"
  div.innerHTML = `<div style="font-size:12px;font-weight:700;color:#0f172a">${title}</div>${sub ? `<div style="font-size:10px;color:#475569">${sub}</div>` : ""}`
  return new CSS2DObject(div)
}

function addWall(
  group: THREE.Group,
  p1: Pt,
  p2: Pt,
  height: number,
  material: THREE.MeshStandardMaterial,
  shadows: boolean,
) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, WALL_THICKNESS), material)
  mesh.position.set((p1.x + p2.x) / 2, height / 2, (p1.y + p2.y) / 2)
  mesh.rotation.y = -Math.atan2(dy, dx)
  if (shadows) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  group.add(mesh)
}

/** Лестница из ступенек — заметнее и «симсовее», чем серый куб */
function buildStairs(size: number): THREE.Group {
  const g = new THREE.Group()
  const steps = 5
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6b16e })
  for (let i = 0; i < steps; i++) {
    const stepH = ((i + 1) / steps) * 1.6
    const step = new THREE.Mesh(new THREE.BoxGeometry(size / steps, stepH, size * 0.7), mat)
    step.position.set(-size / 2 + (i + 0.5) * (size / steps), stepH / 2, 0)
    g.add(step)
  }
  return g
}

const ICON_COLORS: Record<string, number> = {
  stairs: 0xf59e0b,
  elevator: 0x8b5cf6,
  toilet: 0x60a5fa,
  kitchen: 0x34d399,
  parking: 0x94a3b8,
}
const ICON_LABELS: Record<string, string> = {
  stairs: "Лестница",
  elevator: "Лифт",
  toilet: "WC",
  kitchen: "Кухня",
  parking: "P",
}

/**
 * Построить группу одного этажа из плана. Группа в локальных координатах плана:
 * пол на y=0, потолок на y=H. Вызывающий сам ставит group.position (уровень этажа).
 */
export function buildFloorGroup(
  layout: FloorLayoutV2,
  spaces: SpaceInfo[],
  opts: BuildFloorOptions = {},
): BuiltFloor {
  const H = opts.ceilingHeight ?? (layout.ceilingHeight && layout.ceilingHeight > 1 ? layout.ceilingHeight : 3)
  const showLabels = opts.labels !== "none"
  const wallScale = opts.wallOpacityScale ?? 1
  const shadows = opts.shadows ?? false
  const flat = opts.flat ?? false

  const root = new THREE.Group()
  const clickable: THREE.Object3D[] = []
  const draggable: THREE.Object3D[] = []
  const wallMaterials = new Map<string, THREE.MeshStandardMaterial>()

  for (const el of layout.elements) {
    const rec = el as unknown as Record<string, unknown>

    // ── Комнаты (rect/polygon): пол по статусу + стены по периметру ──
    const points = roomPoints(rec)
    if (points) {
      const spaceId = rec.spaceId as string | undefined
      const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined
      const common = rec.kind === "common"
      const fill = common ? COMMON_FILL : STATUS_FILL[detectStatus(space)] ?? "#f8fafc"

      const group = new THREE.Group()
      group.userData.elId = el.id
      group.userData.selectable = !!space
      group.userData.draggable = opts.editable === true

      const shape = new THREE.Shape()
      shape.moveTo(points[0].x, -points[0].y)
      for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].y)
      shape.closePath()
      const floorMesh = new THREE.Mesh(
        flat
          ? new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false })
          : new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(fill), side: THREE.DoubleSide }),
      )
      floorMesh.rotation.x = -Math.PI / 2
      floorMesh.position.y = 0.02
      if (shadows) floorMesh.receiveShadow = true
      group.add(floorMesh)

      if (!flat) {
        const wallMat = new THREE.MeshStandardMaterial({
          color: WALL_COLOR,
          transparent: true,
          opacity: (common ? 0.5 : 0.85) * wallScale,
        })
        if (space) wallMaterials.set(el.id, wallMat)
        const wallH = common ? Math.min(H, 1.2) : H
        for (let i = 0; i < points.length; i++) {
          addWall(group, points[i], points[(i + 1) % points.length], wallH, wallMat, shadows)
        }
      } else {
        // Площадка территории: бордюр по периметру
        const curbMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
        for (let i = 0; i < points.length; i++) {
          addWall(group, points[i], points[(i + 1) % points.length], 0.18, curbMat, shadows)
        }
      }

      if (showLabels) {
        const c = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 })
        const title = space ? `Каб. ${space.number}` : (rec.label as string) || (common ? "Общая зона" : "")
        const sub = space ? (space.tenant ? space.tenant.companyName : `${space.area} м² · свободно`) : undefined
        if (title) {
          const label = makeLabel(title, sub)
          label.position.set(c.x, flat ? 0.3 : 0.4, c.y)
          group.add(label)
        }
      }

      root.add(group)
      if (space) clickable.push(group)
      if (opts.editable) draggable.push(group)
      continue
    }

    // ── Отдельно нарисованные стены ──
    if (rec.type === "wall") {
      const w = rec as { x1: number; y1: number; x2: number; y2: number }
      const mat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.9 * wallScale })
      addWall(root, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }, H, mat, shadows)
      continue
    }

    // ── Двери: деревянное полотно ──
    if (rec.type === "door") {
      const d = rec as { x: number; y: number; width: number; rotation?: number }
      const doorH = Math.min(2.05, H - 0.2)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(d.width, doorH, 0.08),
        new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
      )
      mesh.position.set(d.x, doorH / 2, d.y)
      mesh.rotation.y = -((d.rotation ?? 0) * Math.PI) / 180
      if (shadows) mesh.castShadow = true
      root.add(mesh)
      continue
    }

    // ── Окна: стеклянная вставка ──
    if (rec.type === "window") {
      const w = rec as { x: number; y: number; width: number; rotation?: number }
      const sillY = Math.min(1, H * 0.3)
      const winH = Math.max(0.6, Math.min(1.2, H - sillY - 0.6))
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w.width, winH, 0.07),
        new THREE.MeshStandardMaterial({ color: WINDOW_COLOR, transparent: true, opacity: 0.45 }),
      )
      mesh.position.set(w.x, sillY + winH / 2, w.y)
      mesh.rotation.y = -((w.rotation ?? 0) * Math.PI) / 180
      root.add(mesh)
      continue
    }

    // ── Иконки: лестницы/лифты/туалеты/кухни/парковка ──
    if (rec.type === "icon") {
      const ic = rec as { x: number; y: number; size: number; kind: string; label?: string }
      const group = new THREE.Group()
      group.userData.elId = el.id
      group.userData.draggable = opts.editable === true

      if (ic.kind === "stairs") {
        const stairs = buildStairs(ic.size)
        if (shadows) stairs.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true } })
        group.add(stairs)
      } else if (ic.kind === "parking") {
        // Парковочное место: плоская площадка с разметкой
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(ic.size, 0.06, ic.size),
          new THREE.MeshStandardMaterial({ color: 0x64748b }),
        )
        slab.position.y = 0.03
        group.add(slab)
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(ic.size * 0.85, 0.02, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
        )
        line.position.y = 0.07
        group.add(line)
      } else {
        const h = ic.kind === "elevator" ? Math.max(2.2, H - 0.2) : 1
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(ic.size, h, ic.size),
          new THREE.MeshStandardMaterial({
            color: ICON_COLORS[ic.kind] ?? 0x94a3b8,
            transparent: true,
            opacity: 0.75,
          }),
        )
        block.position.y = h / 2
        if (shadows) block.castShadow = true
        group.add(block)
      }

      group.position.set(ic.x, 0, ic.y)
      if (showLabels) {
        const label = makeLabel(ic.label || ICON_LABELS[ic.kind] || ic.kind)
        label.position.set(0, ic.kind === "stairs" ? 1.9 : ic.kind === "parking" ? 0.5 : 1.3, 0)
        group.add(label)
      }
      root.add(group)
      if (opts.editable) draggable.push(group)
    }
  }

  return { group: root, clickable, draggable, wallMaterials }
}

/** Утилизация группы: геометрии и материалы */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const m = o.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  })
}
