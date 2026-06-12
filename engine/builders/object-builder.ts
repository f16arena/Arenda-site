// ADR: Каталожные объекты Фазы 1 — аккуратные процедурные примитивы (§9.4), GLB-ready
// архитектурно (замена по assetId без правок движка). Возвращает TransformNode с
// метаданными для picking. Материалы простые, кэшируются по цвету в рамках сцены.

import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  type Mesh,
  type Scene,
} from "@babylonjs/core"
import type { BuilderObject } from "@/types/builder"

const S = 0.001

interface SceneWithCache extends Scene {
  __objMatCache?: Map<string, StandardMaterial>
}

function mat(scene: Scene, hex: string): StandardMaterial {
  const s = scene as SceneWithCache
  if (!s.__objMatCache) s.__objMatCache = new Map()
  const cached = s.__objMatCache.get(hex)
  if (cached) return cached
  const m = new StandardMaterial(`om_${hex}`, scene)
  m.diffuseColor = Color3.FromHexString(hex)
  m.specularColor = new Color3(0.05, 0.05, 0.05)
  s.__objMatCache.set(hex, m)
  return m
}

function part(mesh: Mesh, scene: Scene, hex: string): Mesh {
  mesh.material = mat(scene, hex)
  return mesh
}

function buildByAsset(assetId: string, scene: Scene): Mesh[] {
  switch (assetId) {
    case "tree": {
      const trunk = part(MeshBuilder.CreateCylinder("t", { height: 1.4, diameterTop: 0.28, diameterBottom: 0.36 }, scene), scene, "#8B5A2B")
      trunk.position.y = 0.7
      const crown = part(MeshBuilder.CreateSphere("c", { diameter: 2.2, segments: 10 }, scene), scene, "#2E7D32")
      crown.position.y = 2
      return [trunk, crown]
    }
    case "spruce": {
      const trunk = part(MeshBuilder.CreateCylinder("t", { height: 0.8, diameter: 0.3 }, scene), scene, "#6B4423")
      trunk.position.y = 0.4
      const out: Mesh[] = [trunk]
      for (let i = 0; i < 3; i++) {
        const cone = part(MeshBuilder.CreateCylinder("k", { height: 1.2, diameterTop: 0, diameterBottom: 2.2 - i * 0.6 }, scene), scene, "#2F6E3F")
        cone.position.y = 1 + i * 0.9
        out.push(cone)
      }
      return out
    }
    case "lamp": {
      const pole = part(MeshBuilder.CreateCylinder("p", { height: 3.4, diameter: 0.16 }, scene), scene, "#64748B")
      pole.position.y = 1.7
      const head = part(MeshBuilder.CreateSphere("h", { diameter: 0.55, segments: 8 }, scene), scene, "#FDE68A")
      const hm = head.material as StandardMaterial
      hm.emissiveColor = Color3.FromHexString("#FDE68A").scale(0.7)
      head.position.y = 3.5
      return [pole, head]
    }
    case "bench": {
      const seat = part(MeshBuilder.CreateBox("s", { width: 2, height: 0.12, depth: 0.6 }, scene), scene, "#9A6A3A")
      seat.position.y = 0.5
      const back = part(MeshBuilder.CreateBox("b", { width: 2, height: 0.5, depth: 0.1 }, scene), scene, "#9A6A3A")
      back.position.set(0, 0.8, -0.25)
      return [seat, back]
    }
    case "parking": {
      const pad = part(MeshBuilder.CreateBox("p", { width: 2.5, height: 0.05, depth: 5.3 }, scene), scene, "#3F3F46")
      pad.position.y = 0.025
      const l = part(MeshBuilder.CreateBox("l", { width: 0.1, height: 0.06, depth: 5.3 }, scene), scene, "#E5E7EB")
      l.position.set(1.2, 0.04, 0)
      const r = part(MeshBuilder.CreateBox("r", { width: 0.1, height: 0.06, depth: 5.3 }, scene), scene, "#E5E7EB")
      r.position.set(-1.2, 0.04, 0)
      return [pad, l, r]
    }
    case "birch": {
      const trunk = part(MeshBuilder.CreateCylinder("t", { height: 2.4, diameter: 0.26 }, scene), scene, "#F1F5F9")
      trunk.position.y = 1.2
      const crown = part(MeshBuilder.CreateSphere("c", { diameter: 1.9, segments: 9 }, scene), scene, "#86C34A")
      crown.position.y = 2.7
      return [trunk, crown]
    }
    case "bush": {
      const b = part(MeshBuilder.CreateSphere("b", { diameter: 1.4, segments: 8 }, scene), scene, "#3F8F3F")
      b.position.y = 0.55
      b.scaling.y = 0.75
      return [b]
    }
    case "flowerbed": {
      const bed = part(MeshBuilder.CreateBox("bd", { width: 2, height: 0.3, depth: 1.2 }, scene), scene, "#8B5A2B")
      bed.position.y = 0.15
      const colors = ["#EF4444", "#F59E0B", "#EC4899", "#8B5CF6"]
      const out = [bed]
      for (let i = 0; i < 6; i++) {
        const f = part(MeshBuilder.CreateSphere("f", { diameter: 0.32, segments: 6 }, scene), scene, colors[i % colors.length])
        f.position.set(-0.8 + (i % 3) * 0.8, 0.4, -0.3 + Math.floor(i / 3) * 0.6)
        out.push(f)
      }
      return out
    }
    case "bin": {
      const b = part(MeshBuilder.CreateCylinder("b", { height: 0.8, diameterTop: 0.6, diameterBottom: 0.5 }, scene), scene, "#4B5563")
      b.position.y = 0.4
      return [b]
    }
    case "fence": {
      const out: Mesh[] = []
      for (const x of [-1.3, -0.43, 0.43, 1.3]) {
        const post = part(MeshBuilder.CreateBox("p", { width: 0.12, height: 1.2, depth: 0.12 }, scene), scene, "#6B7280")
        post.position.set(x, 0.6, 0)
        out.push(post)
      }
      for (const y of [0.4, 0.95]) {
        const rail = part(MeshBuilder.CreateBox("r", { width: 3, height: 0.1, depth: 0.06 }, scene), scene, "#9CA3AF")
        rail.position.set(0, y, 0)
        out.push(rail)
      }
      return out
    }
    case "gate": {
      const out: Mesh[] = []
      for (const x of [-1.4, 1.4]) {
        const post = part(MeshBuilder.CreateBox("p", { width: 0.25, height: 2.2, depth: 0.25 }, scene), scene, "#475569")
        post.position.set(x, 1.1, 0)
        out.push(post)
      }
      const bar = part(MeshBuilder.CreateBox("b", { width: 3, height: 0.2, depth: 0.2 }, scene), scene, "#64748B")
      bar.position.y = 2.1
      out.push(bar)
      return out
    }
    case "road": {
      const pad = part(MeshBuilder.CreateBox("p", { width: 4, height: 0.05, depth: 8 }, scene), scene, "#52525B")
      pad.position.y = 0.025
      const out = [pad]
      for (let i = 0; i < 4; i++) {
        const dash = part(MeshBuilder.CreateBox("d", { width: 0.18, height: 0.06, depth: 1 }, scene), scene, "#FACC15")
        dash.position.set(0, 0.04, -3 + i * 2)
        out.push(dash)
      }
      return out
    }
    case "path": {
      const pad = part(MeshBuilder.CreateBox("p", { width: 2, height: 0.05, depth: 6 }, scene), scene, "#9CA3AF")
      pad.position.y = 0.03
      return [pad]
    }
    default: {
      const box = part(MeshBuilder.CreateBox("o", { size: 1 }, scene), scene, "#9CA3AF")
      box.position.y = 0.5
      return [box]
    }
  }
}

export function buildObject(obj: BuilderObject, parent: TransformNode, scene: Scene, target: string): TransformNode {
  const root = new TransformNode(`obj_${obj.id}`, scene)
  root.parent = parent
  root.position.set(obj.position.x * S, obj.position.y * S, obj.position.z * S)
  root.rotation.y = (obj.rotationY * Math.PI) / 180
  const sc = obj.scale > 0 ? obj.scale : 1
  root.scaling.set(sc, sc, sc)
  root.metadata = { kind: "object", entityId: obj.id, target }
  for (const m of buildByAsset(obj.assetId, scene)) {
    m.parent = root
    m.metadata = { kind: "object", entityId: obj.id, target }
    m.receiveShadows = true
  }
  return root
}
