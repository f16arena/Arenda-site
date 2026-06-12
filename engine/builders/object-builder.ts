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
