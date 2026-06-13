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

// Светящийся материал (для ламп/экранов) — ловится GlowLayer, выглядит «включённым».
function glowMat(scene: Scene, hex: string): StandardMaterial {
  const s = scene as SceneWithCache
  const key = `glow_${hex}`
  if (!s.__objMatCache) s.__objMatCache = new Map()
  const cached = s.__objMatCache.get(key)
  if (cached) return cached
  const m = new StandardMaterial(key, scene)
  m.diffuseColor = Color3.FromHexString(hex)
  m.emissiveColor = Color3.FromHexString(hex)
  m.disableLighting = true
  s.__objMatCache.set(key, m)
  return m
}

function glow(mesh: Mesh, scene: Scene, hex: string): Mesh {
  mesh.material = glowMat(scene, hex)
  return mesh
}

// Набор assetId, которые считаются источниками света (движок добавляет PointLight, лимит).
export const LIGHT_ASSETS = new Set(["lamp", "street_lamp", "ceiling_light", "wall_light", "floor_lamp", "table_lamp", "spot", "led_strip"])

// Полупрозрачная «водная» поверхность с лёгким бликом (без сложного шейдера).
function waterMat(scene: Scene): StandardMaterial {
  const s = scene as SceneWithCache
  if (!s.__objMatCache) s.__objMatCache = new Map()
  const cached = s.__objMatCache.get("__water")
  if (cached) return cached
  const m = new StandardMaterial("waterMat", scene)
  m.diffuseColor = Color3.FromHexString("#2E86C1")
  m.emissiveColor = Color3.FromHexString("#103A5A")
  m.specularColor = new Color3(0.6, 0.7, 0.8)
  m.specularPower = 64
  m.alpha = 0.7
  s.__objMatCache.set("__water", m)
  return m
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

    // ── Мебель ──
    case "sofa": {
      const out: Mesh[] = []
      const base = part(MeshBuilder.CreateBox("b", { width: 2.1, height: 0.4, depth: 0.9 }, scene), scene, "#475569"); base.position.y = 0.3; out.push(base)
      const back = part(MeshBuilder.CreateBox("bk", { width: 2.1, height: 0.55, depth: 0.22 }, scene), scene, "#334155"); back.position.set(0, 0.7, -0.34); out.push(back)
      for (const x of [-1, 1]) { const arm = part(MeshBuilder.CreateBox("a", { width: 0.18, height: 0.5, depth: 0.9 }, scene), scene, "#334155"); arm.position.set(x, 0.45, 0); out.push(arm) }
      return out
    }
    case "armchair": {
      const seat = part(MeshBuilder.CreateBox("s", { width: 0.9, height: 0.4, depth: 0.85 }, scene), scene, "#6366F1"); seat.position.y = 0.3
      const back = part(MeshBuilder.CreateBox("b", { width: 0.9, height: 0.55, depth: 0.2 }, scene), scene, "#4F46E5"); back.position.set(0, 0.65, -0.32)
      return [seat, back]
    }
    case "chair": {
      const seat = part(MeshBuilder.CreateBox("s", { width: 0.45, height: 0.07, depth: 0.45 }, scene), scene, "#94A3B8"); seat.position.y = 0.46
      const back = part(MeshBuilder.CreateBox("b", { width: 0.45, height: 0.5, depth: 0.06 }, scene), scene, "#94A3B8"); back.position.set(0, 0.72, -0.2)
      const out = [seat, back]
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.05, height: 0.46, depth: 0.05 }, scene), scene, "#64748B"); l.position.set(x, 0.23, z); out.push(l) }
      return out
    }
    case "table": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.6, height: 0.08, depth: 0.9 }, scene), scene, "#B98A5A"); top.position.y = 0.75
      const out = [top]
      for (const [x, z] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.08, height: 0.75, depth: 0.08 }, scene), scene, "#6B7280"); l.position.set(x, 0.375, z); out.push(l) }
      return out
    }
    case "coffee_table": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.1, height: 0.06, depth: 0.6 }, scene), scene, "#9A6A3A"); top.position.y = 0.4
      const body = part(MeshBuilder.CreateBox("b", { width: 1, height: 0.4, depth: 0.5 }, scene), scene, "#8B5A2B"); body.position.y = 0.2
      return [top, body]
    }
    case "desk": case "office_desk": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.4, height: 0.06, depth: 0.7 }, scene), scene, "#374151"); top.position.y = 0.74
      const ped = part(MeshBuilder.CreateBox("p", { width: 0.45, height: 0.7, depth: 0.6 }, scene), scene, "#1F2937"); ped.position.set(0.45, 0.37, 0)
      return [top, ped]
    }
    case "meeting_table": {
      const top = part(MeshBuilder.CreateCylinder("t", { height: 0.08, diameter: 2.4, tessellation: 24 }, scene), scene, "#6D4C41"); top.position.y = 0.75
      const leg = part(MeshBuilder.CreateCylinder("l", { height: 0.75, diameter: 0.3 }, scene), scene, "#4B5563"); leg.position.y = 0.375
      return [top, leg]
    }
    case "wardrobe": {
      const b = part(MeshBuilder.CreateBox("b", { width: 1.4, height: 2.2, depth: 0.6 }, scene), scene, "#A1887F"); b.position.y = 1.1
      const ln = part(MeshBuilder.CreateBox("l", { width: 0.04, height: 2.1, depth: 0.62 }, scene), scene, "#6B7280"); ln.position.y = 1.1
      return [b, ln]
    }
    case "shelf": case "rack": {
      const out: Mesh[] = []
      for (const y of [0.3, 0.9, 1.5, 2.1]) { const sh = part(MeshBuilder.CreateBox("s", { width: 1.4, height: 0.06, depth: 0.4 }, scene), scene, "#9A6A3A"); sh.position.y = y; out.push(sh) }
      for (const x of [-0.68, 0.68]) { const sd = part(MeshBuilder.CreateBox("d", { width: 0.06, height: 2.1, depth: 0.4 }, scene), scene, "#8B5A2B"); sd.position.set(x, 1.05, 0); out.push(sd) }
      return out
    }
    case "bed": {
      const base = part(MeshBuilder.CreateBox("b", { width: 1.7, height: 0.4, depth: 2.1 }, scene), scene, "#64748B"); base.position.y = 0.25
      const mat2 = part(MeshBuilder.CreateBox("m", { width: 1.6, height: 0.25, depth: 2 }, scene), scene, "#E2E8F0"); mat2.position.y = 0.55
      const hb = part(MeshBuilder.CreateBox("h", { width: 1.7, height: 0.7, depth: 0.15 }, scene), scene, "#475569"); hb.position.set(0, 0.6, -1.05)
      return [base, mat2, hb]
    }
    case "reception": case "reception2": {
      const desk = part(MeshBuilder.CreateBox("d", { width: 2.6, height: 1.1, depth: 0.7 }, scene), scene, "#6D4C41"); desk.position.y = 0.55
      const top = part(MeshBuilder.CreateBox("t", { width: 2.8, height: 0.1, depth: 0.4 }, scene), scene, "#D6D3D1"); top.position.set(0, 1.15, 0.2)
      return [desk, top]
    }
    case "bar_counter": case "bar": {
      const body = part(MeshBuilder.CreateBox("b", { width: 2.4, height: 1.1, depth: 0.6 }, scene), scene, "#3F3F46"); body.position.y = 0.55
      const top = part(MeshBuilder.CreateBox("t", { width: 2.6, height: 0.08, depth: 0.7 }, scene), scene, "#9A6A3A"); top.position.y = 1.12
      return [body, top]
    }
    case "display_case": {
      const base2 = part(MeshBuilder.CreateBox("b", { width: 1.5, height: 0.9, depth: 0.6 }, scene), scene, "#1F2937"); base2.position.y = 0.45
      const g = part(MeshBuilder.CreateBox("g", { width: 1.5, height: 0.8, depth: 0.6 }, scene), scene, "#9FD3F0"); g.position.y = 1.3; const gm = g.material as StandardMaterial; gm.alpha = 0.35
      return [base2, g]
    }

    // ── Техника / экраны ──
    case "tv": case "monitor": {
      const w = assetId === "tv" ? 1.4 : 0.6
      const frame = part(MeshBuilder.CreateBox("f", { width: w, height: w * 0.6, depth: 0.06 }, scene), scene, "#0B0F19"); frame.position.y = assetId === "tv" ? 1.4 : 0.95
      const screen = glow(MeshBuilder.CreateBox("s", { width: w - 0.08, height: w * 0.6 - 0.08, depth: 0.02 }, scene), scene, "#1E3A8A"); screen.position.set(0, frame.position.y, 0.04)
      return [frame, screen]
    }
    case "pc": case "pc_rgb": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.22, height: 0.45, depth: 0.45 }, scene), scene, "#111827"); body.position.y = 0.225
      const strip = glow(MeshBuilder.CreateBox("s", { width: 0.02, height: 0.4, depth: 0.02 }, scene), scene, assetId === "pc_rgb" ? "#A78BFA" : "#38BDF8"); strip.position.set(0.12, 0.225, 0.2)
      return [body, strip]
    }
    case "printer": case "microwave": case "cashbox": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.5, height: 0.35, depth: 0.45 }, scene), scene, "#374151"); b.position.y = assetId === "cashbox" ? 0.92 : 0.18
      return [b]
    }
    case "fridge": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 1.9, depth: 0.7 }, scene), scene, "#E5E7EB"); b.position.y = 0.95
      const h = part(MeshBuilder.CreateBox("h", { width: 0.05, height: 1.7, depth: 0.04 }, scene), scene, "#9CA3AF"); h.position.set(0.3, 0.95, 0.36)
      return [b, h]
    }
    case "ac": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.9, height: 0.3, depth: 0.22 }, scene), scene, "#F8FAFC"); b.position.y = 2.6
      return [b]
    }
    case "projector": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.4, height: 0.18, depth: 0.3 }, scene), scene, "#1F2937"); b.position.y = 2.7
      return [b]
    }

    // ── Свет (светятся через GlowLayer) ──
    case "ceiling_light": {
      const base3 = part(MeshBuilder.CreateCylinder("b", { height: 0.1, diameter: 0.5 }, scene), scene, "#9CA3AF"); base3.position.y = 2.85
      const bulb = glow(MeshBuilder.CreateSphere("g", { diameter: 0.4, segments: 10 }, scene), scene, "#FFF3C4"); bulb.position.y = 2.6
      return [base3, bulb]
    }
    case "wall_light": {
      const arm = part(MeshBuilder.CreateBox("a", { width: 0.1, height: 0.1, depth: 0.2 }, scene), scene, "#64748B"); arm.position.y = 2
      const bulb = glow(MeshBuilder.CreateSphere("g", { diameter: 0.22, segments: 8 }, scene), scene, "#FDE68A"); bulb.position.set(0, 2, 0.18)
      return [arm, bulb]
    }
    case "floor_lamp": {
      const pole = part(MeshBuilder.CreateCylinder("p", { height: 1.6, diameter: 0.06 }, scene), scene, "#475569"); pole.position.y = 0.8
      const shade = glow(MeshBuilder.CreateCylinder("s", { height: 0.4, diameterTop: 0.4, diameterBottom: 0.5 }, scene), scene, "#FFF3C4"); shade.position.y = 1.7
      return [pole, shade]
    }
    case "table_lamp": {
      const base4 = part(MeshBuilder.CreateCylinder("b", { height: 0.3, diameter: 0.1 }, scene), scene, "#475569"); base4.position.y = 0.15
      const shade = glow(MeshBuilder.CreateCylinder("s", { height: 0.25, diameterTop: 0.25, diameterBottom: 0.32 }, scene), scene, "#FFF3C4"); shade.position.y = 0.42
      return [base4, shade]
    }
    case "spot": {
      const bulb = glow(MeshBuilder.CreateCylinder("g", { height: 0.08, diameter: 0.16 }, scene), scene, "#FFFFFF"); bulb.position.y = 2.9
      return [bulb]
    }
    case "led_strip": {
      const s2 = glow(MeshBuilder.CreateBox("s", { width: 2, height: 0.04, depth: 0.04 }, scene), scene, "#A78BFA"); s2.position.y = 2.7
      return [s2]
    }
    case "street_lamp": {
      const pole = part(MeshBuilder.CreateCylinder("p", { height: 3.4, diameter: 0.16 }, scene), scene, "#64748B"); pole.position.y = 1.7
      const head = glow(MeshBuilder.CreateSphere("h", { diameter: 0.55, segments: 8 }, scene), scene, "#FDE68A"); head.position.y = 3.5
      return [pole, head]
    }

    // ── Декор ──
    case "painting": case "poster": {
      const f = part(MeshBuilder.CreateBox("f", { width: 0.9, height: 0.7, depth: 0.04 }, scene), scene, "#0B0F19"); f.position.y = 1.6
      const c = part(MeshBuilder.CreateBox("c", { width: 0.82, height: 0.62, depth: 0.02 }, scene), scene, assetId === "poster" ? "#38BDF8" : "#D6A35C"); c.position.set(0, 1.6, 0.03)
      return [f, c]
    }
    case "mirror": {
      const f = part(MeshBuilder.CreateBox("f", { width: 0.7, height: 1.4, depth: 0.05 }, scene), scene, "#9CA3AF"); f.position.y = 1.4
      const g = glow(MeshBuilder.CreateBox("g", { width: 0.62, height: 1.32, depth: 0.02 }, scene), scene, "#CBD5E1"); g.position.set(0, 1.4, 0.03); const gm = g.material as StandardMaterial; gm.emissiveColor = Color3.FromHexString("#475569")
      return [f, g]
    }
    case "clock": {
      const c = part(MeshBuilder.CreateCylinder("c", { height: 0.06, diameter: 0.4, tessellation: 20 }, scene), scene, "#E5E7EB"); c.rotation.x = Math.PI / 2; c.position.y = 2
      return [c]
    }
    case "plant_pot": case "plant": {
      const pot = part(MeshBuilder.CreateCylinder("p", { height: 0.35, diameterTop: 0.4, diameterBottom: 0.3 }, scene), scene, "#92400E"); pot.position.y = 0.175
      const leaves = part(MeshBuilder.CreateSphere("l", { diameter: 0.8, segments: 8 }, scene), scene, "#2E7D32"); leaves.position.y = 0.75; leaves.scaling.y = 1.4
      return [pot, leaves]
    }
    case "vase": {
      const v = part(MeshBuilder.CreateCylinder("v", { height: 0.5, diameterTop: 0.18, diameterBottom: 0.28 }, scene), scene, "#0EA5E9"); v.position.y = 0.25
      return [v]
    }
    case "rug": {
      const r = part(MeshBuilder.CreateBox("r", { width: 2.4, height: 0.03, depth: 1.6 }, scene), scene, "#7C3AED"); r.position.y = 0.02
      return [r]
    }
    case "curtain": {
      const c = part(MeshBuilder.CreateBox("c", { width: 1.6, height: 2.4, depth: 0.08 }, scene), scene, "#E2E8F0"); c.position.y = 1.4
      return [c]
    }

    // ── Гейминг ──
    case "gaming_desk": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.4, height: 0.06, depth: 0.7 }, scene), scene, "#0B0F19"); top.position.y = 0.74
      const strip = glow(MeshBuilder.CreateBox("s", { width: 1.4, height: 0.03, depth: 0.03 }, scene), scene, "#A78BFA"); strip.position.set(0, 0.7, 0.34)
      for (const x of [-0.65, 0.65]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.06, height: 0.74, depth: 0.6 }, scene), scene, "#111827"); l.position.set(x, 0.37, 0) ; top.addChild(l) }
      return [top, strip]
    }
    case "gaming_chair": {
      const seat = part(MeshBuilder.CreateBox("s", { width: 0.55, height: 0.1, depth: 0.55 }, scene), scene, "#111827"); seat.position.y = 0.5
      const back = part(MeshBuilder.CreateBox("b", { width: 0.55, height: 0.9, depth: 0.12 }, scene), scene, "#7C3AED"); back.position.set(0, 0.95, -0.24)
      const base5 = part(MeshBuilder.CreateCylinder("p", { height: 0.45, diameter: 0.1 }, scene), scene, "#1F2937"); base5.position.y = 0.25
      return [seat, back, base5]
    }
    case "monitor_triple": {
      const out: Mesh[] = []
      for (let i = -1; i <= 1; i++) { const m = glow(MeshBuilder.CreateBox("m", { width: 0.6, height: 0.36, depth: 0.04 }, scene), scene, "#1E3A8A"); m.position.set(i * 0.62, 1.05, 0); m.rotation.y = -i * 0.25; out.push(m) }
      return out
    }
    case "console_zone": {
      const sofa2 = part(MeshBuilder.CreateBox("s", { width: 1.6, height: 0.4, depth: 0.8 }, scene), scene, "#334155"); sofa2.position.y = 0.3
      const tv2 = glow(MeshBuilder.CreateBox("t", { width: 1.2, height: 0.7, depth: 0.05 }, scene), scene, "#1E3A8A"); tv2.position.set(0, 1.2, -1.2)
      return [sofa2, tv2]
    }

    // ── Кафе / коммерция ──
    case "cafe_table": {
      const top = part(MeshBuilder.CreateCylinder("t", { height: 0.06, diameter: 0.7, tessellation: 20 }, scene), scene, "#9A6A3A"); top.position.y = 0.74
      const leg = part(MeshBuilder.CreateCylinder("l", { height: 0.74, diameter: 0.1 }, scene), scene, "#4B5563"); leg.position.y = 0.37
      return [top, leg]
    }
    case "cafe_chair": case "bar_stool": {
      const h = assetId === "bar_stool" ? 0.75 : 0.46
      const seat = part(MeshBuilder.CreateCylinder("s", { height: 0.07, diameter: 0.4, tessellation: 16 }, scene), scene, "#6B7280"); seat.position.y = h
      const leg = part(MeshBuilder.CreateCylinder("l", { height: h, diameter: 0.06 }, scene), scene, "#4B5563"); leg.position.y = h / 2
      return [seat, leg]
    }
    case "coffee_machine": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.4, height: 0.5, depth: 0.4 }, scene), scene, "#1F2937"); b.position.y = 1.15
      return [b]
    }
    case "menu_board": {
      const b = glow(MeshBuilder.CreateBox("b", { width: 1.2, height: 0.7, depth: 0.05 }, scene), scene, "#0F172A"); b.position.y = 2.2
      return [b]
    }

    // ── Вода ──
    case "pond": {
      const rim = part(MeshBuilder.CreateCylinder("r", { height: 0.3, diameter: 6.4, tessellation: 28 }, scene), scene, "#6B7280"); rim.position.y = 0.15
      const water = MeshBuilder.CreateCylinder("w", { height: 0.22, diameter: 6, tessellation: 28 }, scene); water.material = waterMat(scene); water.position.y = 0.18
      return [rim, water]
    }
    case "pool": {
      const rim = part(MeshBuilder.CreateBox("r", { width: 6.4, height: 0.3, depth: 3.4 }, scene), scene, "#E2E8F0"); rim.position.y = 0.15
      const water = MeshBuilder.CreateBox("w", { width: 6, height: 0.22, depth: 3 }, scene); water.material = waterMat(scene); water.position.y = 0.18
      return [rim, water]
    }
    case "fountain": {
      const basin = part(MeshBuilder.CreateCylinder("b", { height: 0.5, diameter: 3.2, tessellation: 24 }, scene), scene, "#9CA3AF"); basin.position.y = 0.25
      const water = MeshBuilder.CreateCylinder("w", { height: 0.32, diameter: 2.8, tessellation: 24 }, scene); water.material = waterMat(scene); water.position.y = 0.34
      const jet = MeshBuilder.CreateCylinder("j", { height: 1.4, diameter: 0.2, tessellation: 10 }, scene); jet.material = waterMat(scene); jet.position.y = 1.1
      return [basin, water, jet]
    }
    case "water_strip": {
      const water = MeshBuilder.CreateBox("w", { width: 3, height: 0.2, depth: 8 }, scene); water.material = waterMat(scene); water.position.y = 0.1
      return [water]
    }

    // ── Стройка / архитектура ──
    case "column_round": {
      const base = part(MeshBuilder.CreateCylinder("b", { height: 0.18, diameter: 0.7, tessellation: 24 }, scene), scene, "#CBD5E1"); base.position.y = 0.09
      const shaft = part(MeshBuilder.CreateCylinder("s", { height: 3, diameter: 0.5, tessellation: 24 }, scene), scene, "#E2E8F0"); shaft.position.y = 1.68
      const cap = part(MeshBuilder.CreateCylinder("c", { height: 0.18, diameter: 0.7, tessellation: 24 }, scene), scene, "#CBD5E1"); cap.position.y = 3.27
      return [base, shaft, cap]
    }
    case "column_square": {
      const base = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 0.18, depth: 0.7 }, scene), scene, "#CBD5E1"); base.position.y = 0.09
      const shaft = part(MeshBuilder.CreateBox("s", { width: 0.5, height: 3, depth: 0.5 }, scene), scene, "#E2E8F0"); shaft.position.y = 1.68
      const cap = part(MeshBuilder.CreateBox("c", { width: 0.7, height: 0.18, depth: 0.7 }, scene), scene, "#CBD5E1"); cap.position.y = 3.27
      return [base, shaft, cap]
    }
    case "arch": {
      const out: Mesh[] = []
      for (const x of [-1.2, 1.2]) { const leg = part(MeshBuilder.CreateBox("l", { width: 0.4, height: 2.6, depth: 0.4 }, scene), scene, "#D6D3D1"); leg.position.set(x, 1.3, 0); out.push(leg) }
      // имитация дуги ступенями из боксов сверху
      const steps: Array<[number, number, number]> = [[-1, 2.7, 0.6], [-0.55, 2.9, 0.7], [0, 3, 0.9], [0.55, 2.9, 0.7], [1, 2.7, 0.6]]
      for (const [x, y, w] of steps) { const st = part(MeshBuilder.CreateBox("a", { width: w, height: 0.3, depth: 0.4 }, scene), scene, "#D6D3D1"); st.position.set(x, y, 0); out.push(st) }
      return out
    }
    case "balcony": {
      const slab = part(MeshBuilder.CreateBox("s", { width: 2.5, height: 0.2, depth: 1.2 }, scene), scene, "#D6D3D1"); slab.position.y = 0.1
      const out: Mesh[] = [slab]
      const railH = 1
      const handHex = "#94A3B8"
      // поручни по 3 сторонам (фронт + 2 боковины), стена сзади
      const handF = part(MeshBuilder.CreateBox("hf", { width: 2.5, height: 0.06, depth: 0.06 }, scene), scene, handHex); handF.position.set(0, railH, 0.57); out.push(handF)
      for (const x of [-1.22, 1.22]) { const handS = part(MeshBuilder.CreateBox("hs", { width: 0.06, height: 0.06, depth: 1.2 }, scene), scene, handHex); handS.position.set(x, railH, 0); out.push(handS) }
      for (let i = 0; i < 7; i++) { const x = -1.05 + i * 0.35; const post = part(MeshBuilder.CreateBox("p", { width: 0.04, height: railH, depth: 0.04 }, scene), scene, handHex); post.position.set(x, 0.6, 0.57); out.push(post) }
      for (const x of [-1.22, 1.22]) for (const z of [-0.45, 0, 0.45]) { const post = part(MeshBuilder.CreateBox("p", { width: 0.04, height: railH, depth: 0.04 }, scene), scene, handHex); post.position.set(x, 0.6, z); out.push(post) }
      return out
    }
    case "terrace": {
      const deck = part(MeshBuilder.CreateBox("d", { width: 4, height: 0.12, depth: 3 }, scene), scene, "#A47148"); deck.position.y = 0.36
      const out: Mesh[] = [deck]
      for (const x of [-1.7, 1.7]) for (const z of [-1.2, 1.2]) { const leg = part(MeshBuilder.CreateBox("l", { width: 0.18, height: 0.3, depth: 0.18 }, scene), scene, "#6B4423"); leg.position.set(x, 0.15, z); out.push(leg) }
      return out
    }
    case "awning": case "canopy": {
      const out: Mesh[] = []
      for (const x of [-1.4, 1.4]) for (const z of [-0.9, 0.9]) { const post = part(MeshBuilder.CreateBox("p", { width: 0.1, height: 2.4, depth: 0.1 }, scene), scene, "#64748B"); post.position.set(x, 1.2, z); out.push(post) }
      const roof = part(MeshBuilder.CreateBox("r", { width: 3.2, height: 0.06, depth: 2.2 }, scene), scene, "#EF6C57"); roof.position.set(0, 2.5, 0); roof.rotation.x = -0.12
      const rm = roof.material as StandardMaterial; rm.alpha = 0.6
      out.push(roof)
      return out
    }
    case "railing": {
      const out: Mesh[] = []
      const hand = part(MeshBuilder.CreateBox("h", { width: 2, height: 0.06, depth: 0.06 }, scene), scene, "#94A3B8"); hand.position.y = 1; out.push(hand)
      for (let i = 0; i < 9; i++) { const x = -0.9 + i * 0.225; const bal = part(MeshBuilder.CreateBox("b", { width: 0.04, height: 1, depth: 0.04 }, scene), scene, "#9CA3AF"); bal.position.set(x, 0.5, 0); out.push(bal) }
      return out
    }

    // ── Мебель ──
    case "bookshelf": {
      const out: Mesh[] = []
      for (const x of [-0.78, 0.78]) { const sd = part(MeshBuilder.CreateBox("d", { width: 0.06, height: 2.1, depth: 0.4 }, scene), scene, "#8B5A2B"); sd.position.set(x, 1.05, 0); out.push(sd) }
      const shelfY = [0.2, 0.7, 1.2, 1.7, 2.05]
      for (const y of shelfY) { const sh = part(MeshBuilder.CreateBox("s", { width: 1.6, height: 0.05, depth: 0.4 }, scene), scene, "#9A6A3A"); sh.position.y = y; out.push(sh) }
      const spineColors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"]
      for (let r = 0; r < 4; r++) {
        const rowY = shelfY[r] + 0.26
        for (let i = 0; i < 12; i++) { const book = part(MeshBuilder.CreateBox("bk", { width: 0.1, height: 0.42, depth: 0.32 }, scene), scene, spineColors[(r + i) % spineColors.length]); book.position.set(-0.66 + i * 0.12, rowY, 0); out.push(book) }
      }
      return out
    }
    case "filing_cabinet": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.5, height: 1.3, depth: 0.6 }, scene), scene, "#6B7280"); body.position.y = 0.65
      const out: Mesh[] = [body]
      for (let i = 0; i < 3; i++) { const y = 0.32 + i * 0.42; const handle = part(MeshBuilder.CreateBox("h", { width: 0.2, height: 0.04, depth: 0.04 }, scene), scene, "#374151"); handle.position.set(0, y, 0.31); out.push(handle); const seam = part(MeshBuilder.CreateBox("s", { width: 0.46, height: 0.015, depth: 0.01 }, scene), scene, "#4B5563"); seam.position.set(0, y + 0.18, 0.305); out.push(seam) }
      return out
    }
    case "whiteboard": {
      const frame = part(MeshBuilder.CreateBox("f", { width: 1.7, height: 1.1, depth: 0.04 }, scene), scene, "#94A3B8"); frame.position.y = 1.5
      const board = part(MeshBuilder.CreateBox("b", { width: 1.6, height: 1, depth: 0.05 }, scene), scene, "#FFFFFF"); board.position.set(0, 1.5, 0.02)
      const tray = part(MeshBuilder.CreateBox("t", { width: 1.6, height: 0.04, depth: 0.1 }, scene), scene, "#CBD5E1"); tray.position.set(0, 0.97, 0.06)
      return [frame, board, tray]
    }

    // ── Техника / экраны ──
    case "server_rack": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.6, height: 2, depth: 0.9 }, scene), scene, "#18181B"); body.position.y = 1
      const out: Mesh[] = [body]
      const ledColors = ["#22C55E", "#22C55E", "#3B82F6", "#22C55E", "#3B82F6", "#22C55E", "#22C55E", "#3B82F6"]
      for (let i = 0; i < 8; i++) { const led = glow(MeshBuilder.CreateBox("g", { width: 0.05, height: 0.04, depth: 0.02 }, scene), scene, ledColors[i]); led.position.set(-0.2, 0.35 + i * 0.2, 0.46); out.push(led) }
      for (let i = 0; i < 8; i++) { const slot = part(MeshBuilder.CreateBox("s", { width: 0.5, height: 0.02, depth: 0.01 }, scene), scene, "#3F3F46"); slot.position.set(0.05, 0.42 + i * 0.2, 0.455); out.push(slot) }
      return out
    }
    case "vending": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.9, height: 1.9, depth: 0.8 }, scene), scene, "#B91C1C"); body.position.y = 0.95
      const glass = glow(MeshBuilder.CreateBox("g", { width: 0.62, height: 1.4, depth: 0.02 }, scene), scene, "#7DD3FC"); glass.position.set(-0.1, 1.05, 0.41); const gm = glass.material as StandardMaterial; gm.alpha = 0.8
      const panel = glow(MeshBuilder.CreateBox("p", { width: 0.2, height: 0.4, depth: 0.02 }, scene), scene, "#34D399"); panel.position.set(0.28, 1.2, 0.41)
      return [body, glass, panel]
    }
    case "atm": case "kiosk": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 1.7, depth: 0.6 }, scene), scene, "#1F2937"); body.position.y = 0.85
      const screen = glow(MeshBuilder.CreateBox("s", { width: 0.5, height: 0.4, depth: 0.02 }, scene), scene, "#1E40AF"); screen.position.set(0, 1.3, 0.31); screen.rotation.x = -0.2
      const slot = part(MeshBuilder.CreateBox("k", { width: 0.3, height: 0.03, depth: 0.03 }, scene), scene, "#0F172A"); slot.position.set(0, 0.95, 0.31)
      return [body, screen, slot]
    }
    case "turnstile": {
      const post = part(MeshBuilder.CreateBox("p", { width: 0.3, height: 1, depth: 0.6 }, scene), scene, "#475569"); post.position.y = 0.5
      const hub = part(MeshBuilder.CreateCylinder("h", { height: 0.15, diameter: 0.25, tessellation: 16 }, scene), scene, "#334155"); hub.position.y = 1.05
      const out: Mesh[] = [post, hub]
      for (let i = 0; i < 3; i++) { const arm = part(MeshBuilder.CreateBox("a", { width: 0.7, height: 0.05, depth: 0.05 }, scene), scene, "#94A3B8"); arm.position.set(0, 1.05, 0); arm.rotation.y = (i * 2 * Math.PI) / 3; out.push(arm) }
      return out
    }

    // ── Природа ──
    case "plant_big": {
      const pot = part(MeshBuilder.CreateCylinder("p", { height: 0.6, diameterTop: 0.7, diameterBottom: 0.5, tessellation: 20 }, scene), scene, "#92400E"); pot.position.y = 0.3
      const crown = part(MeshBuilder.CreateSphere("c", { diameter: 1.6, segments: 10 }, scene), scene, "#2E7D32"); crown.position.y = 1.5; crown.scaling.y = 1.3
      const trunk = part(MeshBuilder.CreateCylinder("t", { height: 0.5, diameter: 0.12 }, scene), scene, "#6B4423"); trunk.position.y = 0.85
      return [pot, trunk, crown]
    }

    // ── Мебель (новые) ──
    case "dining_table": {
      const top = part(MeshBuilder.CreateBox("t", { width: 2.2, height: 0.08, depth: 1 }, scene), scene, "#9A6A3A"); top.position.y = 0.75
      const out: Mesh[] = [top]
      for (const [x, z] of [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.1, height: 0.75, depth: 0.1 }, scene), scene, "#6B4423"); l.position.set(x, 0.375, z); out.push(l) }
      for (const [x, z] of [[-0.7, 0.65], [0, 0.65], [0.7, 0.65], [-0.7, -0.65], [0, -0.65], [0.7, -0.65]]) { const seat = part(MeshBuilder.CreateBox("s", { width: 0.4, height: 0.06, depth: 0.4 }, scene), scene, "#94A3B8"); seat.position.set(x, 0.46, z); out.push(seat) }
      return out
    }
    case "stool": {
      const seat = part(MeshBuilder.CreateCylinder("s", { height: 0.06, diameter: 0.36, tessellation: 16 }, scene), scene, "#9A6A3A"); seat.position.y = 0.46
      const out: Mesh[] = [seat]
      for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.04, height: 0.46, depth: 0.04 }, scene), scene, "#6B4423"); l.position.set(x, 0.23, z); out.push(l) }
      return out
    }
    case "lounge_chair": {
      const seat = part(MeshBuilder.CreateBox("s", { width: 0.95, height: 0.32, depth: 1 }, scene), scene, "#0D9488"); seat.position.y = 0.32
      const back = part(MeshBuilder.CreateBox("b", { width: 0.95, height: 0.7, depth: 0.18 }, scene), scene, "#0F766E"); back.position.set(0, 0.6, -0.4); back.rotation.x = -0.25
      const out: Mesh[] = [seat, back]
      for (const x of [-0.52, 0.52]) { const arm = part(MeshBuilder.CreateBox("a", { width: 0.12, height: 0.32, depth: 1 }, scene), scene, "#0F766E"); arm.position.set(x, 0.56, 0); out.push(arm) }
      return out
    }
    case "ottoman": {
      const b = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 0.35, depth: 0.7 }, scene), scene, "#C2703D"); b.position.y = 0.175
      const top = part(MeshBuilder.CreateBox("t", { width: 0.72, height: 0.08, depth: 0.72 }, scene), scene, "#D98A5A"); top.position.y = 0.39
      return [b, top]
    }
    case "sideboard": {
      const body = part(MeshBuilder.CreateBox("b", { width: 1.8, height: 0.75, depth: 0.5 }, scene), scene, "#8B5A2B"); body.position.y = 0.4
      const top = part(MeshBuilder.CreateBox("t", { width: 1.86, height: 0.05, depth: 0.54 }, scene), scene, "#A1887F"); top.position.y = 0.8
      const out: Mesh[] = [body, top]
      for (const x of [-0.45, 0.45]) { const door = part(MeshBuilder.CreateBox("d", { width: 0.84, height: 0.62, depth: 0.02 }, scene), scene, "#9A6A3A"); door.position.set(x, 0.42, 0.26); out.push(door); const h = part(MeshBuilder.CreateBox("h", { width: 0.04, height: 0.12, depth: 0.04 }, scene), scene, "#374151"); h.position.set(x + (x < 0 ? 0.35 : -0.35), 0.42, 0.28); out.push(h) }
      return out
    }
    case "tv_stand": {
      const body = part(MeshBuilder.CreateBox("b", { width: 1.6, height: 0.45, depth: 0.45 }, scene), scene, "#1F2937"); body.position.y = 0.225
      const top = part(MeshBuilder.CreateBox("t", { width: 1.66, height: 0.04, depth: 0.5 }, scene), scene, "#374151"); top.position.y = 0.47
      const shelf = part(MeshBuilder.CreateBox("s", { width: 1.5, height: 0.03, depth: 0.4 }, scene), scene, "#374151"); shelf.position.y = 0.22
      return [body, top, shelf]
    }
    case "nightstand": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.5, height: 0.5, depth: 0.45 }, scene), scene, "#A1887F"); body.position.y = 0.25
      const drawer = part(MeshBuilder.CreateBox("d", { width: 0.44, height: 0.18, depth: 0.02 }, scene), scene, "#8B5A2B"); drawer.position.set(0, 0.32, 0.23)
      const h = part(MeshBuilder.CreateBox("h", { width: 0.12, height: 0.03, depth: 0.03 }, scene), scene, "#374151"); h.position.set(0, 0.32, 0.25)
      return [body, drawer, h]
    }
    case "locker": {
      const out: Mesh[] = []
      const body = part(MeshBuilder.CreateBox("b", { width: 1.2, height: 1.8, depth: 0.5 }, scene), scene, "#4B5563"); body.position.y = 0.9; out.push(body)
      for (const x of [-0.4, 0, 0.4]) { const door = part(MeshBuilder.CreateBox("d", { width: 0.36, height: 1.72, depth: 0.02 }, scene), scene, "#64748B"); door.position.set(x, 0.9, 0.26); out.push(door); const handle = part(MeshBuilder.CreateBox("h", { width: 0.04, height: 0.12, depth: 0.04 }, scene), scene, "#1F2937"); handle.position.set(x + 0.13, 1, 0.28); out.push(handle); const vent = glow(MeshBuilder.CreateBox("v", { width: 0.2, height: 0.04, depth: 0.01 }, scene), scene, "#22C55E"); vent.position.set(x, 1.55, 0.28); out.push(vent) }
      return out
    }
    case "coat_rack": {
      const pole = part(MeshBuilder.CreateCylinder("p", { height: 1.8, diameter: 0.06 }, scene), scene, "#6B4423"); pole.position.y = 0.9
      const base = part(MeshBuilder.CreateCylinder("b", { height: 0.06, diameter: 0.5, tessellation: 20 }, scene), scene, "#4B5563"); base.position.y = 0.03
      const out: Mesh[] = [pole, base]
      for (let i = 0; i < 4; i++) { const hook = part(MeshBuilder.CreateBox("h", { width: 0.04, height: 0.04, depth: 0.18 }, scene), scene, "#8B5A2B"); hook.position.set(0, 1.7, 0); hook.rotation.y = (i * Math.PI) / 2; hook.position.z = 0.09; hook.position.x = 0; out.push(hook) }
      return out
    }

    // ── Кафе / кухня (новые) ──
    case "kitchen_counter": {
      const body = part(MeshBuilder.CreateBox("b", { width: 2, height: 0.85, depth: 0.6 }, scene), scene, "#E5E7EB"); body.position.y = 0.425
      const top = part(MeshBuilder.CreateBox("t", { width: 2.06, height: 0.06, depth: 0.66 }, scene), scene, "#475569"); top.position.y = 0.88
      const out: Mesh[] = [body, top]
      for (const x of [-0.5, 0.5]) { const door = part(MeshBuilder.CreateBox("d", { width: 0.9, height: 0.7, depth: 0.02 }, scene), scene, "#CBD5E1"); door.position.set(x, 0.45, 0.31); out.push(door) }
      return out
    }
    case "stove": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 0.85, depth: 0.6 }, scene), scene, "#1F2937"); body.position.y = 0.425
      const top = part(MeshBuilder.CreateBox("t", { width: 0.72, height: 0.04, depth: 0.62 }, scene), scene, "#0F172A"); top.position.y = 0.87
      const out: Mesh[] = [body, top]
      for (const [x, z] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) { const burner = part(MeshBuilder.CreateCylinder("k", { height: 0.02, diameter: 0.22, tessellation: 18 }, scene), scene, "#374151"); burner.position.set(x, 0.9, z); out.push(burner) }
      const oven = glow(MeshBuilder.CreateBox("o", { width: 0.56, height: 0.4, depth: 0.02 }, scene), scene, "#F97316"); oven.position.set(0, 0.4, 0.31); const om = oven.material as StandardMaterial; om.alpha = 0.7; out.push(oven)
      return out
    }
    case "dishwasher": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.6, height: 0.85, depth: 0.6 }, scene), scene, "#CBD5E1"); body.position.y = 0.425
      const door = part(MeshBuilder.CreateBox("d", { width: 0.56, height: 0.78, depth: 0.03 }, scene), scene, "#94A3B8"); door.position.set(0, 0.42, 0.31)
      const handle = part(MeshBuilder.CreateBox("h", { width: 0.4, height: 0.04, depth: 0.04 }, scene), scene, "#475569"); handle.position.set(0, 0.76, 0.33)
      const led = glow(MeshBuilder.CreateBox("g", { width: 0.04, height: 0.04, depth: 0.01 }, scene), scene, "#38BDF8"); led.position.set(0.22, 0.79, 0.33)
      return [body, door, handle, led]
    }
    case "pastry_case": {
      const base = part(MeshBuilder.CreateBox("b", { width: 1.4, height: 0.9, depth: 0.6 }, scene), scene, "#1F2937"); base.position.y = 0.45
      const glass = glow(MeshBuilder.CreateBox("g", { width: 1.4, height: 0.7, depth: 0.6 }, scene), scene, "#BAE6FD"); glass.position.y = 1.25; const gm = glass.material as StandardMaterial; gm.alpha = 0.3
      const out: Mesh[] = [base, glass]
      for (const y of [1.05, 1.4]) { const shelf = part(MeshBuilder.CreateBox("s", { width: 1.3, height: 0.03, depth: 0.5 }, scene), scene, "#E5E7EB"); shelf.position.y = y; out.push(shelf) }
      return out
    }
    case "water_cooler": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.4, height: 1.1, depth: 0.4 }, scene), scene, "#F8FAFC"); body.position.y = 0.55
      const bottle = part(MeshBuilder.CreateCylinder("c", { height: 0.5, diameterTop: 0.18, diameterBottom: 0.3, tessellation: 18 }, scene), scene, "#7DD3FC"); bottle.position.y = 1.35; const bm = bottle.material as StandardMaterial; bm.alpha = 0.6
      const tap = part(MeshBuilder.CreateBox("t", { width: 0.1, height: 0.06, depth: 0.06 }, scene), scene, "#3B82F6"); tap.position.set(0, 0.7, 0.22)
      return [body, bottle, tap]
    }

    // ── Техника / офис (новые) ──
    case "copier": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 0.9, depth: 0.65 }, scene), scene, "#374151"); body.position.y = 0.45
      const lid = part(MeshBuilder.CreateBox("l", { width: 0.72, height: 0.08, depth: 0.67 }, scene), scene, "#1F2937"); lid.position.y = 0.93
      const tray = part(MeshBuilder.CreateBox("t", { width: 0.66, height: 0.04, depth: 0.2 }, scene), scene, "#4B5563"); tray.position.set(0, 0.7, 0.4)
      const panel = glow(MeshBuilder.CreateBox("p", { width: 0.25, height: 0.12, depth: 0.02 }, scene), scene, "#34D399"); panel.position.set(0.18, 0.98, 0.3); panel.rotation.x = -0.6
      return [body, lid, tray, panel]
    }
    case "safe": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.6, height: 0.6, depth: 0.55 }, scene), scene, "#18181B"); body.position.y = 0.3
      const door = part(MeshBuilder.CreateBox("d", { width: 0.5, height: 0.5, depth: 0.03 }, scene), scene, "#27272A"); door.position.set(0, 0.3, 0.28)
      const dial = part(MeshBuilder.CreateCylinder("c", { height: 0.05, diameter: 0.14, tessellation: 16 }, scene), scene, "#71717A"); dial.rotation.x = Math.PI / 2; dial.position.set(-0.08, 0.3, 0.3)
      const handle = part(MeshBuilder.CreateBox("h", { width: 0.18, height: 0.04, depth: 0.04 }, scene), scene, "#A1A1AA"); handle.position.set(0.12, 0.3, 0.3)
      return [body, door, dial, handle]
    }
    case "monitor_dual": {
      const out: Mesh[] = []
      for (const x of [-0.34, 0.34]) { const frame = part(MeshBuilder.CreateBox("f", { width: 0.6, height: 0.36, depth: 0.04 }, scene), scene, "#0B0F19"); frame.position.set(x, 1.05, 0); out.push(frame); const screen = glow(MeshBuilder.CreateBox("s", { width: 0.54, height: 0.3, depth: 0.02 }, scene), scene, "#1E3A8A"); screen.position.set(x, 1.05, 0.03); out.push(screen) }
      const stand = part(MeshBuilder.CreateBox("st", { width: 0.3, height: 0.04, depth: 0.2 }, scene), scene, "#1F2937"); stand.position.y = 0.85; out.push(stand)
      const neck = part(MeshBuilder.CreateBox("n", { width: 0.04, height: 0.2, depth: 0.04 }, scene), scene, "#374151"); neck.position.y = 0.96; out.push(neck)
      return out
    }

    // ── Гейминг (новые) ──
    case "streaming_setup": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.4, height: 0.06, depth: 0.7 }, scene), scene, "#0B0F19"); top.position.y = 0.74
      const out: Mesh[] = [top]
      for (const x of [-0.65, 0.65]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.06, height: 0.74, depth: 0.6 }, scene), scene, "#111827"); l.position.set(x, 0.37, 0); out.push(l) }
      const rgb = glow(MeshBuilder.CreateBox("rgb", { width: 1.4, height: 0.03, depth: 0.03 }, scene), scene, "#EC4899"); rgb.position.set(0, 0.7, 0.34); out.push(rgb)
      const frame = part(MeshBuilder.CreateBox("f", { width: 0.7, height: 0.42, depth: 0.04 }, scene), scene, "#0B0F19"); frame.position.set(0, 1.15, -0.2); out.push(frame)
      const screen = glow(MeshBuilder.CreateBox("s", { width: 0.64, height: 0.36, depth: 0.02 }, scene), scene, "#7C3AED"); screen.position.set(0, 1.15, -0.17); out.push(screen)
      const arm = part(MeshBuilder.CreateCylinder("a", { height: 0.5, diameter: 0.03 }, scene), scene, "#1F2937"); arm.position.set(0.55, 1.05, 0.1); arm.rotation.z = 0.3; out.push(arm)
      const mic = part(MeshBuilder.CreateCapsule("m", { height: 0.18, radius: 0.05 }, scene), scene, "#27272A"); mic.position.set(0.42, 1.25, 0.1); out.push(mic)
      const ring = glow(MeshBuilder.CreateTorus("r", { diameter: 0.45, thickness: 0.04, tessellation: 20 }, scene), scene, "#FDE68A"); ring.position.set(-0.5, 1.35, 0.1); ring.rotation.x = Math.PI / 2; out.push(ring)
      return out
    }

    // ── Природа / декор (новые) ──
    case "fern": {
      const pot = part(MeshBuilder.CreateCylinder("p", { height: 0.4, diameterTop: 0.5, diameterBottom: 0.36, tessellation: 18 }, scene), scene, "#92400E"); pot.position.y = 0.2
      const out: Mesh[] = [pot]
      for (let i = 0; i < 7; i++) { const ang = (i * 2 * Math.PI) / 7; const leaf = part(MeshBuilder.CreateSphere("l", { diameter: 0.7, segments: 8 }, scene), scene, "#3F8F3F"); leaf.scaling.set(1.6, 0.18, 0.5); leaf.position.set(Math.cos(ang) * 0.32, 0.65 + (i % 2) * 0.12, Math.sin(ang) * 0.32); leaf.rotation.y = -ang; leaf.rotation.z = 0.35; out.push(leaf) }
      const center = part(MeshBuilder.CreateSphere("c", { diameter: 0.4, segments: 8 }, scene), scene, "#2E7D32"); center.position.y = 0.7; center.scaling.y = 1.2; out.push(center)
      return out
    }
    case "wall_panel": {
      const out: Mesh[] = []
      const back = part(MeshBuilder.CreateBox("b", { width: 1.6, height: 1.4, depth: 0.04 }, scene), scene, "#6B4423"); back.position.y = 1.5; out.push(back)
      for (let i = 0; i < 4; i++) { const slat = part(MeshBuilder.CreateBox("s", { width: 0.32, height: 1.36, depth: 0.06 }, scene), scene, "#8B5A2B"); slat.position.set(-0.6 + i * 0.4, 1.5, 0.04); out.push(slat) }
      const frame = part(MeshBuilder.CreateBox("f", { width: 1.66, height: 0.06, depth: 0.06 }, scene), scene, "#4B5563"); frame.position.set(0, 2.18, 0.04); out.push(frame)
      return out
    }

    // ── Офис (новые) ──
    case "cubicle": {
      const top = part(MeshBuilder.CreateBox("t", { width: 1.3, height: 0.05, depth: 0.7 }, scene), scene, "#374151"); top.position.y = 0.74
      const out: Mesh[] = [top]
      for (const x of [-0.6, 0.6]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.05, height: 0.74, depth: 0.6 }, scene), scene, "#1F2937"); l.position.set(x, 0.37, 0); out.push(l) }
      const back = part(MeshBuilder.CreateBox("b", { width: 1.4, height: 1.3, depth: 0.05 }, scene), scene, "#94A3B8"); back.position.set(0, 0.65, -0.37); out.push(back)
      const side = part(MeshBuilder.CreateBox("s", { width: 0.05, height: 1.3, depth: 0.74 }, scene), scene, "#94A3B8"); side.position.set(-0.7, 0.65, 0); out.push(side)
      const screen = glow(MeshBuilder.CreateBox("sc", { width: 0.5, height: 0.32, depth: 0.03 }, scene), scene, "#1E3A8A"); screen.position.set(0, 1.0, -0.32); out.push(screen)
      return out
    }
    case "conference_phone": {
      const body = part(MeshBuilder.CreateCylinder("b", { height: 0.06, diameter: 0.32, tessellation: 18 }, scene), scene, "#1F2937"); body.position.y = 0.78
      const out: Mesh[] = [body]
      for (let i = 0; i < 3; i++) { const ang = (i * 2 * Math.PI) / 3; const arm = part(MeshBuilder.CreateBox("a", { width: 0.12, height: 0.03, depth: 0.07 }, scene), scene, "#374151"); arm.position.set(Math.cos(ang) * 0.2, 0.79, Math.sin(ang) * 0.2); arm.rotation.y = -ang; out.push(arm) }
      const led = glow(MeshBuilder.CreateBox("g", { width: 0.06, height: 0.02, depth: 0.04 }, scene), scene, "#22C55E"); led.position.set(0, 0.82, 0.08); out.push(led)
      return out
    }
    case "coworking_desk": {
      const top = part(MeshBuilder.CreateBox("t", { width: 3.2, height: 0.06, depth: 1.1 }, scene), scene, "#B98A5A"); top.position.y = 0.74
      const out: Mesh[] = [top]
      for (const x of [-1.5, 0, 1.5]) { const l = part(MeshBuilder.CreateBox("l", { width: 0.08, height: 0.74, depth: 1 }, scene), scene, "#4B5563"); l.position.set(x, 0.37, 0); out.push(l) }
      for (const z of [-0.28, 0.28]) for (const x of [-1, 0, 1]) { const m = glow(MeshBuilder.CreateBox("m", { width: 0.45, height: 0.28, depth: 0.02 }, scene), scene, "#1E3A8A"); m.position.set(x, 1.0, z); m.rotation.y = z > 0 ? Math.PI : 0; out.push(m) }
      return out
    }

    // ── Ритейл (новые) ──
    case "clothing_rack": {
      const bar = part(MeshBuilder.CreateCylinder("b", { height: 1.6, diameter: 0.05 }, scene), scene, "#94A3B8"); bar.rotation.z = Math.PI / 2; bar.position.y = 1.4
      const out: Mesh[] = [bar]
      for (const x of [-0.7, 0.7]) { const post = part(MeshBuilder.CreateCylinder("p", { height: 1.4, diameter: 0.04 }, scene), scene, "#64748B"); post.position.set(x, 0.7, 0); out.push(post); const foot = part(MeshBuilder.CreateBox("f", { width: 0.5, height: 0.04, depth: 0.5 }, scene), scene, "#475569"); foot.position.set(x, 0.02, 0); out.push(foot) }
      const colors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"]
      for (let i = 0; i < 6; i++) { const garment = part(MeshBuilder.CreateBox("g", { width: 0.16, height: 0.7, depth: 0.3 }, scene), scene, colors[i % colors.length]); garment.position.set(-0.55 + i * 0.22, 1.0, 0); out.push(garment) }
      return out
    }
    case "mannequin": {
      const base = part(MeshBuilder.CreateCylinder("b", { height: 0.05, diameter: 0.4, tessellation: 18 }, scene), scene, "#475569"); base.position.y = 0.025
      const pole = part(MeshBuilder.CreateCylinder("p", { height: 0.3, diameter: 0.04 }, scene), scene, "#64748B"); pole.position.y = 0.2
      const body = part(MeshBuilder.CreateCapsule("c", { height: 1.1, radius: 0.18 }, scene), scene, "#E5E7EB"); body.position.y = 1.0
      const head = part(MeshBuilder.CreateSphere("h", { diameter: 0.24, segments: 10 }, scene), scene, "#E5E7EB"); head.position.y = 1.72
      return [base, pole, body, head]
    }
    case "checkout_counter": {
      const body = part(MeshBuilder.CreateBox("b", { width: 1.6, height: 0.9, depth: 0.7 }, scene), scene, "#475569"); body.position.y = 0.45
      const top = part(MeshBuilder.CreateBox("t", { width: 1.7, height: 0.06, depth: 0.8 }, scene), scene, "#94A3B8"); top.position.y = 0.93
      const belt = part(MeshBuilder.CreateBox("be", { width: 1.2, height: 0.02, depth: 0.4 }, scene), scene, "#1F2937"); belt.position.set(-0.1, 0.97, 0)
      const reg = part(MeshBuilder.CreateBox("r", { width: 0.4, height: 0.18, depth: 0.3 }, scene), scene, "#1F2937"); reg.position.set(0.55, 1.05, -0.1)
      const screen = glow(MeshBuilder.CreateBox("s", { width: 0.3, height: 0.2, depth: 0.02 }, scene), scene, "#22C55E"); screen.position.set(0.55, 1.22, -0.1); screen.rotation.x = -0.3
      return [body, top, belt, reg, screen]
    }
    case "shopping_cart": {
      const out: Mesh[] = []
      const basketHex = "#9CA3AF"
      const bottom = part(MeshBuilder.CreateBox("bt", { width: 0.55, height: 0.04, depth: 0.7 }, scene), scene, basketHex); bottom.position.set(0, 0.5, 0); bottom.rotation.x = -0.12; out.push(bottom)
      for (const z of [-0.32, 0.32]) { const w = part(MeshBuilder.CreateBox("w", { width: 0.55, height: 0.45, depth: 0.03 }, scene), scene, basketHex); w.position.set(0, 0.68, z); out.push(w) }
      for (const x of [-0.28, 0.28]) { const w = part(MeshBuilder.CreateBox("w", { width: 0.03, height: 0.45, depth: 0.7 }, scene), scene, basketHex); w.position.set(x, 0.68, 0); out.push(w) }
      const handle = part(MeshBuilder.CreateBox("h", { width: 0.55, height: 0.04, depth: 0.04 }, scene), scene, "#64748B"); handle.position.set(0, 0.95, 0.42); out.push(handle)
      const handlePost = part(MeshBuilder.CreateBox("hp", { width: 0.03, height: 0.45, depth: 0.03 }, scene), scene, "#64748B"); handlePost.position.set(0, 0.72, 0.42); out.push(handlePost)
      for (const [x, z] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.3], [0.22, 0.3]]) { const wheel = part(MeshBuilder.CreateCylinder("wh", { height: 0.04, diameter: 0.14, tessellation: 12 }, scene), scene, "#1F2937"); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.07, z); out.push(wheel) }
      return out
    }
    case "goods_shelf": {
      const out: Mesh[] = []
      const shelfY = [0.3, 0.8, 1.3, 1.8]
      for (const y of shelfY) { const sh = part(MeshBuilder.CreateBox("s", { width: 1.6, height: 0.05, depth: 0.5 }, scene), scene, "#CBD5E1"); sh.position.y = y; out.push(sh) }
      for (const x of [-0.78, 0.78]) { const sd = part(MeshBuilder.CreateBox("d", { width: 0.05, height: 1.85, depth: 0.5 }, scene), scene, "#94A3B8"); sd.position.set(x, 0.925, 0); out.push(sd) }
      const back = part(MeshBuilder.CreateBox("b", { width: 1.6, height: 1.85, depth: 0.03 }, scene), scene, "#E5E7EB"); back.position.set(0, 0.925, -0.24); out.push(back)
      const colors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"]
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { const goods = part(MeshBuilder.CreateBox("g", { width: 0.18, height: 0.32, depth: 0.18 }, scene), scene, colors[(r + i) % colors.length]); goods.position.set(-0.6 + i * 0.24, shelfY[r] + 0.2, 0.05); out.push(goods) }
      return out
    }

    // ── Гейминг (новые) ──
    case "vr_station": {
      const platform = part(MeshBuilder.CreateCylinder("p", { height: 0.12, diameter: 2, tessellation: 28 }, scene), scene, "#1F2937"); platform.position.y = 0.06
      const ring = glow(MeshBuilder.CreateTorus("r", { diameter: 1.9, thickness: 0.06, tessellation: 28 }, scene), scene, "#22D3EE"); ring.position.y = 0.13; ring.rotation.x = Math.PI / 2
      const post = part(MeshBuilder.CreateCylinder("po", { height: 1.6, diameter: 0.1 }, scene), scene, "#111827"); post.position.set(0, 0.8, -0.8)
      const headset = part(MeshBuilder.CreateBox("h", { width: 0.3, height: 0.18, depth: 0.22 }, scene), scene, "#0B0F19"); headset.position.set(0, 1.55, -0.7)
      const lens = glow(MeshBuilder.CreateBox("l", { width: 0.26, height: 0.1, depth: 0.02 }, scene), scene, "#7C3AED"); lens.position.set(0, 1.55, -0.58)
      return [platform, ring, post, headset, lens]
    }
    case "arcade_machine": {
      const body = part(MeshBuilder.CreateBox("b", { width: 0.8, height: 1.9, depth: 0.7 }, scene), scene, "#7C3AED"); body.position.y = 0.95
      const screen = glow(MeshBuilder.CreateBox("s", { width: 0.6, height: 0.5, depth: 0.02 }, scene), scene, "#1E3A8A"); screen.position.set(0, 1.45, 0.36); screen.rotation.x = -0.2
      const panel = part(MeshBuilder.CreateBox("p", { width: 0.7, height: 0.3, depth: 0.4 }, scene), scene, "#1F2937"); panel.position.set(0, 0.95, 0.3); panel.rotation.x = 0.5
      const marquee = glow(MeshBuilder.CreateBox("m", { width: 0.74, height: 0.25, depth: 0.05 }, scene), scene, "#EC4899"); marquee.position.set(0, 1.82, 0.34)
      const out: Mesh[] = [body, screen, panel, marquee]
      for (const [x, c] of [[-0.18, "#EF4444"], [0.18, "#F59E0B"]] as Array<[number, string]>) { const btn = glow(MeshBuilder.CreateCylinder("btn", { height: 0.05, diameter: 0.1, tessellation: 14 }, scene), scene, c); btn.rotation.x = Math.PI / 2 + 0.5; btn.position.set(x, 0.98, 0.48); out.push(btn) }
      const stick = part(MeshBuilder.CreateCylinder("st", { height: 0.16, diameter: 0.04 }, scene), scene, "#0B0F19"); stick.position.set(-0.25, 1.02, 0.42); stick.rotation.x = 0.5; out.push(stick)
      return out
    }
    case "tournament_stage": {
      const podium = part(MeshBuilder.CreateBox("p", { width: 3, height: 0.4, depth: 2 }, scene), scene, "#111827"); podium.position.y = 0.2
      const trim = glow(MeshBuilder.CreateBox("t", { width: 3.04, height: 0.06, depth: 2.04 }, scene), scene, "#A78BFA"); trim.position.y = 0.41
      const out: Mesh[] = [podium, trim]
      for (const x of [-0.7, 0.7]) { const m = glow(MeshBuilder.CreateBox("m", { width: 0.9, height: 0.55, depth: 0.05 }, scene), scene, "#1E3A8A"); m.position.set(x, 1.1, -0.6); out.push(m); const stand = part(MeshBuilder.CreateBox("s", { width: 0.6, height: 0.35, depth: 0.5 }, scene), scene, "#1F2937"); stand.position.set(x, 0.6, -0.6); out.push(stand) }
      return out
    }

    // ── Кафе (новые) ──
    case "display_fridge": {
      const body = part(MeshBuilder.CreateBox("b", { width: 1, height: 2, depth: 0.7 }, scene), scene, "#E5E7EB"); body.position.y = 1.0
      const glass = glow(MeshBuilder.CreateBox("g", { width: 0.86, height: 1.6, depth: 0.04 }, scene), scene, "#7DD3FC"); glass.position.set(0, 1.05, 0.36); const gm = glass.material as StandardMaterial; gm.alpha = 0.35
      const out: Mesh[] = [body, glass]
      for (const y of [0.45, 0.95, 1.45]) { const shelf = part(MeshBuilder.CreateBox("s", { width: 0.84, height: 0.03, depth: 0.55 }, scene), scene, "#CBD5E1"); shelf.position.set(0, y, 0.05); out.push(shelf) }
      const colors = ["#EF4444", "#F59E0B", "#3B82F6"]
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const bottle = part(MeshBuilder.CreateCylinder("bo", { height: 0.3, diameter: 0.12, tessellation: 12 }, scene), scene, colors[r]); bottle.position.set(-0.3 + i * 0.2, [0.45, 0.95, 1.45][r] + 0.17, 0.05); out.push(bottle) }
      return out
    }
    case "ice_cream_case": {
      const body = part(MeshBuilder.CreateBox("b", { width: 1.4, height: 0.9, depth: 0.8 }, scene), scene, "#F8FAFC"); body.position.y = 0.45
      const lid = glow(MeshBuilder.CreateBox("l", { width: 1.4, height: 0.06, depth: 0.8 }, scene), scene, "#BAE6FD"); lid.position.y = 0.93; const lm = lid.material as StandardMaterial; lm.alpha = 0.4
      const out: Mesh[] = [body, lid]
      const colors = ["#FBCFE8", "#FEF08A", "#A7F3D0", "#FED7AA"]
      for (let i = 0; i < 4; i++) { const tub = part(MeshBuilder.CreateBox("t", { width: 0.28, height: 0.3, depth: 0.6 }, scene), scene, colors[i]); tub.position.set(-0.5 + i * 0.33, 0.75, 0); out.push(tub) }
      return out
    }
    case "napkin_stand": {
      const holder = part(MeshBuilder.CreateBox("h", { width: 0.16, height: 0.14, depth: 0.1 }, scene), scene, "#94A3B8"); holder.position.y = 0.82
      const napkins = part(MeshBuilder.CreateBox("n", { width: 0.13, height: 0.16, depth: 0.06 }, scene), scene, "#FFFFFF"); napkins.position.set(0, 0.86, 0)
      return [holder, napkins]
    }

    // ── Декор (новые) ──
    case "sculpture": {
      const base = part(MeshBuilder.CreateBox("b", { width: 0.7, height: 0.3, depth: 0.7 }, scene), scene, "#475569"); base.position.y = 0.15
      const out: Mesh[] = [base]
      const b1 = part(MeshBuilder.CreateBox("s1", { width: 0.5, height: 0.5, depth: 0.5 }, scene), scene, "#E2E8F0"); b1.position.y = 0.7; b1.rotation.set(0.4, 0.5, 0.3); out.push(b1)
      const b2 = part(MeshBuilder.CreateBox("s2", { width: 0.4, height: 0.4, depth: 0.4 }, scene), scene, "#CBD5E1"); b2.position.y = 1.15; b2.rotation.set(0.6, 1.1, 0.5); out.push(b2)
      const b3 = part(MeshBuilder.CreateBox("s3", { width: 0.3, height: 0.3, depth: 0.3 }, scene), scene, "#94A3B8"); b3.position.y = 1.5; b3.rotation.set(0.9, 0.3, 0.8); out.push(b3)
      return out
    }
    case "aquarium": {
      const stand = part(MeshBuilder.CreateBox("st", { width: 1.2, height: 0.7, depth: 0.5 }, scene), scene, "#1F2937"); stand.position.y = 0.35
      const water = MeshBuilder.CreateBox("w", { width: 1.1, height: 0.75, depth: 0.42 }, scene); water.material = glowMat(scene, "#22D3EE"); const wm = water.material as StandardMaterial; wm.alpha = 0.55; water.position.y = 1.12
      const glass = part(MeshBuilder.CreateBox("g", { width: 1.2, height: 0.85, depth: 0.5 }, scene), scene, "#BAE6FD"); const ggm = glass.material as StandardMaterial; ggm.alpha = 0.18; glass.position.y = 1.12
      const lid = part(MeshBuilder.CreateBox("l", { width: 1.22, height: 0.06, depth: 0.52 }, scene), scene, "#374151"); lid.position.y = 1.57
      return [stand, water, glass, lid]
    }
    case "neon_sign": {
      const ring = glow(MeshBuilder.CreateTorus("r", { diameter: 0.9, thickness: 0.06, tessellation: 28 }, scene), scene, "#EC4899"); ring.position.y = 1.8
      const out: Mesh[] = [ring]
      const bars: Array<[number, number, number]> = [[-0.5, 1.5, 0.5], [0.5, 1.5, 0.5], [0, 1.2, 0.7]]
      const colors = ["#22D3EE", "#A78BFA", "#FDE68A"]
      bars.forEach(([x, y, w], i) => { const bar = glow(MeshBuilder.CreateBox("b", { width: w, height: 0.06, depth: 0.06 }, scene), scene, colors[i]); bar.position.set(x, y, 0); out.push(bar) })
      return out
    }
    case "art_pedestal": {
      const base = part(MeshBuilder.CreateBox("b", { width: 0.5, height: 0.06, depth: 0.5 }, scene), scene, "#94A3B8"); base.position.y = 0.03
      const column = part(MeshBuilder.CreateBox("c", { width: 0.35, height: 1.1, depth: 0.35 }, scene), scene, "#E2E8F0"); column.position.y = 0.6
      const top = part(MeshBuilder.CreateBox("t", { width: 0.45, height: 0.06, depth: 0.45 }, scene), scene, "#94A3B8"); top.position.y = 1.18
      const item = part(MeshBuilder.CreateSphere("i", { diameter: 0.3, segments: 12 }, scene), scene, "#D6A35C"); item.position.y = 1.36
      return [base, column, top, item]
    }
    case "hanging_plant": {
      const mount = part(MeshBuilder.CreateBox("m", { width: 0.3, height: 0.06, depth: 0.3 }, scene), scene, "#4B5563"); mount.position.y = 2.95
      const out: Mesh[] = [mount]
      for (let i = 0; i < 3; i++) { const ang = (i * 2 * Math.PI) / 3; const rope = part(MeshBuilder.CreateCylinder("r", { height: 0.5, diameter: 0.02 }, scene), scene, "#9CA3AF"); rope.position.set(Math.cos(ang) * 0.12, 2.65, Math.sin(ang) * 0.12); out.push(rope) }
      const pot = part(MeshBuilder.CreateCylinder("p", { height: 0.3, diameterTop: 0.36, diameterBottom: 0.26, tessellation: 16 }, scene), scene, "#92400E"); pot.position.y = 2.3; out.push(pot)
      const crown = part(MeshBuilder.CreateSphere("c", { diameter: 0.7, segments: 8 }, scene), scene, "#3F8F3F"); crown.position.y = 1.95; crown.scaling.y = 1.3; out.push(crown)
      return out
    }
    case "floor_vase_big": {
      const body = part(MeshBuilder.CreateCylinder("b", { height: 1.2, diameterTop: 0.36, diameterBottom: 0.28, tessellation: 20 }, scene), scene, "#0EA5E9"); body.position.y = 0.6
      const belly = part(MeshBuilder.CreateSphere("be", { diameter: 0.62, segments: 14 }, scene), scene, "#0284C7"); belly.position.y = 0.45; belly.scaling.y = 0.8
      const neck = part(MeshBuilder.CreateCylinder("n", { height: 0.16, diameterTop: 0.42, diameterBottom: 0.34, tessellation: 20 }, scene), scene, "#0EA5E9"); neck.position.y = 1.18
      return [belly, body, neck]
    }

    // ── Мебель (новые) ──
    case "corner_sofa": {
      const out: Mesh[] = []
      const baseA = part(MeshBuilder.CreateBox("ba", { width: 2.4, height: 0.4, depth: 0.9 }, scene), scene, "#475569"); baseA.position.set(-0.15, 0.3, -0.75); out.push(baseA)
      const baseB = part(MeshBuilder.CreateBox("bb", { width: 0.9, height: 0.4, depth: 1.5 }, scene), scene, "#475569"); baseB.position.set(-0.9, 0.3, 0.3); out.push(baseB)
      const backA = part(MeshBuilder.CreateBox("ka", { width: 2.4, height: 0.55, depth: 0.22 }, scene), scene, "#334155"); backA.position.set(-0.15, 0.7, -1.09); out.push(backA)
      const backB = part(MeshBuilder.CreateBox("kb", { width: 0.22, height: 0.55, depth: 1.5 }, scene), scene, "#334155"); backB.position.set(-1.46, 0.7, 0.3); out.push(backB)
      const arm = part(MeshBuilder.CreateBox("a", { width: 0.2, height: 0.5, depth: 0.9 }, scene), scene, "#334155"); arm.position.set(1.15, 0.45, -0.75); out.push(arm)
      return out
    }
    case "round_pouf": {
      const body = part(MeshBuilder.CreateCylinder("b", { height: 0.42, diameter: 0.7, tessellation: 24 }, scene), scene, "#C2703D"); body.position.y = 0.21
      const top = part(MeshBuilder.CreateCylinder("t", { height: 0.08, diameter: 0.72, tessellation: 24 }, scene), scene, "#D98A5A"); top.position.y = 0.44
      return [body, top]
    }
    case "tv_large": {
      const frame = part(MeshBuilder.CreateBox("f", { width: 2.2, height: 1.25, depth: 0.06 }, scene), scene, "#0B0F19"); frame.position.y = 1.7
      const screen = glow(MeshBuilder.CreateBox("s", { width: 2.1, height: 1.15, depth: 0.02 }, scene), scene, "#1E3A8A"); screen.position.set(0, 1.7, 0.04)
      return [frame, screen]
    }
    case "lockers_row": {
      const out: Mesh[] = []
      for (let i = 0; i < 4; i++) {
        const x = -0.93 + i * 0.62
        const body = part(MeshBuilder.CreateBox("b", { width: 0.58, height: 1.8, depth: 0.5 }, scene), scene, i % 2 === 0 ? "#4B5563" : "#64748B"); body.position.set(x, 0.9, 0); out.push(body)
        const door = part(MeshBuilder.CreateBox("d", { width: 0.5, height: 1.72, depth: 0.02 }, scene), scene, i % 2 === 0 ? "#64748B" : "#94A3B8"); door.position.set(x, 0.9, 0.26); out.push(door)
        const handle = part(MeshBuilder.CreateBox("h", { width: 0.04, height: 0.14, depth: 0.04 }, scene), scene, "#1F2937"); handle.position.set(x + 0.18, 1.0, 0.28); out.push(handle)
        const vent = glow(MeshBuilder.CreateBox("v", { width: 0.3, height: 0.04, depth: 0.01 }, scene), scene, "#38BDF8"); vent.position.set(x, 1.55, 0.28); out.push(vent)
      }
      return out
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
  const sx = obj.scaleX && obj.scaleX > 0 ? obj.scaleX : 1
  const sy = obj.scaleY && obj.scaleY > 0 ? obj.scaleY : 1
  const sz = obj.scaleZ && obj.scaleZ > 0 ? obj.scaleZ : 1
  root.scaling.set(sc * sx, sc * sy, sc * sz)
  root.metadata = { kind: "object", entityId: obj.id, target }
  for (const m of buildByAsset(obj.assetId, scene)) {
    m.parent = root
    m.metadata = { kind: "object", entityId: obj.id, target }
    m.receiveShadows = true
  }
  return root
}
