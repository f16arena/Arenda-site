// Развёртка текстур по реальным метрам: UV из мировых координат вершины по
// доминирующей оси нормали (кубическая проекция). Без неё текстура растягивалась
// на каждую коробку целиком — доска пола на всю комнату, кирпич на всю стену,
// и соседние куски стены не совпадали рисунком.

import { Vector3, VertexBuffer, type AbstractMesh, type Mesh } from "@babylonjs/core"
import { textureTiling } from "./material-registry"

export function applyWorldUV(mesh: Mesh, tileM: number, uvScale: number): void {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)
  const nrm = mesh.getVerticesData(VertexBuffer.NormalKind)
  if (!pos || !nrm) return
  const wm = mesh.computeWorldMatrix(true)
  const n = pos.length / 3
  const uv = new Float32Array(n * 2)
  const p = new Vector3(), q = new Vector3(), w = new Vector3(), wn = new Vector3()
  const k = 1 / (tileM * uvScale)
  for (let i = 0; i < n; i++) {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    q.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2])
    Vector3.TransformCoordinatesToRef(p, wm, w)
    Vector3.TransformNormalToRef(q, wm, wn)
    const ax = Math.abs(wn.x), ay = Math.abs(wn.y), az = Math.abs(wn.z)
    let u: number, v: number
    if (ay >= ax && ay >= az) { u = w.x; v = w.z }
    else if (ax >= az) { u = w.z; v = w.y }
    else { u = w.x; v = w.y }
    uv[i * 2] = u * k
    uv[i * 2 + 1] = v * k
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv, false)
}

/** Развернуть все меши узла, у материалов которых есть рисунок. */
export function worldUVFor(meshes: AbstractMesh[]): void {
  for (const m of meshes) {
    const name = m.material?.name
    if (!name?.startsWith("mat_") || !("getVerticesData" in m)) continue
    const t = textureTiling(name.slice(4))
    if (t) applyWorldUV(m as Mesh, t.tileM, t.scale)
  }
}
