"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import type { SpaceInfo } from "./floor-view"
import {
  buildFloorGroup,
  disposeObject,
  WALL_COLOR,
  WALL_SELECTED,
} from "./floor-three-builder"

/**
 * 3D-вид этажа на чистом three.js: генерируется автоматически из 2D-плана
 * (FloorLayoutV2) — полы комнат красятся по статусу, периметры выдавливаются
 * в стены, двери/окна/лестницы объёмные, подписи — CSS2D, клик по комнате
 * выбирает её. Вращение/зум — мышью (OrbitControls).
 *
 * В режиме editable комнаты и иконки можно перетаскивать прямо в 3D —
 * перемещение коммитится через onMoveElement(id, dx, dy) в метрах плана.
 *
 * Сознательно БЕЗ @react-three/fiber: он глобально расширяет JSX.IntrinsicElements
 * three-элементами и ломает типизацию `<Icon className>` по всему проекту.
 */

const SNAP_M = 0.25

export default function Floor3D({
  layout,
  spaces,
  selectedId,
  onSelect,
  editable = false,
  onMoveElement,
}: {
  layout: FloorLayoutV2
  spaces: SpaceInfo[]
  selectedId: string | null
  onSelect: (elementId: string | null) => void
  /** Разрешить перетаскивание комнат/иконок прямо в 3D (режим редактора) */
  editable?: boolean
  /** Коммит перемещения элемента (метры плана, со снапом 0.25 м) */
  onMoveElement?: (elementId: string, dx: number, dy: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Материалы стен по elId — для подсветки выбранной комнаты без пересборки сцены.
  const wallMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map())
  const onSelectRef = useRef(onSelect)
  const onMoveRef = useRef(onMoveElement)
  // Камера переживает пересборку сцены (иначе каждый коммит drag-а сбрасывал бы вид).
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  useEffect(() => {
    onSelectRef.current = onSelect
    onMoveRef.current = onMoveElement
  }, [onSelect, onMoveElement])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
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

    // Восстановить камеру после пересборки (drag-коммит меняет layout → сцена пересоздаётся)
    if (cameraStateRef.current) {
      camera.position.copy(cameraStateRef.current.position)
      controls.target.copy(cameraStateRef.current.target)
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const sun = new THREE.DirectionalLight(0xffffff, 1.5)
    sun.position.set(cx - 20, 30, cz - 15)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const span = Math.max(layout.width, layout.height) * 0.75 + 5
    sun.shadow.camera.left = -span
    sun.shadow.camera.right = span
    sun.shadow.camera.top = span
    sun.shadow.camera.bottom = -span
    sun.shadow.camera.far = 120
    sun.target.position.set(cx, 0, cz)
    scene.add(sun)
    scene.add(sun.target)

    // Основание этажа
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.width + 6, layout.height + 6),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(cx, -0.01, cz)
    ground.receiveShadow = true
    scene.add(ground)

    const built = buildFloorGroup(layout, spaces, { editable, shadows: true })
    scene.add(built.group)
    const wallMaterials = wallMaterialsRef.current
    wallMaterials.clear()
    for (const [k, v] of built.wallMaterials) wallMaterials.set(k, v)

    // ── Указатель: клик выбирает комнату, drag (editable) двигает комнату/иконку ──
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const planeHit = new THREE.Vector3()
    let downAt: { x: number; y: number } | null = null
    let drag: { obj: THREE.Object3D; elId: string; start: THREE.Vector3; base: THREE.Vector3 } | null = null

    const setPointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
    }

    const findTagged = (objs: THREE.Object3D[], flag: "selectable" | "draggable"): THREE.Object3D | null => {
      const hits = raycaster.intersectObjects(objs, true)
      for (const hit of hits) {
        let t: THREE.Object3D | null = hit.object
        while (t && !t.userData.elId) t = t.parent
        if (t && (flag === "selectable" ? t.userData.selectable || t.userData.draggable : t.userData.draggable)) return t
      }
      return null
    }

    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      if (!editable) return
      setPointer(e)
      const target = findTagged(built.draggable, "draggable")
      if (target && raycaster.ray.intersectPlane(dragPlane, planeHit)) {
        drag = {
          obj: target,
          elId: target.userData.elId as string,
          start: planeHit.clone(),
          base: target.position.clone(),
        }
        controls.enabled = false
        renderer.domElement.setPointerCapture(e.pointerId)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!drag) return
      setPointer(e)
      if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return
      drag.obj.position.x = drag.base.x + (planeHit.x - drag.start.x)
      drag.obj.position.z = drag.base.z + (planeHit.z - drag.start.z)
    }

    const onUp = (e: PointerEvent) => {
      if (drag) {
        const rawDx = drag.obj.position.x - drag.base.x
        const rawDy = drag.obj.position.z - drag.base.z
        const dx = Math.round(rawDx / SNAP_M) * SNAP_M
        const dy = Math.round(rawDy / SNAP_M) * SNAP_M
        const moved = Math.hypot(rawDx, rawDy) > 0.1
        const elId = drag.elId
        drag.obj.position.copy(drag.base)
        drag = null
        controls.enabled = true
        if (moved) {
          onMoveRef.current?.(elId, dx, dy)
          downAt = null
          return
        }
      }
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      setPointer(e)
      const target = findTagged(built.clickable, "selectable")
      onSelectRef.current(target?.userData.elId ?? null)
    }

    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointermove", onMove)
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
    // Сцена пересобирается при смене плана/данных; выбор подсвечивается отдельным эффектом.
  }, [layout, spaces, editable])

  // Подсветка выбранной комнаты — меняем цвет её стен без пересборки сцены.
  useEffect(() => {
    for (const [elId, mat] of wallMaterialsRef.current) {
      mat.color.setHex(elId === selectedId ? WALL_SELECTED : WALL_COLOR)
      mat.setValues({ opacity: elId === selectedId ? 0.95 : 0.85 })
    }
  }, [selectedId])

  return <div ref={containerRef} className="absolute inset-0" />
}
