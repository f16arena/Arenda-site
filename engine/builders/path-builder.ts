// ADR: Линейные элементы по сплайну (§v4). Дорога/дорожка — плоская лента (CreateRibbon
// из левого/правого рельсов со смещением на полуширину) по земле. Забор — панели+столбы
// вдоль сегментов. Все меши pickable (kind:"path", entityId = id) для выбора/удаления.

import { MeshBuilder, Mesh, Vector3, type Scene, type TransformNode } from "@babylonjs/core"
import type { PathFeature } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

function rails(points: Vec2[], halfW: number): { left: Vector3[]; right: Vector3[] } {
  const left: Vector3[] = []
  const right: Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] ?? points[i]
    const next = points[i + 1] ?? points[i]
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const px = -dy
    const py = dx
    const cx = points[i].x * S
    const cz = points[i].y * S
    left.push(new Vector3(cx + px * halfW, 0, cz + py * halfW))
    right.push(new Vector3(cx - px * halfW, 0, cz - py * halfW))
  }
  return { left, right }
}

export function buildPath(feature: PathFeature, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh[] {
  if (feature.points.length < 2) return []
  const meshes: Mesh[] = []

  if (feature.kind === "fence") {
    const matId = "wood_panel"
    const postH = 1.2
    for (let i = 0; i < feature.points.length - 1; i++) {
      const a = feature.points[i]
      const b = feature.points[i + 1]
      const ax = a.x * S, az = a.y * S, bx = b.x * S, bz = b.y * S
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz) || 0.01
      const panel = MeshBuilder.CreateBox(`fence_${feature.id}_${i}`, { width: len, height: postH * 0.8, depth: 0.06 }, scene)
      panel.position.set((ax + bx) / 2, postH * 0.5, (az + bz) / 2)
      panel.rotation.y = -Math.atan2(dz, dx)
      panel.material = reg.get(matId)
      panel.parent = parent
      panel.receiveShadows = true
      panel.metadata = { kind: "path", entityId: feature.id }
      meshes.push(panel)
    }
    // столбы в вершинах
    for (let i = 0; i < feature.points.length; i++) {
      const p = feature.points[i]
      const post = MeshBuilder.CreateBox(`fpost_${feature.id}_${i}`, { width: 0.12, height: postH, depth: 0.12 }, scene)
      post.position.set(p.x * S, postH / 2, p.y * S)
      post.material = reg.get("concrete")
      post.parent = parent
      post.metadata = { kind: "path", entityId: feature.id }
      meshes.push(post)
    }
    return meshes
  }

  const halfW = (feature.width / 2) * S
  const { left, right } = rails(feature.points, halfW)
  const ribbon = MeshBuilder.CreateRibbon(
    `path_${feature.id}`,
    { pathArray: [left, right], sideOrientation: Mesh.DOUBLESIDE },
    scene,
  )
  ribbon.position.y = 0.04
  ribbon.parent = parent
  ribbon.receiveShadows = true
  ribbon.material = reg.get(feature.kind === "road" ? "asphalt" : "paving")
  ribbon.metadata = { kind: "path", entityId: feature.id }
  meshes.push(ribbon)
  return meshes
}
