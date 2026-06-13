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

// Виды забора: сплошная панель (профнастил/3D-сетка/дерево) или штакетник/ковка
// (вертикальные планки + горизонтальные лаги). panelMat/postMat — id материалов.
type FenceCfg = { panelMat: string; postMat: string; height: number; mode: "panel" | "picket"; depth: number; picketW: number }
const FENCE: Record<string, FenceCfg> = {
  profnastil: { panelMat: "metal_roof_green", postMat: "facade_metal_dark", height: 1.9, mode: "panel", depth: 0.04, picketW: 0 },
  mesh: { panelMat: "facade_metal", postMat: "facade_metal_dark", height: 1.7, mode: "panel", depth: 0.02, picketW: 0 },
  wood: { panelMat: "wood_panel", postMat: "concrete", height: 1.2, mode: "panel", depth: 0.06, picketW: 0 },
  shtaketnik: { panelMat: "facade_metal", postMat: "facade_metal_dark", height: 1.6, mode: "picket", depth: 0.04, picketW: 0.06 },
  forged: { panelMat: "facade_metal_dark", postMat: "facade_metal_dark", height: 1.8, mode: "picket", depth: 0.035, picketW: 0.03 },
}

function buildFence(feature: PathFeature, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh[] {
  const cfg = FENCE[feature.style] ?? FENCE.wood
  const meshes: Mesh[] = []
  const panelMat = reg.get(cfg.panelMat)
  const postMat = reg.get(cfg.postMat)
  const add = (m: Mesh) => {
    m.parent = parent
    m.receiveShadows = true
    m.metadata = { kind: "path", entityId: feature.id }
    meshes.push(m)
  }

  for (let i = 0; i < feature.points.length - 1; i++) {
    const a = feature.points[i]
    const b = feature.points[i + 1]
    const ax = a.x * S, az = a.y * S, bx = b.x * S, bz = b.y * S
    const dx = bx - ax, dz = bz - az
    const len = Math.hypot(dx, dz) || 0.01
    const angle = -Math.atan2(dz, dx)
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2

    if (cfg.mode === "panel") {
      const h = feature.style === "wood" ? cfg.height * 0.85 : cfg.height
      const panel = MeshBuilder.CreateBox(`fence_${feature.id}_${i}`, { width: len, height: h, depth: cfg.depth }, scene)
      panel.position.set(midX, h / 2 + 0.05, midZ)
      panel.rotation.y = angle
      panel.material = panelMat
      add(panel)
    } else {
      // горизонтальные лаги (низ и верх)
      for (const ry of [0.3, cfg.height - 0.2]) {
        const rail = MeshBuilder.CreateBox(`frail_${feature.id}_${i}_${Math.round(ry * 100)}`, { width: len, height: 0.05, depth: 0.035 }, scene)
        rail.position.set(midX, ry, midZ)
        rail.rotation.y = angle
        rail.material = panelMat
        add(rail)
      }
      // вертикальные планки/прутья с зазором
      const spacing = 0.13
      const n = Math.max(1, Math.floor(len / spacing))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        const pk = MeshBuilder.CreateBox(`fpck_${feature.id}_${i}_${k}`, { width: cfg.picketW, height: cfg.height, depth: cfg.depth }, scene)
        pk.position.set(ax + dx * t, cfg.height / 2 + 0.05, az + dz * t)
        pk.rotation.y = angle
        pk.material = panelMat
        add(pk)
      }
    }
  }

  // столбы в вершинах
  for (let i = 0; i < feature.points.length; i++) {
    const p = feature.points[i]
    const post = MeshBuilder.CreateBox(`fpost_${feature.id}_${i}`, { width: 0.1, height: cfg.height + 0.15, depth: 0.1 }, scene)
    post.position.set(p.x * S, (cfg.height + 0.15) / 2, p.y * S)
    post.material = postMat
    add(post)
  }
  return meshes
}

export function buildPath(feature: PathFeature, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh[] {
  if (feature.points.length < 2) return []
  if (feature.kind === "fence") return buildFence(feature, parent, scene, reg)

  const meshes: Mesh[] = []
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
