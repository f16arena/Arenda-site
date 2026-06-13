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
