// Геометрия объёмного режима. Собирается из того же плана этажа, что и плоская
// карта (SPEC §2): помещения выдавливаются на высоту потолка, плита этажа —
// отдельной тонкой коробкой. Никакой второй модели здания не существует.
//
// Все комнаты этажа сливаются в одну сетку с вершинными цветами: 1 draw call на
// этаж вместо сотен. Соответствие «треугольник → помещение» держим отдельным
// массивом, чтобы клик по объёму находил помещение.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { Box } from "@/lib/indoor-map/geometry"
import type { RoomView } from "@/lib/indoor-map/model"
import { STATUS_STYLE } from "@/lib/indoor-map/tokens"

export const FLOOR_HEIGHT = 3.4
export const SLAB_HEIGHT = 0.35
export const FLOOR_GAP = 1.1

export type FloorVolume = {
  rooms: THREE.BufferGeometry
  edges: THREE.BufferGeometry
  slab: THREE.BufferGeometry
  /** id помещения для каждого треугольника слитой сетки */
  triangleRoom: string[]
}

const SIDE_DARKEN = 0.86

/**
 * План лежит в метрах на плоскости XY, мир three — XZ с осью Y вверх.
 * Берём точку как (x, −y), чтобы «низ плана» смотрел в +Z: тогда вид сверху
 * совпадает с плоской картой и объект не оказывается зеркальным.
 */
function shapeOf(room: RoomView): THREE.Shape {
  const shape = new THREE.Shape()
  room.points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.y)
    else shape.lineTo(point.x, -point.y)
  })
  shape.closePath()
  return shape
}

function paint(geometry: THREE.BufferGeometry, fill: THREE.Color): void {
  const count = geometry.getAttribute("position").count
  const colors = new Float32Array(count * 3)
  const side = fill.clone().multiplyScalar(SIDE_DARKEN)

  // ExtrudeGeometry кладёт крышки в группу 0, боковые грани — в группу 1.
  // Боковины притемняем: объём читается без единого источника теней.
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]
  for (const group of groups) {
    const color = group.materialIndex === 1 ? side : fill
    const end = Math.min(group.start + group.count, count)
    for (let i = group.start; i < end; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
}

export function buildFloorVolume(rooms: RoomView[], height = FLOOR_HEIGHT): FloorVolume | null {
  const solids: THREE.BufferGeometry[] = []
  const outlines: THREE.BufferGeometry[] = []
  const triangleRoom: string[] = []

  for (const room of rooms) {
    if (room.points.length < 3) continue
    // Общие зоны делаем низкими: коридор не должен загораживать помещения
    const depth = room.status === "COMMON" ? Math.min(0.5, height * 0.15) : height
    const extruded = new THREE.ExtrudeGeometry(shapeOf(room), {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    })
    extruded.rotateX(-Math.PI / 2)
    extruded.computeVertexNormals()
    paint(extruded, new THREE.Color(STATUS_STYLE[room.status].fill))

    const triangles = extruded.getAttribute("position").count / 3
    for (let i = 0; i < triangles; i++) triangleRoom.push(room.id)
    solids.push(extruded)

    const edges = new THREE.EdgesGeometry(extruded, 20)
    outlines.push(edges)
  }

  if (solids.length === 0) return null

  const merged = mergeGeometries(solids, false)
  const mergedEdges = mergeGeometries(outlines, false)
  solids.forEach((geometry) => geometry.dispose())
  outlines.forEach((geometry) => geometry.dispose())
  if (!merged || !mergedEdges) return null

  return {
    rooms: merged,
    edges: mergedEdges,
    slab: new THREE.BufferGeometry(),
    triangleRoom,
  }
}

/** Плита этажа: тонкая коробка по габаритам плана — она и рисует «стопку». */
export function buildSlab(box: Box): THREE.BufferGeometry {
  const width = Math.max(box.maxX - box.minX, 1) + 1.2
  const depth = Math.max(box.maxY - box.minY, 1) + 1.2
  const geometry = new THREE.BoxGeometry(width, SLAB_HEIGHT, depth)
  // Помещения после поворота ложатся в +Z (см. shapeOf), плита обязана туда же
  geometry.translate((box.minX + box.maxX) / 2, -SLAB_HEIGHT / 2, (box.minY + box.maxY) / 2)
  return geometry
}

/** Высота, на которой стоит этаж в стопке. */
export function elevationOf(index: number): number {
  return index * (FLOOR_HEIGHT + FLOOR_GAP)
}
