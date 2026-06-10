"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { type SpaceInfo, STATUS_FILL, detectStatus } from "./floor-view"

/**
 * 3D-вид этажа на чистом three.js: генерируется автоматически из 2D-плана
 * (FloorLayoutV2) — полы комнат красятся по статусу, периметры выдавливаются
 * в стены на высоту потолка, подписи — CSS2D, клик по комнате выбирает её
 * (popup рисует floor-view). Вращение/зум — мышью (OrbitControls).
 *
 * Сознательно БЕЗ @react-three/fiber: он глобально расширяет JSX.IntrinsicElements
 * three-элементами и ломает типизацию `<Icon className>` по всему проекту.
 */

type Pt = { x: number; y: number }

const WALL_THICKNESS = 0.12
const WALL_COLOR = 0xcbd5e1
const WALL_SELECTED = 0x3b82f6
const COMMON_FILL = "#e2e8f0"

function roomPoints(el: Record<string, unknown>): Pt[] | null {
  if (el.type === "rect") {
    const { x, y, width, height } = el as { x: number; y: number; width: number; height: number }
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]
  }
  if (el.type === "polygon") {
    const points = (el as { points?: Pt[] }).points
    return points && points.length >= 3 ? points : null
  }
  return null
}

function makeLabel(title: string, sub?: string): CSS2DObject {
  const div = document.createElement("div")
  div.style.cssText = "pointer-events:none;text-align:center;font-family:Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,0.9)"
  div.innerHTML = `<div style="font-size:12px;font-weight:700;color:#0f172a">${title}</div>${sub ? `<div style="font-size:10px;color:#475569">${sub}</div>` : ""}`
  return new CSS2DObject(div)
}

function addWall(
  group: THREE.Group,
  p1: Pt,
  p2: Pt,
  height: number,
  material: THREE.MeshStandardMaterial,
) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, WALL_THICKNESS), material)
  mesh.position.set((p1.x + p2.x) / 2, height / 2, (p1.y + p2.y) / 2)
  mesh.rotation.y = -Math.atan2(dy, dx)
  group.add(mesh)
}

export default function Floor3D({
  layout,
  spaces,
  selectedId,
  onSelect,
}: {
  layout: FloorLayoutV2
  spaces: SpaceInfo[]
  selectedId: string | null
  onSelect: (elementId: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Материалы стен по elId — для подсветки выбранной комнаты без пересборки сцены.
  const wallMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map())
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const H = layout.ceilingHeight && layout.ceilingHeight > 1 ? layout.ceilingHeight : 3
    const cx = layout.width / 2
    const cz = layout.height / 2
    const camDist = Math.max(layout.width, layout.height) * 1.1 + 6

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf1f5f9)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.set(cx, camDist * 0.7, cz + camDist * 0.85)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(container.clientWidth, container.clientHeight)
    labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none"
    container.appendChild(labelRenderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(cx, 0, cz)
    controls.maxPolarAngle = Math.PI / 2.05
    controls.minDistance = 4
    controls.maxDistance = camDist * 2
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(cx - 20, 30, cz - 15)
    scene.add(sun)

    // Основание этажа
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.width + 6, layout.height + 6),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(cx, -0.01, cz)
    scene.add(ground)

    const clickable: THREE.Object3D[] = []
    const wallMaterials = wallMaterialsRef.current
    wallMaterials.clear()

    for (const el of layout.elements) {
      const rec = el as unknown as Record<string, unknown>

      // ── Комнаты (rect/polygon): пол по статусу + стены по периметру ──
      const points = roomPoints(rec)
      if (points) {
        const spaceId = rec.spaceId as string | undefined
        const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined
        const common = rec.kind === "common"
        const fill = common ? COMMON_FILL : STATUS_FILL[detectStatus(space)] ?? "#f8fafc"

        const group = new THREE.Group()
        group.userData.elId = el.id
        group.userData.selectable = !!space

        const shape = new THREE.Shape()
        shape.moveTo(points[0].x, -points[0].y)
        for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].y)
        shape.closePath()
        const floor = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(fill), side: THREE.DoubleSide }),
        )
        floor.rotation.x = -Math.PI / 2
        floor.position.y = 0.02
        group.add(floor)

        const wallMat = new THREE.MeshStandardMaterial({
          color: WALL_COLOR,
          transparent: true,
          opacity: common ? 0.5 : 0.85,
        })
        if (space) wallMaterials.set(el.id, wallMat)
        const wallH = common ? Math.min(H, 1.2) : H
        for (let i = 0; i < points.length; i++) {
          addWall(group, points[i], points[(i + 1) % points.length], wallH, wallMat)
        }

        const c = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 })
        const title = space ? `Каб. ${space.number}` : (rec.label as string) || (common ? "Общая зона" : "")
        const sub = space ? (space.tenant ? space.tenant.companyName : `${space.area} м² · свободно`) : undefined
        if (title) {
          const label = makeLabel(title, sub)
          label.position.set(c.x, 0.4, c.y)
          group.add(label)
        }

        scene.add(group)
        if (space) clickable.push(group)
        continue
      }

      // ── Отдельно нарисованные стены ──
      if (rec.type === "wall") {
        const w = rec as { x1: number; y1: number; x2: number; y2: number; thickness?: number }
        const mat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.9 })
        addWall(scene as unknown as THREE.Group, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }, H, mat)
        continue
      }

      // ── Иконки: лестницы/лифты/туалеты — блок с подписью ──
      if (rec.type === "icon") {
        const ic = rec as { x: number; y: number; size: number; kind: string; label?: string }
        const labels: Record<string, string> = { stairs: "Лестница", elevator: "Лифт", toilet: "WC", kitchen: "Кухня", parking: "P" }
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(ic.size, 1, ic.size),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.7 }),
        )
        block.position.set(ic.x, 0.5, ic.y)
        scene.add(block)
        const label = makeLabel(ic.label || labels[ic.kind] || ic.kind)
        label.position.set(ic.x, 1.3, ic.y)
        scene.add(label)
      }
    }

    // ── Клик по комнате (raycast; игнорируем перетаскивание камеры) ──
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(clickable, true)
      let target: THREE.Object3D | null = hits[0]?.object ?? null
      while (target && !target.userData.elId) target = target.parent
      onSelectRef.current(target?.userData.elId ?? null)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointerup", onUp)

    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
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
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
      })
      container.innerHTML = ""
      wallMaterials.clear()
    }
    // Сцена пересобирается при смене плана/данных; выбор подсвечивается отдельным эффектом.
  }, [layout, spaces])

  // Подсветка выбранной комнаты — меняем цвет её стен без пересборки сцены.
  useEffect(() => {
    for (const [elId, mat] of wallMaterialsRef.current) {
      mat.color.setHex(elId === selectedId ? WALL_SELECTED : WALL_COLOR)
      mat.setValues({ opacity: elId === selectedId ? 0.95 : 0.85 })
    }
  }, [selectedId])

  return <div ref={containerRef} className="absolute inset-0" />
}
