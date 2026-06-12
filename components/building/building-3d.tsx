"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import { X, Layers, Building2, Trees, Box as BoxIcon, Move, RotateCw, Trash2, Plus, Minus, Scissors, Copy, Undo2, ArrowUpFromLine, Square, Eye, PencilRuler } from "lucide-react"
import { toast } from "sonner"
import { isObjectSpace } from "@/lib/zone-kinds"
import { setObjectPosition, setObjectRotation, deleteSpace } from "@/app/actions/spaces"
import { addBuildingDecor, setDecorPosition, setDecorRotation, setDecorScale, setDecorLevel, deleteBuildingDecor, duplicateBuildingDecor, addWallSegment, setDecorKind, setDecorLen, recreateDecor } from "@/app/actions/decor"

export type Decor3D = { id: string; kind: string; x: number; z: number; rot: number; scale?: number; len?: number; level?: string; onRoof?: boolean; modelUrl?: string | null }

// Палитра строительного редактора по категориям.
const ITEM_CATEGORIES: Array<{ title: string; items: Array<{ kind: string; label: string }> }> = [
  { title: "Стены / окна", items: [
    { kind: "wall", label: "Стена" }, { kind: "wall-brick", label: "Кирпич" },
    { kind: "wall-concrete", label: "Бетон" }, { kind: "wall-tile", label: "Кафель" },
    { kind: "halfwall", label: "Полустена" }, { kind: "window", label: "Окно" },
  ] },
  { title: "Полы", items: [
    { kind: "floor-tile", label: "Плитка" }, { kind: "floor-ceramic", label: "Кафель" },
    { kind: "floor-lino", label: "Линолеум" }, { kind: "floor-paving", label: "Брусчатка" },
    { kind: "floor-asphalt", label: "Асфальт" },
  ] },
  { title: "Двери / опоры", items: [
    { kind: "door-wood", label: "Дверь дерев." }, { kind: "door-plastic", label: "Дверь пласт." },
    { kind: "door-metal", label: "Дверь метал." },
    { kind: "column-square", label: "Колонна □" }, { kind: "column-round", label: "Колонна ○" },
  ] },
  { title: "Лестницы / крыльцо", items: [
    { kind: "stairs-straight", label: "Ровная" }, { kind: "stairs-turn", label: "Поворотная" },
    { kind: "stairs-step2", label: "2 ступени" }, { kind: "stairs-step3", label: "3 ступени" },
  ] },
  { title: "Сантехника / тепло", items: [
    { kind: "toilet", label: "Унитаз" }, { kind: "urinal", label: "Писсуар" },
    { kind: "sink", label: "Рукомойник" }, { kind: "radiator", label: "Батарея" },
    { kind: "stall", label: "Кабинка WC" },
  ] },
  { title: "Мебель", items: [
    { kind: "table", label: "Стол" }, { kind: "chair", label: "Стул" },
    { kind: "cabinet", label: "Шкаф" }, { kind: "sofa", label: "Диван" },
    { kind: "shelf", label: "Стеллаж" }, { kind: "reception", label: "Ресепшн" },
    { kind: "partition", label: "Перегородка" },
  ] },
  { title: "Природа", items: [
    { kind: "tree", label: "Дерево" }, { kind: "spruce", label: "Ёлка" },
    { kind: "birch", label: "Берёза" }, { kind: "bush", label: "Куст" },
    { kind: "grass", label: "Газон" }, { kind: "flowerbed", label: "Клумба" },
  ] },
  { title: "Улица / двор", items: [
    { kind: "fence-metal", label: "Забор метал." }, { kind: "fence-wood", label: "Забор дерев." },
    { kind: "gate", label: "Ворота" }, { kind: "bench", label: "Скамейка" },
    { kind: "lamp", label: "Фонарь" }, { kind: "bin", label: "Урна" },
    { kind: "canopy", label: "Навес" }, { kind: "parking", label: "Парковка" },
    { kind: "road", label: "Дорога" }, { kind: "mast", label: "Мачта" },
  ] },
  { title: "Крыша / тех", items: [
    { kind: "hvac", label: "Кондиционер" }, { kind: "vent", label: "Вентиляция" },
    { kind: "tank", label: "Бак" },
  ] },
]

// Семейства материалов: варианты, на которые можно перекрасить выбранный предмет.
const MATERIAL_FAMILIES: Array<{ test: (k: string) => boolean; options: Array<{ kind: string; label: string }> }> = [
  { test: (k) => k === "wall" || k.startsWith("wall-"), options: [
    { kind: "wall", label: "Простая" }, { kind: "wall-brick", label: "Кирпич" },
    { kind: "wall-concrete", label: "Бетон" }, { kind: "wall-tile", label: "Кафель" }] },
  { test: (k) => k.startsWith("floor-"), options: [
    { kind: "floor-tile", label: "Плитка" }, { kind: "floor-ceramic", label: "Кафель" },
    { kind: "floor-lino", label: "Линолеум" }, { kind: "floor-paving", label: "Брусчатка" }, { kind: "floor-asphalt", label: "Асфальт" }] },
  { test: (k) => k.startsWith("door-"), options: [
    { kind: "door-wood", label: "Дерево" }, { kind: "door-plastic", label: "Пластик" }, { kind: "door-metal", label: "Металл" }] },
  { test: (k) => k.startsWith("fence-"), options: [
    { kind: "fence-metal", label: "Металл" }, { kind: "fence-wood", label: "Дерево" }] },
  { test: (k) => k.startsWith("column-"), options: [
    { kind: "column-square", label: "Квадрат" }, { kind: "column-round", label: "Круг" }] },
]
function materialOptions(kind: string): Array<{ kind: string; label: string }> {
  return MATERIAL_FAMILIES.find((f) => f.test(kind))?.options ?? []
}

// Процедурные текстуры (кирпич/плитка/бетон/асфальт) рисуем на canvas один раз
// и кэшируем по виду — материалы выглядят «материалами», а не плоским цветом.
const TEXTURE_CACHE = new Map<string, THREE.Texture | null>()
function patternTexture(kind: "brick" | "grid" | "noise", base: string, line: string): THREE.Texture | null {
  if (typeof document === "undefined") return null
  const key = `${kind}:${base}:${line}`
  const cached = TEXTURE_CACHE.get(key)
  if (cached !== undefined) return cached
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")
  if (!ctx) { TEXTURE_CACHE.set(key, null); return null }
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  if (kind === "brick") {
    ctx.strokeStyle = line; ctx.lineWidth = 4
    for (let row = 0; row < 4; row++) {
      const y = row * 32
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke()
      const off = row % 2 === 0 ? 0 : 32
      for (let x = off; x <= 128; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke() }
    }
  } else if (kind === "grid") {
    ctx.strokeStyle = line; ctx.lineWidth = 3
    for (let i = 0; i <= 128; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke()
    }
  } else {
    // noise — мелкая крапинка (бетон/асфальт/линолеум)
    ctx.fillStyle = line
    for (let i = 0; i < 700; i++) {
      const x = (i * 53) % 128, y = (i * 97) % 128
      ctx.globalAlpha = 0.05 + ((i * 7) % 10) / 60
      ctx.fillRect(x, y, 2, 2)
    }
    ctx.globalAlpha = 1
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  TEXTURE_CACHE.set(key, tex)
  return tex
}

/** Декоративная 3D-модель (дерево/куст/фонарь/скамейка) — чистая сцена. */
function buildDecorModel(kind: string): THREE.Group {
  const g = new THREE.Group()
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m) }

  // ── Семейства с вариантами (материалы/типы) — по префиксу ──
  if (kind.startsWith("floor-")) {
    const v = kind.slice(6)
    const colors: Record<string, number> = { tile: 0xe2e8f0, ceramic: 0xf1f5f9, lino: 0xc9a86a, paving: 0x94a3b8, asphalt: 0x3f3f46 }
    const tex: Record<string, THREE.Texture | null> = {
      tile: patternTexture("grid", "#e2e8f0", "#94a3b8"),
      ceramic: patternTexture("grid", "#f1f5f9", "#cbd5e1"),
      paving: patternTexture("brick", "#94a3b8", "#64748b"),
      asphalt: patternTexture("noise", "#3f3f46", "#71717a"),
      lino: patternTexture("noise", "#c9a86a", "#a8824a"),
    }
    const mat = new THREE.MeshStandardMaterial({ color: colors[v] ?? 0xcbd5e1 })
    const t = tex[v]
    if (t) { t.repeat.set(4, 4); mat.map = t }
    const tile = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 4), mat)
    tile.position.y = 0.03; tile.receiveShadow = true; g.add(tile)
    return g
  }
  if (kind.startsWith("wall-")) {
    const v = kind.slice(5)
    const colors: Record<string, number> = { brick: 0xb45309, concrete: 0x9ca3af, tile: 0xbae6fd }
    const tex: Record<string, THREE.Texture | null> = {
      brick: patternTexture("brick", "#b45309", "#7c2d12"),
      concrete: patternTexture("noise", "#9ca3af", "#6b7280"),
      tile: patternTexture("grid", "#bae6fd", "#7dd3fc"),
    }
    const mat = new THREE.MeshStandardMaterial({ color: colors[v] ?? 0xe5e7eb })
    const t = tex[v]
    if (t) { t.repeat.set(3, 2); mat.map = t }
    const w = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.2), mat)
    w.position.y = 1.3; add(w)
    return g
  }
  if (kind.startsWith("door-")) {
    const colors: Record<string, number> = { wood: 0x9a6a3a, plastic: 0xe5e7eb, metal: 0x6b7280 }
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
    for (const x of [-0.55, 0.55]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.2), frameMat); j.position.set(x, 1.05, 0); add(j) }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.2), frameMat); lintel.position.y = 2.1; add(lintel)
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2, 0.06), new THREE.MeshStandardMaterial({ color: colors[kind.slice(5)] ?? 0x9a6a3a })); leaf.position.set(0, 1, 0); add(leaf)
    return g
  }
  if (kind.startsWith("fence-")) {
    const colors: Record<string, number> = { metal: 0x64748b, wood: 0x9a6a3a }
    const c = colors[kind.slice(6)] ?? 0x6b7280
    for (const x of [-1.3, -0.43, 0.43, 1.3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: c })); p.position.set(x, 0.6, 0); add(p) }
    for (const yy of [0.4, 0.95]) { const r = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: c })); r.position.set(0, yy, 0); add(r) }
    return g
  }
  if (kind.startsWith("column-")) {
    const round = kind.endsWith("round")
    const geo = round ? new THREE.CylinderGeometry(0.3, 0.3, 3, 16) : new THREE.BoxGeometry(0.5, 3, 0.5)
    const col = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe5e7eb })); col.position.y = 1.5; add(col)
    return g
  }
  if (kind.startsWith("stairs-")) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })
    const variant = kind.slice(7)
    const step = (w: number, x: number, y: number, z: number, depth = 0.4) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, depth), mat); s.position.set(x, y, z); add(s)
    }
    if (variant === "step2") {
      for (let i = 0; i < 2; i++) step(1.6, 0, 0.125 + i * 0.25, -i * 0.4)
    } else if (variant === "step3") {
      for (let i = 0; i < 3; i++) step(1.6, 0, 0.125 + i * 0.25, -i * 0.4)
    } else if (variant === "turn") {
      // Поворотная: 3 ступени прямо, площадка, 3 ступени вбок.
      for (let i = 0; i < 3; i++) step(1.4, 0, 0.125 + i * 0.25, -i * 0.4)
      const land = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 1.4), mat); land.position.set(0, 0.875, -1.4); add(land)
      for (let i = 0; i < 3; i++) step(0.4, 0.5 + i * 0.4, 1.125 + i * 0.25, -1.4, 1.4)
    } else {
      // straight (по умолчанию) — 6 ступеней.
      for (let i = 0; i < 6; i++) step(1.4, 0, 0.125 + i * 0.25, -i * 0.4)
    }
    return g
  }

  if (kind === "bush") {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f8f3f }))
    bush.position.y = 0.6; bush.scale.y = 0.7; add(bush)
  } else if (kind === "lamp") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x64748b }))
    pole.position.y = 1.7; add(pole)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xfde68a, emissiveIntensity: 0.6 }))
    head.position.y = 3.5; add(head)
  } else if (kind === "bench") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x9a6a3a }))
    seat.position.y = 0.5; add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x9a6a3a }))
    back.position.set(0, 0.8, -0.25); add(back)
    for (const x of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b7280 }))
      leg.position.set(x, 0.25, 0); add(leg)
    }
  } else if (kind === "hvac") {
    // Кондиционер/чиллер — короб с решёткой и вентилятором
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }))
    box.position.y = 0.55; add(box)
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0x475569 }))
    fan.position.set(0, 1.12, 0); add(fan)
  } else if (kind === "vent") {
    // Вентиляционная шахта/дефлектор
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x9ca3af }))
    duct.position.y = 0.6; add(duct)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x6b7280 }))
    cap.position.y = 1.3; add(cap)
  } else if (kind === "tank") {
    // Водяной/расширительный бак
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16), new THREE.MeshStandardMaterial({ color: 0x93c5fd }))
    body.position.y = 0.9; add(body)
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x93c5fd }))
    top.position.y = 1.8; add(top)
  } else if (kind === "grass") {
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0x6abf4b }))
    g2.position.y = 0.04; g2.receiveShadow = true; g.add(g2)
  } else if (kind === "flowerbed") {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }))
    bed.position.y = 0.15; add(bed)
    const colors = [0xef4444, 0xf59e0b, 0xec4899, 0x8b5cf6]
    for (let i = 0; i < 6; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }))
      fl.position.set(-0.8 + (i % 3) * 0.8, 0.4, -0.3 + Math.floor(i / 3) * 0.6); add(fl)
    }
  } else if (kind === "wall") {
    const w = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }))
    w.position.y = 1.3; add(w)
  } else if (kind === "fence") {
    for (const x of [-1.3, -0.43, 0.43, 1.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x6b7280 }))
      post.position.set(x, 0.6, 0); add(post)
    }
    for (const y of [0.4, 0.95]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x9ca3af }))
      rail.position.set(0, y, 0); add(rail)
    }
  } else if (kind === "gate") {
    for (const x of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x475569 }))
      post.position.set(x, 1.1, 0); add(post)
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x64748b }))
    bar.position.y = 2.1; add(bar)
  } else if (kind === "door") {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
    for (const x of [-0.55, 0.55]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.2), frameMat)
      jamb.position.set(x, 1.05, 0); add(jamb)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.2), frameMat)
    lintel.position.y = 2.1; add(lintel)
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2, 0.06), new THREE.MeshStandardMaterial({ color: 0x9a6a3a }))
    leaf.position.set(0, 1, 0); add(leaf)
  } else if (kind === "stairs") {
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.4), stepMat)
      step.position.set(0, 0.125 + i * 0.25, -i * 0.4); add(step)
    }
  } else if (kind === "bin") {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x4b5563 }))
    b.position.y = 0.4; add(b)
  } else if (kind === "canopy") {
    for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x9ca3af }))
      post.position.set(x, 1.2, z); add(post)
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7 }))
    top.position.y = 2.45; add(top)
  } else if (kind === "table") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xb98a5a }))
    top.position.y = 0.75; add(top)
    for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b7280 }))
      leg.position.set(x, 0.375, z); add(leg)
    }
  } else if (kind === "chair") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x6366f1 }))
    seat.position.y = 0.45; add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x6366f1 }))
    back.position.set(0, 0.7, -0.21); add(back)
  } else if (kind === "cabinet") {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.5), new THREE.MeshStandardMaterial({ color: 0xa1887f }))
    c.position.y = 0.9; add(c)
  } else if (kind === "sofa") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x475569 })); seat.position.y = 0.4; add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.25), new THREE.MeshStandardMaterial({ color: 0x334155 })); back.position.set(0, 0.7, -0.35); add(back)
    for (const x of [-1.05, 1.05]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.9), new THREE.MeshStandardMaterial({ color: 0x334155 })); arm.position.set(x, 0.5, 0); add(arm) }
  } else if (kind === "shelf") {
    const frame = new THREE.MeshStandardMaterial({ color: 0x9a6a3a })
    for (const y of [0.3, 0.9, 1.5, 2.1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), frame); sh.position.set(0, y, 0); add(sh) }
    for (const x of [-0.67, 0.67]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.4), frame); side.position.set(x, 1.05, 0); add(side) }
  } else if (kind === "reception") {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x6d4c41 })); desk.position.y = 0.55; add(desk)
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0xd6d3d1 })); top.position.set(0, 1.15, 0.2); add(top)
  } else if (kind === "partition") {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.06), new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.35 })); glass.position.y = 1.2; add(glass)
    for (const x of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x94a3b8 })); post.position.set(x, 1.2, 0); add(post) }
  } else if (kind === "stall") {
    const matW = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    for (const [w, d, x, z] of [[1.2, 0.1, 0, -0.6], [0.1, 1.2, -0.6, 0], [0.1, 1.2, 0.6, 0]] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), matW); p.position.set(x, 1, z); add(p)
    }
  } else if (kind === "window") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x94a3b8 })); frame.position.y = 1.6; add(frame)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 })); glass.position.set(0, 1.6, 0.05); add(glass)
  } else if (kind === "radiator") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.1), new THREE.MeshStandardMaterial({ color: 0xf8fafc })); body.position.y = 0.5; add(body)
    for (let i = 0; i < 7; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })); fin.position.set(-0.45 + i * 0.15, 0.5, 0); add(fin) }
  } else if (kind === "halfwall") {
    const w = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xe5e7eb })); w.position.y = 0.6; add(w)
  } else if (kind === "toilet") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xffffff })); base.position.y = 0.2; add(base)
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff })); tank.position.set(0, 0.55, -0.25); add(tank)
  } else if (kind === "urinal") {
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff })); u.position.y = 1; add(u)
  } else if (kind === "sink") {
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.45), new THREE.MeshStandardMaterial({ color: 0xffffff })); basin.position.y = 0.85; add(basin)
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.85, 12), new THREE.MeshStandardMaterial({ color: 0xffffff })); ped.position.y = 0.42; add(ped)
  } else if (kind === "spruce") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x6b4423 })); trunk.position.y = 0.4; add(trunk)
    for (let i = 0; i < 3; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - i * 0.3, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x2f6e3f })); cone.position.y = 1 + i * 0.9; add(cone) }
  } else if (kind === "birch") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 })); trunk.position.y = 1.1; add(trunk)
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0x86c34a })); crown.position.y = 2.6; add(crown)
  } else if (kind === "mast") {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 8), new THREE.MeshStandardMaterial({ color: 0x9ca3af })); mast.position.y = 2.5; add(mast)
    for (const h of [3, 3.6, 4.2]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x9ca3af })); arm.position.y = h; add(arm) }
  } else if (kind === "parking") {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.04, 5), new THREE.MeshStandardMaterial({ color: 0x3f3f46 })); pad.position.y = 0.02; pad.receiveShadow = true; add(pad)
    for (const x of [-1.2, 1.2]) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 5), new THREE.MeshStandardMaterial({ color: 0xffffff })); line.position.set(x, 0.04, 0); add(line) }
  } else if (kind === "road") {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0x52525b })); pad.position.y = 0.02; pad.receiveShadow = true; add(pad)
    for (let i = 0; i < 4; i++) { const dash = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 1), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); dash.position.set(0, 0.04, -3 + i * 2); add(dash) }
  } else {
    // tree
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }))
    trunk.position.y = 0.7; add(trunk)
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2e7d32 }))
    crown.position.y = 2; add(crown)
  }
  return g
}

import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { type SpaceInfo, STATUS_FILL, detectStatus } from "@/components/floor/floor-view"
import {
  buildFloorGroup,
  disposeObject,
  makeLabel,
  WALL_COLOR,
  WALL_SELECTED,
} from "@/components/floor/floor-three-builder"
import { formatMoney } from "@/lib/utils"

/**
 * 3D-вид здания целиком «как в Sims»: этажи стопкой с перекрытиями и крышей,
 * территория (парковка/двор) — зелёная площадка рядом, выбор этажа делает срез
 * (этажи выше скрываются), клик по комнате — карточка помещения.
 * Чистый three.js (без fiber — см. комментарий в floor-3d.tsx).
 */

export type BuildingFloor3D = {
  id: string
  name: string
  number: number
  kind: string
  ratePerSqm: number
  layout: FloorLayoutV2 | null
  spaces: SpaceInfo[]
}

const SLAB = 0.3
const STATUS_RU: Record<string, string> = {
  VACANT: "Свободно",
  OCCUPIED: "Занято",
  MAINTENANCE: "Обслуживание",
  UNLINKED: "Не привязано",
  DEBT: "Долг",
  OVERDUE: "Просрочка",
}

function floorHeight(layout: FloorLayoutV2 | null): number {
  return layout?.ceilingHeight && layout.ceilingHeight > 1 ? layout.ceilingHeight : 3
}

/**
 * Простая 3D-модель объекта зоны по его названию (антенна, камера, щит, дерево,
 * машина) — чтобы крыша/территория выглядели «как в Sims», а не столбиками.
 * Статусом красится подставка под моделью; сама модель — нейтральные материалы.
 */
function buildObjectModel(name: string, statusHex: string): THREE.Group {
  const g = new THREE.Group()
  const n = name.toLowerCase()
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af })
  const dark = new THREE.MeshStandardMaterial({ color: 0x475569 })
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m) }

  // Подставка статуса (свободно/занято/долг)
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(statusHex) }),
  )
  pad.position.y = 0.05
  pad.receiveShadow = true
  g.add(pad)

  if (/антенн|мачт|вышк|beeline|altel|tele2|kcell|связ/.test(n)) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), metal)
    mast.position.y = 2.1; add(mast)
    for (const h of [2.6, 3.1, 3.6]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), metal)
      arm.position.y = h; add(arm)
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI), dark)
    dish.position.set(0.4, 2, 0); dish.rotation.z = Math.PI / 2; add(dish)
  } else if (/камер|сергек|видео|cctv/.test(n)) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), metal)
    pole.position.y = 1.1; add(pole)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), dark)
    head.position.set(0.15, 2.1, 0); add(head)
  } else if (/щит|реклам|баннер|billboard|вывеск/.test(n)) {
    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 8), metal)
      post.position.set(x, 1, 0); add(post)
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.1), dark)
    panel.position.y = 2.4; add(panel)
  } else if (/дерев|tree|озелен|клумб|куст/.test(n)) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }))
    trunk.position.y = 0.6; add(trunk)
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4caf50 }))
    crown.position.y = 1.7; add(crown)
  } else if (/парков|машин|авто|car|parking|стоянк/.test(n)) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.95), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }))
    body.position.y = 0.45; add(body)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 0.85), dark)
    cabin.position.set(-0.1, 0.85, 0); add(cabin)
  } else {
    // Прочее оборудование — короб
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal)
    box.position.y = 0.55; add(box)
  }
  return g
}

export default function Building3D({
  buildingId,
  buildingName,
  floors,
  decor = [],
  onDecorChanged,
}: {
  buildingId?: string
  buildingName: string
  floors: BuildingFloor3D[]
  decor?: Decor3D[]
  onDecorChanged?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // "all" — всё здание; иначе id активного этажа/территории (срез)
  const [active, setActive] = useState<string>("all")
  // «Кукольный домик»: снять крышу и смотреть в верхний этаж сверху (стены остаются).
  const [roofOff, setRoofOff] = useState(false)
  const [selected, setSelected] = useState<{ floorId: string; elId: string } | null>(null)
  // Режим расстановки: объекты можно таскать мышью по земле/крыше.
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(editMode)
  useEffect(() => { editModeRef.current = editMode }, [editMode])
  // Режим рисования стены: два клика — начало и конец, между ними строится стена.
  const [drawWall, setDrawWall] = useState(false)
  const drawWallRef = useRef(drawWall)
  const wallStartRef = useRef<THREE.Vector3 | null>(null)
  useEffect(() => { drawWallRef.current = drawWall; if (!drawWall) wallStartRef.current = null }, [drawWall])
  // Стабильные ссылки на проп-зависимости, используемые внутри сцены-эффекта,
  // чтобы не пересобирать сцену на каждый рендер (onDecorChanged меняется часто).
  const buildingIdRef = useRef(buildingId)
  const onDecorChangedRef = useRef(onDecorChanged)
  useEffect(() => { buildingIdRef.current = buildingId; onDecorChangedRef.current = onDecorChanged })
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null)
  const wallMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map())
  const objectModelsRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const decorModelsRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  // Камера/контролы наружу — для пресетов вида (сверху/спереди/изометрия).
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const sceneMetricsRef = useRef<{ span: number; top: number } | null>(null)
  // Стек обратных операций для «Отменить» (add→delete, move→restore pos, и т.п.).
  const undoStackRef = useRef<Array<{ label: string; undo: () => Promise<unknown> }>>([])
  const [canUndo, setCanUndo] = useState(false)

  // Обычные этажи — стопкой; крыши — площадкой поверх здания; территории — рядом.
  const regular = useMemo(
    () => floors.filter((f) => f.kind !== "TERRITORY" && f.kind !== "ROOF").sort((a, b) => a.number - b.number),
    [floors],
  )
  const roofs = useMemo(() => floors.filter((f) => f.kind === "ROOF"), [floors])
  const territories = useMemo(() => floors.filter((f) => f.kind === "TERRITORY"), [floors])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false // защита от добавления асинхронно-загруженных моделей после размонтирования

    // ── Геометрия уровней ──
    // Наземные этажи (номер ≥ 1) — стопкой вверх от земли; цоколь/подвал
    // (номер ≤ 0) — вниз под землю. Число 0 ближе к поверхности, далее −1, −2…
    const dims = (f: BuildingFloor3D) => ({ w: f.layout?.width ?? 30, h: f.layout?.height ?? 20, ceil: floorHeight(f.layout) })
    const aboveground = regular.filter((f) => f.number >= 1)
    const basements = regular.filter((f) => f.number <= 0)
    const maxW = Math.max(30, ...regular.map((f) => dims(f).w))
    const maxH = Math.max(20, ...regular.map((f) => dims(f).h))
    const baseYById = new Map<string, number>()
    let y = SLAB
    for (const f of aboveground) { baseYById.set(f.id, y); y += dims(f).ceil + SLAB }
    const buildingTop = aboveground.length > 0 ? y : SLAB
    let yb = 0
    for (const f of [...basements].sort((a, b) => b.number - a.number)) {
      const ceil = dims(f).ceil
      baseYById.set(f.id, yb - ceil)
      yb = yb - ceil - SLAB
    }
    const topFloor = aboveground[aboveground.length - 1]

    const activeBaseY = baseYById.get(active)
    const cutaway = activeBaseY !== undefined
    const basementActive = cutaway && (activeBaseY as number) < 0

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xd6eaff)
    scene.fog = new THREE.Fog(0xd6eaff, 120, 320)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000)
    const camDist = Math.max(maxW, maxH, buildingTop) * 1.4 + 10
    camera.position.set(camDist * 0.8, Math.max(buildingTop * 1.2, camDist * 0.55), camDist * 0.9)
    cameraRef.current = camera
    sceneMetricsRef.current = { span: camDist, top: buildingTop }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(container.clientWidth, container.clientHeight)
    labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none"
    container.appendChild(labelRenderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, cutaway ? (activeBaseY as number) + 1.5 : buildingTop / 3, 0)
    controls.maxPolarAngle = Math.PI / 2.05
    controls.minDistance = 6
    controls.maxDistance = camDist * 2.2
    controls.enableDamping = true
    // Тач: один палец — орбита, два — зум/пан; не даём странице скроллиться.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    renderer.domElement.style.touchAction = "none"
    controlsRef.current = controls

    if (cameraStateRef.current) {
      camera.position.copy(cameraStateRef.current.position)
      controls.target.copy(cameraStateRef.current.target)
    }

    // ── Свет ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xfff7e0, 1.6)
    sun.position.set(-40, 60, -25)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const span = Math.max(maxW, maxH) * 1.6 + 30
    sun.shadow.camera.left = -span
    sun.shadow.camera.right = span
    sun.shadow.camera.top = span
    sun.shadow.camera.bottom = -span
    sun.shadow.camera.far = 220
    scene.add(sun)

    // ── Газон (земля) ── При просмотре подземного уровня землю и плиту прячем,
    // чтобы заглянуть в цоколь/подвал.
    if (!basementActive) {
      const territoriesW = territories.reduce((acc, t) => acc + (t.layout?.width ?? 20) + 3, 0)
      const groundSize = Math.max(maxW, maxH) * 2 + territoriesW * 2 + 40
      // polygonOffset разносит совпадающие плоскости по буферу глубины (без ряби):
      // газон уходит дальше всех, асфальт территории — выше, площадка — ещё выше.
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(groundSize, groundSize),
        new THREE.MeshStandardMaterial({ color: 0x9bc97f, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.05
      ground.receiveShadow = true
      scene.add(ground)

      // Площадка под зданием (бетон) — верх заметно выше асфальта территории.
      const plaza = new THREE.Mesh(
        new THREE.BoxGeometry(maxW + 4, 0.08, maxH + 4),
        new THREE.MeshStandardMaterial({ color: 0xd6d3d1 }),
      )
      plaza.position.y = 0.04
      plaza.receiveShadow = true
      scene.add(plaza)
    }

    // Сетка-привязка (1 м) — видна только в режиме расстановки. Уровень = активный
    // (этаж/крыша/земля), чтобы привязка совпадала с плоскостью перетаскивания.
    const gridSize = Math.ceil(Math.max(maxW, maxH) * 1.5 + 20)
    const grid = new THREE.GridHelper(gridSize, gridSize, 0x64748b, 0xcbd5e1)
    grid.position.y = cutaway ? (activeBaseY as number) + 0.02 : 0.03
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.35
    grid.visible = editModeRef.current
    scene.add(grid)

    const clickable: THREE.Object3D[] = []
    const wallMaterials = wallMaterialsRef.current
    wallMaterials.clear()
    const objectModels = objectModelsRef.current
    objectModels.clear()
    const decorModels = decorModelsRef.current
    decorModels.clear()

    const slabMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4 })

    // Объекты зоны (крыша/территория) без плана: раскладываем маркеры сеткой.
    // Маркер — цветной по статусу столбик + подпись, кликабельный (как комната).
    const placeObjectMarkers = (
      zone: BuildingFloor3D,
      // cx/cz/w/h — зона авто-раскладки; b* — центр и границы для drag/сохранения
      // (если заданы — объект можно таскать по всему участку, а не только по сетке).
      origin: { cx: number; cz: number; w: number; h: number; y: number; bx?: number; bz?: number; bhw?: number; bhh?: number },
    ) => {
      const objects = zone.spaces.filter((s) => isObjectSpace(s.kind))
      if (objects.length === 0) return
      const refCx = origin.bx ?? origin.cx
      const refCz = origin.bz ?? origin.cz
      const refHW = origin.bhw ?? origin.w / 2
      const refHH = origin.bhh ?? origin.h / 2
      const cols = Math.ceil(Math.sqrt(objects.length))
      const rows = Math.ceil(objects.length / cols)
      const stepX = origin.w / (cols + 1)
      const stepZ = origin.h / (rows + 1)
      objects.forEach((sp, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        // Сохранённая позиция (смещение от центра участка) или авто-сетка.
        const hasPos = typeof sp.posX === "number" && typeof sp.posZ === "number"
        const x = hasPos ? refCx + (sp.posX as number) : origin.cx - origin.w / 2 + stepX * (col + 1)
        const z = hasPos ? refCz + (sp.posZ as number) : origin.cz - origin.h / 2 + stepZ * (row + 1)
        const statusHex = STATUS_FILL[detectStatus(sp)] ?? "#94a3b8"
        const model = buildObjectModel(sp.number, statusHex)
        model.position.set(x, origin.y, z)
        model.rotation.y = ((sp.posRot ?? 0) * Math.PI) / 180
        objectModels.set(sp.id, model)
        // Клик по любой части модели открывает карточку объекта.
        model.traverse((o) => {
          o.userData.elId = sp.id
          o.userData.floorId = zone.id
        })
        // Метаданные для перетаскивания: id объекта, центр участка, базовый Y, границы.
        model.userData.spaceId = sp.id
        model.userData.zoneCx = refCx
        model.userData.zoneCz = refCz
        model.userData.baseY = origin.y
        model.userData.halfW = refHW
        model.userData.halfH = refHH
        // Подпись — дочерняя, чтобы двигалась вместе с моделью при перетаскивании.
        const label = makeLabel(sp.number)
        label.position.set(0, 4, 0)
        model.add(label)
        scene.add(model)
        clickable.push(model)
      })
    }

    // ── Этажи стопкой (наземные + подземные) ──
    regular.forEach((floor) => {
      const { ceil } = dims(floor)
      const baseY = baseYById.get(floor.id) ?? SLAB
      const isActive = active === floor.id
      // Этажи без плана используют общий периметр здания (maxW × maxH), чтобы вся
      // стопка была одинаково ориентирована — без «каши» из вытянутых по-разному коробок.
      const fw = floor.layout ? floor.layout.width : maxW
      const fh = floor.layout ? floor.layout.height : maxH
      // Срез: скрываем всё, что выше активного уровня.
      const hidden = cutaway && baseY > (activeBaseY as number) + 0.01
      if (hidden) return

      // Перекрытие под этажом
      const slab = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.6, SLAB, fh + 0.6), slabMat)
      slab.position.set(0, baseY - SLAB / 2, 0)
      slab.castShadow = true
      slab.receiveShadow = true
      scene.add(slab)

      if (!floor.layout) {
        // Этаж без плана: коробка-оболочка с настоящими стенами по периметру.
        // 4 стеновые панели (общий периметр) — у здания видны стены, этаж — «вид сверху».
        const t = 0.3
        const wallOpacity = cutaway && !isActive ? 0.45 : 0.9
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: wallOpacity })
        const wall = (ww: number, dd: number, x: number, z: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(ww, ceil, dd), wallMat)
          m.position.set(x, baseY + ceil / 2, z)
          m.castShadow = true
          m.receiveShadow = true
          scene.add(m)
        }
        wall(fw, t, 0, -fh / 2 + t / 2) // задняя
        wall(fw, t, 0, fh / 2 - t / 2) // передняя
        wall(t, fh, -fw / 2 + t / 2, 0) // левая
        wall(t, fh, fw / 2 - t / 2, 0) // правая
        if (isActive || !cutaway) {
          const label = makeLabel(floor.name, "план не настроен")
          label.position.set(0, baseY + ceil / 2, 0)
          scene.add(label)
        }
        return
      }

      const built = buildFloorGroup(floor.layout, floor.spaces, {
        labels: isActive ? "full" : "none",
        wallOpacityScale: cutaway && !isActive ? 0.55 : 1,
        shadows: isActive || !cutaway,
      })
      built.group.position.set(-floor.layout.width / 2, baseY, -floor.layout.height / 2)
      // Каждой комнате — отметка этажа, чтобы клик знал откуда она
      for (const obj of built.clickable) {
        obj.userData.floorId = floor.id
        clickable.push(obj)
      }
      for (const [elId, mat] of built.wallMaterials) wallMaterials.set(elId, mat)
      scene.add(built.group)
    })

    // ── Крыша (только в режиме всего здания) ──
    // Кровля повторяет периметр верхнего этажа; этаж без плана = общий периметр (maxW/maxH).
    const roofW = topFloor ? (topFloor.layout ? dims(topFloor).w : maxW) : maxW
    const roofH = topFloor ? (topFloor.layout ? dims(topFloor).h : maxH) : maxH
    const hasTop = aboveground.length > 0 || roofs.length > 0
    // Снятая крыша (roofOff) — смотрим в верхний этаж сверху, стены остаются.
    if (!cutaway && hasTop && !roofOff) {
      // Плита кровли
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(roofW + 0.8, SLAB, roofH + 0.8),
        new THREE.MeshStandardMaterial({ color: 0xa8a29e }),
      )
      roof.position.set(0, buildingTop - SLAB / 2, 0)
      roof.castShadow = true
      roof.receiveShadow = true
      scene.add(roof)

      // Парапет по периметру — кровля выглядит как настоящая.
      const pw = roofW + 0.8
      const pd = roofH + 0.8
      const parH = 0.8
      const t = 0.3
      const parMat = new THREE.MeshStandardMaterial({ color: 0x8d8580 })
      const parapet = (w: number, d: number, x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, parH, d), parMat)
        m.position.set(x, buildingTop + parH / 2, z)
        m.castShadow = true
        scene.add(m)
      }
      parapet(pw, t, 0, -pd / 2 + t / 2)
      parapet(pw, t, 0, pd / 2 - t / 2)
      parapet(t, pd, -pw / 2 + t / 2, 0)
      parapet(t, pd, pw / 2 - t / 2, 0)
    }

    // ── Крыша-зона: план (тех. зоны) поверх здания + объекты (антенны/щиты) ──
    if (!cutaway) {
      for (const roofZone of roofs) {
        if (roofZone.layout) {
          const built = buildFloorGroup(roofZone.layout, roofZone.spaces, { labels: "none", flat: true, shadows: true })
          built.group.position.set(-roofZone.layout.width / 2, buildingTop + 0.04, -roofZone.layout.height / 2)
          for (const obj of built.clickable) {
            obj.userData.floorId = roofZone.id
            clickable.push(obj)
          }
          for (const [elId, mat] of built.wallMaterials) wallMaterials.set(elId, mat)
          scene.add(built.group)
        }
        placeObjectMarkers(roofZone, { cx: 0, cz: 0, w: roofW, h: roofH, y: buildingTop })
      }
    }

    // ── Территории ──
    // Первая территория — «участок вокруг здания»: асфальт по периметру, здание
    // стоит в центре, объекты ставятся вокруг (как в Sims). Остальные — площадками сбоку.
    const ring = Math.max(10, territories[0]?.layout?.width ?? 18)
    const lotHalfW = maxW / 2 + ring
    const lotHalfD = maxH / 2 + ring
    let offsetX = lotHalfW + 3
    territories.forEach((terr, idx) => {
      const tw = terr.layout?.width ?? 20
      const th = terr.layout?.height ?? 15
      const isActive = active === terr.id

      if (idx === 0) {
        // Асфальт участка вокруг здания — верх ниже площадки, polygonOffset между
        // газоном и площадкой, чтобы плоскости не совпадали (без z-fighting/ряби).
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(lotHalfW * 2, 0.04, lotHalfD * 2),
          new THREE.MeshStandardMaterial({ color: 0xb8b5b2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
        )
        pad.position.set(0, 0, 0)
        pad.receiveShadow = true
        scene.add(pad)

        if (terr.layout) {
          // Нарисованный план (парковочные ряды) — блоком перед зданием.
          const built = buildFloorGroup(terr.layout, terr.spaces, { labels: isActive ? "full" : "none", flat: true, shadows: true })
          built.group.position.set(-terr.layout.width / 2, 0.05, maxH / 2 + 2)
          for (const obj of built.clickable) { obj.userData.floorId = terr.id; clickable.push(obj) }
          for (const [elId, mat] of built.wallMaterials) wallMaterials.set(elId, mat)
          scene.add(built.group)
        } else {
          // Объекты раскладываем полосой перед зданием, но таскать можно по всему участку.
          placeObjectMarkers(terr, {
            cx: 0, cz: maxH / 2 + ring / 2, w: maxW + ring, h: ring, y: 0.05,
            bx: 0, bz: 0, bhw: lotHalfW, bhh: lotHalfD,
          })
        }
        const tLabel = makeLabel(terr.name)
        tLabel.position.set(0, 0.8, lotHalfD + 0.5)
        scene.add(tLabel)
        return
      }

      // Доп. территории — площадками сбоку
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(tw + 1, 0.05, th + 1),
        new THREE.MeshStandardMaterial({ color: 0xb8b5b2 }),
      )
      pad.position.set(offsetX + tw / 2, 0.02, 0)
      pad.receiveShadow = true
      scene.add(pad)

      if (terr.layout) {
        const built = buildFloorGroup(terr.layout, terr.spaces, { labels: isActive ? "full" : "none", flat: true, shadows: true })
        built.group.position.set(offsetX, 0.05, -th / 2)
        for (const obj of built.clickable) { obj.userData.floorId = terr.id; clickable.push(obj) }
        for (const [elId, mat] of built.wallMaterials) wallMaterials.set(elId, mat)
        scene.add(built.group)
      } else {
        placeObjectMarkers(terr, { cx: offsetX + tw / 2, cz: 0, w: tw, h: th, y: 0.05 })
      }

      const tLabel = makeLabel(terr.name)
      tLabel.position.set(offsetX + tw / 2, 0.8, th / 2 + 0.5)
      scene.add(tLabel)
      offsetX += tw + 3
    })

    // ── Предметы строительного редактора: на земле/крыше/конкретном этаже ──
    const levelY = (d: Decor3D): number => {
      const lvl = d.level ?? (d.onRoof ? "roof" : "ground")
      if (lvl === "roof") return buildingTop
      if (lvl === "ground") return 0
      const by = baseYById.get(lvl)
      if (by !== undefined) return by
      if (roofs.some((r) => r.id === lvl)) return buildingTop
      return 0
    }
    let glbLoaderP: Promise<typeof import("three/examples/jsm/loaders/GLTFLoader.js")> | null = null
    for (const d of decor) {
      const dy = levelY(d)
      // Срез: прячем предметы выше активного уровня.
      if (cutaway && dy > (activeBaseY as number) + 0.01) continue
      const s = d.scale && d.scale > 0 ? d.scale : 1

      if (d.kind === "custom" && d.modelUrl) {
        // Импортированная модель (GLB) — загружаем асинхронно в группу-контейнер.
        const group = new THREE.Group()
        group.position.set(d.x, dy, d.z)
        group.rotation.y = ((d.rot ?? 0) * Math.PI) / 180
        group.scale.setScalar(s)
        group.userData.decorId = d.id
        decorModels.set(d.id, group)
        scene.add(group)
        clickable.push(group)
        const url = d.modelUrl
        if (!glbLoaderP) glbLoaderP = import("three/examples/jsm/loaders/GLTFLoader.js")
        void glbLoaderP.then(({ GLTFLoader }) => {
          new GLTFLoader().load(
            url,
            (gltf) => {
              if (disposed) return
              gltf.scene.traverse((o) => {
                o.userData.decorId = d.id
                if (o instanceof THREE.Mesh) o.castShadow = true
              })
              group.add(gltf.scene)
            },
            undefined,
            () => { /* ошибка загрузки — пропускаем */ },
          )
        })
        continue
      }

      if (d.kind === "wallrun") {
        // Нарисованная стена: длина d.len по локальной оси X, поворот rot вокруг Y.
        const len = d.len && d.len > 0 ? d.len : 1
        const group = new THREE.Group()
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(len, 2.6, 0.2),
          new THREE.MeshStandardMaterial({ color: 0xe5e7eb }),
        )
        wall.position.y = 1.3
        wall.castShadow = true
        wall.receiveShadow = true
        group.add(wall)
        group.position.set(d.x, dy, d.z)
        group.rotation.y = ((d.rot ?? 0) * Math.PI) / 180
        group.traverse((o) => { o.userData.decorId = d.id })
        decorModels.set(d.id, group)
        scene.add(group)
        clickable.push(group)
        continue
      }

      const model = buildDecorModel(d.kind)
      model.scale.setScalar(s)
      model.position.set(d.x, dy, d.z)
      model.rotation.y = ((d.rot ?? 0) * Math.PI) / 180
      model.traverse((o) => { o.userData.decorId = d.id })
      decorModels.set(d.id, model)
      scene.add(model)
      clickable.push(model)
    }

    // ── Клик по комнате / перетаскивание объекта (режим расстановки) ──
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    let dragging: THREE.Object3D | null = null
    let dragStartPos: THREE.Vector3 | null = null
    const dragPlane = new THREE.Plane()
    const dragPoint = new THREE.Vector3()

    const setPointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }
    // Поднимается вверх по дереву до модели объекта/декора (spaceId или decorId).
    const findObjectRoot = (o: THREE.Object3D | null): THREE.Object3D | null => {
      let t = o
      while (t && !t.userData.spaceId && !t.userData.decorId) t = t.parent
      return t
    }

    // ── Рисование стены: проекция кликов на горизонт активного уровня ──
    const wallLevel = roofs.some((r) => r.id === active) ? "roof" : (baseYById.has(active) ? active : "ground")
    const wallPlaneY = wallLevel === "roof" ? buildingTop : (baseYById.get(active) ?? 0)
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -wallPlaneY)
    const previewGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const previewLine = new THREE.Line(previewGeo, new THREE.LineBasicMaterial({ color: 0x2563eb }))
    previewLine.visible = false
    scene.add(previewLine)
    const projectToWallPlane = (e: PointerEvent): THREE.Vector3 | null => {
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      const p = new THREE.Vector3()
      return raycaster.ray.intersectPlane(wallPlane, p) ? p : null
    }
    // Концы существующих стен на этом уровне — для привязки углов (join).
    const wallEnds: THREE.Vector3[] = []
    for (const d of decor) {
      if (d.kind !== "wallrun") continue
      if ((d.level ?? (d.onRoof ? "roof" : "ground")) !== wallLevel) continue
      const r = ((d.rot ?? 0) * Math.PI) / 180
      const hx = (Math.cos(r) * (d.len ?? 0)) / 2
      const hz = (-Math.sin(r) * (d.len ?? 0)) / 2
      wallEnds.push(new THREE.Vector3(d.x + hx, wallPlaneY, d.z + hz), new THREE.Vector3(d.x - hx, wallPlaneY, d.z - hz))
    }
    const SNAP_GRID = (v: number) => Math.round(v * 2) / 2
    // Привязка точки: сначала к концу другой стены (≤0.8 м), иначе к сетке 0.5 м;
    // если задана точка start — угол отрезка привязывается к ближайшим 15°.
    const snapWallPoint = (raw: THREE.Vector3, start: THREE.Vector3 | null): THREE.Vector3 => {
      let best: THREE.Vector3 | null = null
      let bestD = 0.8
      for (const e of wallEnds) {
        const dd = Math.hypot(e.x - raw.x, e.z - raw.z)
        if (dd < bestD) { bestD = dd; best = e }
      }
      if (best) return new THREE.Vector3(best.x, wallPlaneY + 0.05, best.z)
      if (start) {
        const vx = raw.x - start.x, vz = raw.z - start.z
        const dist = Math.max(0.5, SNAP_GRID(Math.hypot(vx, vz)))
        const step = Math.PI / 12 // 15°
        const ang = Math.round(Math.atan2(vz, vx) / step) * step
        return new THREE.Vector3(start.x + dist * Math.cos(ang), wallPlaneY + 0.05, start.z + dist * Math.sin(ang))
      }
      return new THREE.Vector3(SNAP_GRID(raw.x), wallPlaneY + 0.05, SNAP_GRID(raw.z))
    }

    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      if (drawWallRef.current) return // в режиме рисования стены не таскаем предметы
      if (!editModeRef.current) return
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(clickable, true)[0]?.object ?? null
      const root = findObjectRoot(hit)
      if (root) {
        dragging = root
        dragStartPos = root.position.clone()
        controls.enabled = false
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), root.position.clone())
      }
    }
    const onMove = (e: PointerEvent) => {
      if (drawWallRef.current) {
        // Предпросмотр: линия от первой точки к курсору (привязка к углам/сетке/15°).
        const start = wallStartRef.current
        if (start) {
          const p = projectToWallPlane(e)
          if (p) {
            previewGeo.setFromPoints([start, snapWallPoint(p, start)])
            previewGeo.attributes.position.needsUpdate = true
            previewLine.visible = true
          }
        }
        return
      }
      if (!dragging) return
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        // Привязка к сетке 0.5 м — аккуратное размещение.
        const snap = (v: number) => Math.round(v * 2) / 2
        if (dragging.userData.decorId) {
          // Декор — двигается свободно по земле, без границ зоны.
          dragging.position.x = snap(dragPoint.x)
          dragging.position.z = snap(dragPoint.z)
        } else {
          const cx = dragging.userData.zoneCx as number
          const cz = dragging.userData.zoneCz as number
          const hw = (dragging.userData.halfW as number) ?? 50
          const hh = (dragging.userData.halfH as number) ?? 50
          dragging.position.x = snap(Math.max(cx - hw, Math.min(cx + hw, dragPoint.x)))
          dragging.position.z = snap(Math.max(cz - hh, Math.min(cz + hh, dragPoint.z)))
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      // ── Рисование стены двумя кликами ──
      if (drawWallRef.current) {
        const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 0
        if (moved > 5) return // это вращение камеры, не клик
        const rawP = projectToWallPlane(e)
        if (!rawP) return
        if (!wallStartRef.current) {
          // Первая точка: привязка к существующему углу или сетке.
          wallStartRef.current = snapWallPoint(rawP, null)
          toast.success("Кликните вторую точку стены")
          return
        }
        const start = wallStartRef.current
        const end = snapWallPoint(rawP, start)
        const px = end.x, pz = end.z
        wallStartRef.current = null
        previewLine.visible = false
        const dx = px - start.x, dz = pz - start.z
        const len = Math.hypot(dx, dz)
        const bId = buildingIdRef.current
        if (len < 0.5 || !bId) return
        const cx = (px + start.x) / 2, cz = (pz + start.z) / 2
        const angle = (Math.atan2(-dz, dx) * 180) / Math.PI
        void addWallSegment(bId, Math.round(cx * 100) / 100, Math.round(cz * 100) / 100, Math.round(len * 100) / 100, angle, wallLevel)
          .then((r) => { if (r?.id) { undoStackRef.current.push({ label: "стену", undo: () => deleteBuildingDecor(r.id) }); setCanUndo(true) } toast.success("Стена добавлена"); onDecorChangedRef.current?.() })
          .catch(() => toast.error("Не удалось добавить стену"))
        return
      }
      if (dragging) {
        const obj = dragging
        const startPos = dragStartPos
        dragging = null
        dragStartPos = null
        controls.enabled = true
        const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 0
        // Декор: выделяем и сохраняем мировую позицию.
        if (obj.userData.decorId) {
          const decorId = obj.userData.decorId as string
          setSelectedDecorId(decorId)
          setSelected(null)
          if (moved <= 5) return
          const dx = Math.round(obj.position.x * 100) / 100
          const dz = Math.round(obj.position.z * 100) / 100
          if (startPos) {
            const ox = Math.round(startPos.x * 100) / 100, oz = Math.round(startPos.z * 100) / 100
            undoStackRef.current.push({ label: "перемещение", undo: () => setDecorPosition(decorId, ox, oz) })
            setCanUndo(true)
          }
          void setDecorPosition(decorId, dx, dz)
            .then(() => toast.success("Позиция сохранена"))
            .catch(() => toast.error("Не удалось сохранить позицию"))
          return
        }
        // Выделяем объект — чтобы показать панель «Повернуть/Удалить».
        setSelected({ floorId: obj.userData.floorId as string, elId: obj.userData.elId as string })
        setSelectedDecorId(null)
        if (moved <= 5) return // это клик, не перетаскивание — позиция не менялась
        const spaceId = obj.userData.spaceId as string
        const offX = Math.round((obj.position.x - (obj.userData.zoneCx as number)) * 100) / 100
        const offZ = Math.round((obj.position.z - (obj.userData.zoneCz as number)) * 100) / 100
        void setObjectPosition(spaceId, offX, offZ)
          .then(() => toast.success("Позиция объекта сохранена"))
          .catch(() => toast.error("Не удалось сохранить позицию"))
        return
      }
      // Обычный клик (выбор) — только если курсор почти не двигался.
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(clickable, true)
      let target: THREE.Object3D | null = hits[0]?.object ?? null
      while (target && !target.userData.elId) target = target.parent
      setSelected(target
        ? { floorId: target.userData.floorId as string, elId: target.userData.elId as string }
        : null)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("pointerup", onUp)

    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      // Сетка следует за режимом расстановки без пересборки сцены.
      if (grid.visible !== editModeRef.current) grid.visible = editModeRef.current
      // Превью стены гасим, когда вышли из режима рисования.
      if (!drawWallRef.current && previewLine.visible) previewLine.visible = false
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      labelRenderer.setSize(w, h)
    })
    ro.observe(container)

    return () => {
      disposed = true
      cameraStateRef.current = { position: camera.position.clone(), target: controls.target.clone() }
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      renderer.dispose()
      disposeObject(scene)
      container.innerHTML = ""
      wallMaterials.clear()
    }
  }, [regular, roofs, territories, decor, active, roofOff])

  // Подсветка выбранной комнаты
  useEffect(() => {
    for (const [elId, mat] of wallMaterialsRef.current) {
      mat.color.setHex(elId === selected?.elId ? WALL_SELECTED : WALL_COLOR)
    }
  }, [selected])

  const selectedFloor = selected ? floors.find((f) => f.id === selected.floorId) : null
  const selectedEl = selectedFloor?.layout?.elements.find((e) => e.id === selected?.elId)
  const selectedSpace = selectedEl && "spaceId" in selectedEl && selectedEl.spaceId
    ? selectedFloor?.spaces.find((s) => s.id === selectedEl.spaceId)
    // Объекты крыши/территории кликаются напрямую — userData.elId = space.id.
    : selectedFloor?.spaces.find((s) => s.id === selected?.elId)
  const selectedIsObject = !!selectedSpace && isObjectSpace(selectedSpace.kind)

  // Повернуть выбранный объект на +45° (читаем текущий угол прямо из модели).
  const rotateSelectedObject = () => {
    if (!selectedSpace) return
    const model = objectModelsRef.current.get(selectedSpace.id)
    if (!model) return
    model.rotation.y += Math.PI / 4
    const deg = Math.round((model.rotation.y * 180) / Math.PI)
    void setObjectRotation(selectedSpace.id, deg).catch(() => toast.error("Не удалось сохранить поворот"))
  }
  const deleteSelectedObject = () => {
    if (!selectedSpace) return
    if (!window.confirm(`Удалить объект «${selectedSpace.number}»?`)) return
    void deleteSpace(selectedSpace.id)
      .then(() => { toast.success("Объект удалён"); window.location.reload() })
      .catch(() => toast.error("Не удалось удалить"))
  }

  // Декор спавнится перед зданием (по глубине обычных этажей), потом перетаскивается.
  const footprintDepth = useMemo(
    () => Math.max(20, ...regular.map((f) => f.layout?.height ?? 20)),
    [regular],
  )
  // Уровень, на который кладём предмет: активный этаж/крыша, иначе земля.
  const currentLevel = (): string => {
    if (roofs.some((r) => r.id === active)) return "roof"
    if (regular.some((f) => f.id === active)) return active
    return "ground"
  }
  const recordUndo = (label: string, undo: () => Promise<unknown>) => { undoStackRef.current.push({ label, undo }); setCanUndo(true) }
  const addItem = (kind: string) => {
    if (!buildingId) return
    const level = currentLevel()
    const n = decor.length
    const spawnX = ((n % 5) - 2) * 2.5
    const spawnZ = level === "ground" ? footprintDepth / 2 + 5 + Math.floor(n / 5) * 2.5 : ((Math.floor(n / 5) % 3) - 1) * 3
    void addBuildingDecor(buildingId, kind, spawnX, spawnZ, level)
      .then((r) => { if (r?.id) recordUndo("добавление", () => deleteBuildingDecor(r.id)); toast.success("Добавлено — перетащите на место"); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось добавить"))
  }
  const duplicateSelectedDecor = () => {
    if (!selectedDecorId) return
    void duplicateBuildingDecor(selectedDecorId)
      .then((r) => { if (r?.id) recordUndo("копию", () => deleteBuildingDecor(r.id)); toast.success("Копия создана"); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось дублировать"))
  }
  // Отменить — применяет обратную операцию к последнему действию.
  const undoLast = () => {
    const entry = undoStackRef.current.pop()
    setCanUndo(undoStackRef.current.length > 0)
    if (!entry) return
    void entry.undo()
      .then(() => { setSelectedDecorId(null); toast.success(`Отменено: ${entry.label}`); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось отменить"))
  }
  // Пресеты вида камеры: сверху / спереди / изометрия.
  const setView = (view: "top" | "front" | "iso") => {
    const cam = cameraRef.current, ctr = controlsRef.current, m = sceneMetricsRef.current
    if (!cam || !ctr || !m) return
    const d = m.span
    if (view === "top") { cam.position.set(0.01, d * 1.4, 0.01); ctr.target.set(0, 0, 0) }
    else if (view === "front") { cam.position.set(0, Math.max(m.top * 0.6, d * 0.4), d * 1.15); ctr.target.set(0, Math.max(m.top / 3, 1), 0) }
    else { cam.position.set(d * 0.8, Math.max(m.top * 1.2, d * 0.55), d * 0.9); ctr.target.set(0, m.top / 3, 0) }
    ctr.update()
  }
  const rotateSelectedDecor = (deg = 45) => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const model = decorModelsRef.current.get(id)
    if (!model) return
    const oldDeg = Math.round((model.rotation.y * 180) / Math.PI)
    model.rotation.y += (deg * Math.PI) / 180
    recordUndo("поворот", () => setDecorRotation(id, oldDeg))
    void setDecorRotation(id, Math.round((model.rotation.y * 180) / Math.PI)).catch(() => toast.error("Не удалось сохранить поворот"))
  }
  const scaleSelectedDecor = (factor: number) => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const model = decorModelsRef.current.get(id)
    if (!model) return
    const oldScale = Math.round(model.scale.x * 100) / 100
    const next = Math.max(0.3, Math.min(5, model.scale.x * factor))
    model.scale.setScalar(next)
    recordUndo("размер", () => setDecorScale(id, oldScale))
    void setDecorScale(id, Math.round(next * 100) / 100).catch(() => toast.error("Не удалось сохранить размер"))
  }
  // Перемещение предмета между уровнями (этаж/улица/крыша).
  const levelOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: "ground", label: "Территория / улица" }]
    if (roofs.length > 0 || regular.some((f) => f.number >= 1)) opts.push({ value: "roof", label: "Крыша" })
    for (const f of [...regular].sort((a, b) => b.number - a.number)) opts.push({ value: f.id, label: f.name })
    return opts
  }, [regular, roofs])
  const selectedDecor = decor.find((d) => d.id === selectedDecorId) ?? null
  const selectedDecorLevel = selectedDecor?.level ?? "ground"
  // Варианты материала для выбранного предмета (если он из семейства).
  const selectedMaterialOptions = selectedDecor ? materialOptions(selectedDecor.kind) : []
  const moveSelectedDecorToLevel = (level: string) => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const oldLevel = selectedDecor?.level ?? "ground"
    recordUndo("уровень", () => setDecorLevel(id, oldLevel))
    void setDecorLevel(id, level)
      .then(() => { toast.success("Перемещено на уровень"); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось переместить"))
  }
  // Перекрасить/сменить материал выбранного предмета.
  const recolorSelectedDecor = (kind: string) => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const oldKind = selectedDecor?.kind
    if (oldKind) recordUndo("материал", () => setDecorKind(id, oldKind))
    void setDecorKind(id, kind)
      .then(() => { toast.success("Материал изменён"); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось изменить"))
  }
  // Задать точную длину выбранной стены (м).
  const applyWallLen = (raw: string) => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const v = parseFloat(raw.replace(",", "."))
    if (!Number.isFinite(v)) return
    const oldLen = selectedDecor?.len ?? 1
    recordUndo("длину", () => setDecorLen(id, oldLen))
    void setDecorLen(id, v)
      .then(() => { toast.success("Длина обновлена"); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось изменить длину"))
  }
  // Переместить предмет на соседний уровень (этаж выше/ниже, без мышиного 3D).
  const moveSelectedDecorStep = (dir: 1 | -1) => {
    if (!selectedDecorId) return
    const idx = levelOptions.findIndex((o) => o.value === selectedDecorLevel)
    const next = levelOptions[idx + dir]
    if (!next) { toast.message?.("Дальше некуда"); return }
    moveSelectedDecorToLevel(next.value)
  }
  // Импорт модели из других программ (GLB/GLTF из SketchUp/Blender и т.п.).
  const importModel = (file: File) => {
    if (!buildingId) return
    if (file.size > 8 * 1024 * 1024) { toast.error("Файл больше 8 МБ"); return }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const level = currentLevel()
      const n = decor.length
      const spawnX = ((n % 5) - 2) * 2.5
      const spawnZ = level === "ground" ? footprintDepth / 2 + 5 : 0
      void fetch(`/api/admin/buildings/${buildingId}/import-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, fileName: file.name, level, x: spawnX, z: spawnZ }),
      })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? "Ошибка"); toast.success("Модель импортирована — перетащите на место"); onDecorChanged?.() })
        .catch((e) => toast.error(e instanceof Error ? e.message : "Не удалось импортировать"))
    }
    reader.readAsDataURL(file)
  }
  const deleteSelectedDecor = () => {
    if (!selectedDecorId) return
    const id = selectedDecorId
    const d = selectedDecor
    const bId = buildingId
    if (d && bId) {
      // Обратная операция — воссоздать предмет с теми же параметрами.
      recordUndo("удаление", () => recreateDecor(bId, {
        kind: d.kind, x: d.x, z: d.z, rot: d.rot, scale: d.scale ?? 1,
        len: d.len ?? 0, level: d.level ?? "ground", onRoof: !!d.onRoof, modelUrl: d.modelUrl ?? null,
      }))
    }
    void deleteBuildingDecor(id)
      .then(() => { toast.success("Декор удалён"); setSelectedDecorId(null); onDecorChanged?.() })
      .catch(() => toast.error("Не удалось удалить"))
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Пресеты вида камеры: сверху / спереди / изометрия */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <button type="button" onClick={() => setView("top")} title="Вид сверху" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <ArrowUpFromLine className="h-3.5 w-3.5" /> Сверху
        </button>
        <button type="button" onClick={() => setView("front")} title="Вид спереди" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <Square className="h-3.5 w-3.5" /> Спереди
        </button>
        <button type="button" onClick={() => setView("iso")} title="Изометрия" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <Eye className="h-3.5 w-3.5" /> 3D
        </button>
      </div>

      {/* Режим расстановки объектов (перетаскивание мышью) */}
      <button
        type="button"
        onClick={() => { setEditMode((v) => !v); setSelected(null); setSelectedDecorId(null); setDrawWall(false) }}
        className={`absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors ${
          editMode
            ? "border-emerald-500 bg-emerald-600 text-white"
            : "border-slate-200 bg-white/95 text-slate-700 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
        }`}
        title="Перетаскивайте объекты крыши/территории мышью по поверхности"
      >
        <Move className="h-4 w-4" />
        {editMode ? "Готово" : "Расставить объекты"}
      </button>
      {editMode && (
        <div className="absolute right-3 top-14 z-10 w-56 space-y-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-[11px] text-emerald-800 shadow backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            {drawWall ? "Рисование стены: кликните начало, затем конец стены." : "Тащите объект или декор мышью — позиция сохранится автоматически."}
          </div>
          <button
            type="button"
            onClick={() => { setDrawWall((v) => !v); setSelected(null); setSelectedDecorId(null) }}
            title="Рисовать стену двумя кликами на активном уровне"
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow transition-colors ${
              drawWall
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <PencilRuler className="h-3.5 w-3.5" />
            {drawWall ? "Рисую стену… (стоп)" : "Рисовать стену"}
          </button>
          {canUndo && (
            <button
              type="button"
              onClick={undoLast}
              title="Отменить последнее действие (добавление/перемещение/поворот/материал/удаление)"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 shadow hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <Undo2 className="h-3.5 w-3.5" /> Отменить действие
            </button>
          )}
          {buildingId && (
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-2 shadow backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <p className="px-1 pb-1 text-[10px] text-slate-500 dark:text-slate-400">
                Кладём на: <b className="text-slate-700 dark:text-slate-200">{currentLevel() === "roof" ? "крышу" : currentLevel() === "ground" ? "территорию" : "выбранный этаж"}</b>
                <span className="text-slate-400"> (меняется выбором уровня слева)</span>
              </p>
              {ITEM_CATEGORIES.map((cat) => (
                <div key={cat.title}>
                  <p className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cat.title}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {cat.items.map((it) => (
                      <button
                        key={it.kind}
                        type="button"
                        onClick={() => addItem(it.kind)}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Импорт</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importModel(f); e.target.value = "" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Загрузить .glb / .gltf из SketchUp, Blender и т.п."
                className="w-full rounded-md border border-violet-300 bg-violet-50 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
              >
                Импорт модели (GLB)
              </button>
            </div>
          )}
          {selectedDecorId && (
            <div className="rounded-lg border border-slate-200 bg-white/95 p-2 shadow backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Выбранный предмет</p>
              {selectedDecor && (
                <p className="px-1 pb-1 text-[10px] text-slate-500 dark:text-slate-400">
                  X {selectedDecor.x.toFixed(1)} · Z {selectedDecor.z.toFixed(1)} м
                  {selectedDecor.kind === "wallrun" && selectedDecor.len ? <> · длина {selectedDecor.len.toFixed(1)} м</> : null}
                </p>
              )}
              {selectedDecor?.kind === "wallrun" && (
                <label className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-600 dark:text-slate-300">
                  Длина, м
                  <input
                    type="number" step="0.5" min="0.5" max="100"
                    defaultValue={selectedDecor.len ?? 1}
                    key={selectedDecorId + ":" + (selectedDecor.len ?? 1)}
                    onBlur={(e) => applyWallLen(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                    className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </label>
              )}
              {selectedMaterialOptions.length > 0 && (
                <div className="mb-1.5">
                  <p className="px-1 pb-0.5 text-[10px] text-slate-400">Материал</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedMaterialOptions.map((m) => (
                      <button
                        key={m.kind}
                        type="button"
                        onClick={() => recolorSelectedDecor(m.kind)}
                        className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
                          selectedDecor?.kind === m.kind
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-1.5 flex items-center gap-1">
                <select
                  value={selectedDecorLevel}
                  onChange={(e) => moveSelectedDecorToLevel(e.target.value)}
                  title="Переместить на уровень"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" onClick={() => moveSelectedDecorStep(-1)} title="Уровень выше по списку" className="rounded-md border border-slate-200 px-1.5 py-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">↑</button>
                <button type="button" onClick={() => moveSelectedDecorStep(1)} title="Уровень ниже по списку" className="rounded-md border border-slate-200 px-1.5 py-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">↓</button>
              </div>
              <div className="mb-1 flex flex-wrap gap-1">
                <button type="button" onClick={() => rotateSelectedDecor(15)} title="Повернуть на 15°" className="flex flex-1 items-center justify-center gap-0.5 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <RotateCw className="h-3 w-3" /> 15°
                </button>
                <button type="button" onClick={() => rotateSelectedDecor(45)} title="Повернуть на 45°" className="flex flex-1 items-center justify-center gap-0.5 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <RotateCw className="h-3 w-3" /> 45°
                </button>
                <button type="button" onClick={() => scaleSelectedDecor(1.2)} title="Больше" className="flex flex-1 items-center justify-center rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => scaleSelectedDecor(1 / 1.2)} title="Меньше" className="flex flex-1 items-center justify-center rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={duplicateSelectedDecor} title="Дублировать" className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={deleteSelectedDecor} title="Удалить" className="flex flex-1 items-center justify-center rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Переключатель этажей (срез как в Sims): верхний этаж сверху */}
      <div className="absolute left-3 top-3 z-10 flex w-44 flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{buildingName}</p>
        <FloorButton
          active={active === "all"}
          icon={Building2}
          label="Здание целиком"
          onClick={() => { setActive("all"); setSelected(null) }}
        />
        {active === "all" && (
          <button
            type="button"
            onClick={() => setRoofOff((v) => !v)}
            title="Снять крышу и смотреть в верхний этаж сверху — стены остаются"
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              roofOff
                ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Scissors className="h-3.5 w-3.5" />
            {roofOff ? "Крыша снята" : "Снять крышу"}
          </button>
        )}
        {roofs.map((r) => (
          <FloorButton
            key={r.id}
            active={active === r.id}
            icon={BoxIcon}
            label={r.name}
            sub="крыша"
            onClick={() => { setActive(r.id); setSelected(null) }}
          />
        ))}
        {[...regular].sort((a, b) => b.number - a.number).map((f) => (
          <FloorButton
            key={f.id}
            active={active === f.id}
            icon={Layers}
            label={f.name}
            sub={f.number <= 0 ? "подземный" : f.layout ? undefined : "нет плана"}
            onClick={() => { setActive(f.id); setSelected(null) }}
          />
        ))}
        {territories.map((t) => (
          <FloorButton
            key={t.id}
            active={active === t.id}
            icon={Trees}
            label={t.name}
            onClick={() => { setActive(t.id); setSelected(null) }}
          />
        ))}
      </div>

      {/* Легенда */}
      <div className="absolute bottom-3 left-3 z-10 space-y-1 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: STATUS_FILL.VACANT }} /> Свободно</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: STATUS_FILL.OCCUPIED }} /> Занято</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: STATUS_FILL.DEBT }} /> Долг</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: STATUS_FILL.OVERDUE }} /> Просрочка</div>
      </div>

      {/* Карточка выбранного помещения */}
      {selectedSpace && selectedFloor && (
        <div className="absolute bottom-3 right-3 z-10 w-72 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedIsObject ? selectedSpace.number : `Каб. ${selectedSpace.number}`} · {selectedFloor.name}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Закрыть карточку помещения"
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 p-4 text-sm">
            {selectedIsObject ? (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Тип:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">Объект (без м²)</span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Площадь:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{selectedSpace.area} м²</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Статус:</span>
              <span className="font-medium">{STATUS_RU[detectStatus(selectedSpace)] ?? detectStatus(selectedSpace)}</span>
            </div>
            {selectedSpace.tenant ? (
              <>
                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <p className="mb-0.5 text-xs text-slate-400 dark:text-slate-500">Арендатор</p>
                  <Link href={`/admin/tenants/${selectedSpace.tenant.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                    {selectedSpace.tenant.companyName}
                  </Link>
                </div>
                {selectedSpace.tenant.debt > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Долг:</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{selectedSpace.tenant.debt.toLocaleString("ru-RU")} ₸</span>
                  </div>
                )}
              </>
            ) : (
              <p className="border-t border-slate-100 pt-2 text-xs italic text-slate-400 dark:border-slate-800 dark:text-slate-500">Помещение свободно</p>
            )}
            {!selectedIsObject && selectedFloor.ratePerSqm > 0 && (
              <div className="flex justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">
                  {selectedSpace.area} м² × {formatMoney(selectedFloor.ratePerSqm)}
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  = {formatMoney(Math.round(selectedSpace.area * selectedFloor.ratePerSqm))} / мес
                </span>
              </div>
            )}
            {editMode && selectedIsObject && (
              <div className="flex gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={rotateSelectedObject}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Повернуть
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedObject}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить
                </button>
              </div>
            )}
            <div className="flex gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              {selectedSpace.tenant ? (
                <Link
                  href={`/admin/tenants/${selectedSpace.tenant.id}`}
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  Подробнее
                </Link>
              ) : (
                <Link
                  href="/admin/tenants/new"
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Заселить
                </Link>
              )}
              <Link
                href={`/admin/floors/${selectedFloor.id}/visualization`}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Изменить план
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Подсказка управления */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/70 px-3 py-1 text-[10px] text-white backdrop-blur">
        ЛКМ — вращать · колесо — зум · ПКМ — двигать · клик по комнате — карточка
      </div>
    </div>
  )
}

function FloorButton({
  active,
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  active: boolean
  icon: React.ElementType
  label: string
  sub?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {sub && <span className={`ml-auto shrink-0 text-[9px] ${active ? "text-slate-300 dark:text-slate-600" : "text-slate-400"}`}>{sub}</span>}
    </button>
  )
}
