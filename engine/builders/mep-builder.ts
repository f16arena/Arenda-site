// Сети этажа в 3D: трассы (кабель/труба — трубка, воздуховод — короб по участкам)
// и приборы (коробки габарита, стояки — цилиндры во всю высоту этажа). Цвет —
// по системе. Всё крепится к узлу этажа, координаты — мм плана.

import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Scene } from "@babylonjs/core"
import type { Floor, MepSystem } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, ductSection, runDiameterMm } from "@/lib/builder/mep/catalog"

const S = 0.001

const matCache = new WeakMap<Scene, Map<string, StandardMaterial>>()
function mepMaterial(scene: Scene, hex: string, dim = false): StandardMaterial {
  let cache = matCache.get(scene)
  if (!cache) {
    cache = new Map()
    matCache.set(scene, cache)
  }
  const key = `${hex}${dim ? "_d" : ""}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new StandardMaterial(`mep_${key}`, scene)
  const c = Color3.FromHexString(hex)
  m.diffuseColor = dim ? c.scale(0.55) : c
  m.emissiveColor = c.scale(dim ? 0.15 : 0.35)
  m.specularColor = new Color3(0.15, 0.15, 0.15)
  m.freeze()
  cache.set(key, m)
  return m
}

/** plan — чертёжный вид сверху: линии и значки крупнее, чтобы читались в масштабе плана. */
export function buildMep(f: Floor, parent: TransformNode, scene: Scene, layers: ReadonlySet<MepSystem>, plan = false): Mesh[] {
  const out: Mesh[] = []
  const root = new TransformNode(`mep_${f.id}`, scene)
  root.parent = parent

  for (const run of f.mepRuns ?? []) {
    if (!layers.has(run.system) || run.points.length < 2) continue
    const info = MEP_SYSTEM_INFO[run.system]
    const mat = mepMaterial(scene, info.color)
    const meta = { kind: "mep-run", floorId: f.id, entityId: run.id }
    const y = run.height * S
    if (info.shape === "duct") {
      const sec = ductSection(run.size || info.size)
      for (let i = 1; i < run.points.length; i++) {
        const a = run.points[i - 1], b = run.points[i]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < 1) continue
        // короб на стыках удлиняем на полширины — углы без щелей
        const dw = plan ? Math.max(sec.w, 250) : sec.w
        const box = MeshBuilder.CreateBox(`duct_${run.id}_${i}`, { width: (len + dw) * S, height: sec.h * S, depth: dw * S }, scene)
        box.position.set(((a.x + b.x) / 2) * S, y, ((a.y + b.y) / 2) * S)
        box.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
        box.material = mat
        box.metadata = meta
        box.parent = root
        out.push(box)
      }
    } else {
      // тоньше 30 мм кабель в 3D не разглядеть — рисуем не тоньше
      const d = Math.max(plan ? 110 : info.shape === "cable" ? 40 : 50, runDiameterMm(run.system, run.size || info.size))
      const path = run.points.map((p) => new Vector3(p.x * S, y, p.y * S))
      const tube = MeshBuilder.CreateTube(`run_${run.id}`, { path, radius: (d / 2) * S, tessellation: 10, cap: Mesh.CAP_ALL }, scene)
      tube.material = mat
      tube.metadata = meta
      tube.parent = root
      out.push(tube)
      // сферы в изломах — трубка без «переломов»
      for (let i = 1; i < run.points.length - 1; i++) {
        const j = MeshBuilder.CreateSphere(`joint_${run.id}_${i}`, { diameter: d * S * 1.02, segments: 6 }, scene)
        j.position.copyFrom(path[i])
        j.material = mat
        j.metadata = meta
        j.parent = root
        out.push(j)
      }
    }
  }

  for (const dev of f.mepDevices ?? []) {
    if (!layers.has(dev.system)) continue
    const info = MEP_DEVICE_BY_KIND[dev.kind]
    const sys = MEP_SYSTEM_INFO[dev.system]
    const meta = { kind: "mep-device", floorId: f.id, entityId: dev.id }
    if (info?.riser) {
      const d = Math.max(plan ? 300 : 60, info.box.w)
      const cyl = MeshBuilder.CreateCylinder(`riser_${dev.id}`, { height: f.height * S, diameter: d * S, tessellation: 12 }, scene)
      cyl.position.set(dev.at.x * S, (f.height / 2) * S, dev.at.y * S)
      cyl.material = mepMaterial(scene, sys.color)
      cyl.metadata = meta
      cyl.parent = root
      out.push(cyl)
      continue
    }
    const box = info?.box ?? { w: 200, d: 200, h: 200 }
    // приборы крошечные (розетка 8 см) — в 3D показываем не меньше 12 см
    const w = Math.max(plan ? 300 : 120, box.w), dd = Math.max(plan ? 220 : 60, box.d), h = Math.max(120, box.h)
    const m = MeshBuilder.CreateBox(`dev_${dev.id}`, { width: w * S, depth: dd * S, height: h * S }, scene)
    // настенный прибор растёт от стены в комнату, а не внутрь стены
    const grow = info?.wall ? (dd - box.d) / 2 : 0
    const r = (dev.rotation * Math.PI) / 180
    m.position.set((dev.at.x - Math.sin(r) * grow) * S, (dev.height + h / 2) * S, (dev.at.y + Math.cos(r) * grow) * S)
    m.rotation.y = (-dev.rotation * Math.PI) / 180
    m.material = mepMaterial(scene, sys.color)
    m.metadata = meta
    m.parent = root
    out.push(m)
  }
  return out
}
