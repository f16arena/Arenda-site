"use client"

// Объёмный режим: этажи стопкой, собранные из тех же планов (SPEC §5).
// Камера ортографическая, материалы плоские, тени не считаем — объём читается
// за счёт притемнённых боковин и тонких кромок, а не за счёт света. Так объём
// остаётся чертежом, а не скриншотом игры.

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import type { Box } from "@/lib/indoor-map/geometry"
import type { RoomView } from "@/lib/indoor-map/model"
import { PAPER } from "@/lib/indoor-map/tokens"
import { buildFloorVolume, buildSlab, elevationOf } from "./volume-geometry"

export type VolumeFloor = {
  id: string
  number: number
  name: string
  box: Box
  rooms: RoomView[]
}

type Props = {
  floors: VolumeFloor[]
  activeFloorId: string | null
  onPickFloor: (floorId: string) => void
  onPickRoom: (floorId: string, room: RoomView) => void
}

const ACTIVE_OPACITY = 1
const BELOW_OPACITY = 0.26

export function VolumeView({ floors, activeFloorId, onPickFloor, onPickRoom }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Свежие пропсы для обработчиков внутри сцены — сцена пересобирается только
  // при смене набора этажей, а клики должны знать актуальный активный этаж.
  const stateRef = useRef({ floors, activeFloorId, onPickFloor, onPickRoom })
  useEffect(() => {
    stateRef.current = { floors, activeFloorId, onPickFloor, onPickRoom }
  }, [floors, activeFloorId, onPickFloor, onPickRoom])

  useEffect(() => {
    const host = hostRef.current
    if (!host || floors.length === 0) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(new THREE.Color(PAPER.ground), 1)
    host.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.style.position = "absolute"
    labelRenderer.domElement.style.top = "0"
    labelRenderer.domElement.style.left = "0"
    labelRenderer.domElement.style.pointerEvents = "none"
    host.appendChild(labelRenderer.domElement)

    // Света в сцене нет вовсе: объём читается притемнёнными боковинами
    // (они уже зашиты в вершинные цвета) и кромками. Любой источник света
    // выбеливает пастельную палитру статусов и уводит цвета от плоской карты.
    const scene = new THREE.Scene()

    // Габариты всей стопки — по ним ставим камеру
    const box = floors.reduce<Box>(
      (acc, floor) => ({
        minX: Math.min(acc.minX, floor.box.minX),
        minY: Math.min(acc.minY, floor.box.minY),
        maxX: Math.max(acc.maxX, floor.box.maxX),
        maxY: Math.max(acc.maxY, floor.box.maxY),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -2000, 4000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.maxPolarAngle = Math.PI / 2.05 // под здание заглядывать не даём
    controls.minPolarAngle = 0.12

    type FloorNode = {
      id: string
      group: THREE.Group
      materials: THREE.Material[]
      edges: THREE.LineBasicMaterial | null
    }
    const nodes: FloorNode[] = []
    const disposables: Array<{ dispose: () => void }> = []
    const pickTargets: THREE.Mesh[] = []

    floors.forEach((floor, index) => {
      const volume = buildFloorVolume(floor.rooms)
      const group = new THREE.Group()
      group.position.y = elevationOf(index)
      group.userData.floorId = floor.id

      const slabGeometry = buildSlab(floor.box)
      const slabMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(PAPER.slab),
        transparent: true,
      })
      const slab = new THREE.Mesh(slabGeometry, slabMaterial)
      slab.userData.floorId = floor.id
      group.add(slab)
      disposables.push(slabGeometry, slabMaterial)
      pickTargets.push(slab)

      const node: FloorNode = { id: floor.id, group, materials: [slabMaterial], edges: null }

      if (volume) {
        const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true })
        const mesh = new THREE.Mesh(volume.rooms, material)
        mesh.userData.floorId = floor.id
        mesh.userData.triangleRoom = volume.triangleRoom
        group.add(mesh)
        pickTargets.push(mesh)
        node.materials.push(material)
        disposables.push(volume.rooms, material)

        const edgeMaterial = new THREE.LineBasicMaterial({
          color: new THREE.Color(PAPER.wall),
          transparent: true,
        })
        const edges = new THREE.LineSegments(volume.edges, edgeMaterial)
        group.add(edges)
        node.edges = edgeMaterial
        disposables.push(volume.edges, edgeMaterial)
      }

      // Номер этажа сбоку от плиты — как на ленте этажей
      const badge = document.createElement("div")
      badge.textContent = String(floor.number)
      badge.dataset.floorId = floor.id
      badge.className =
        "rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 shadow-sm"
      const label = new CSS2DObject(badge)
      label.position.set(box.minX - 2.5, 0.2, (floor.box.minY + floor.box.maxY) / 2)
      group.add(label)
      disposables.push({ dispose: () => badge.remove() })

      scene.add(group)
      nodes.push(node)
    })

    // Кадр считаем по фактическим габаритам собранной сцены, а не по догадкам:
    // так стопка любой этажности попадает в экран целиком.
    const bounds = new THREE.Box3().setFromObject(scene)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const reach = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z)
    camera.position.set(center.x + reach, center.y + reach * 0.8, center.z + reach)
    camera.lookAt(center)
    controls.target.copy(center)
    controls.update()
    camera.updateMatrixWorld()

    // Габариты в системе координат камеры — из них и берём размер кадра,
    // иначе здание либо тонет в пустоте, либо обрезается по краям.
    let halfX = 1
    let halfY = 1
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      ).applyMatrix4(camera.matrixWorldInverse)
      halfX = Math.max(halfX, Math.abs(corner.x))
      halfY = Math.max(halfY, Math.abs(corner.y))
    }

    function applyOpacity() {
      const active = stateRef.current.activeFloorId
      const activeIndex = nodes.findIndex((node) => node.id === active)
      nodes.forEach((node, index) => {
        // Выше выбранного этажа не рисуем ничего: полупрозрачные перекрытия
        // забивают тот этаж, ради которого пользователь и кликнул.
        if (activeIndex >= 0 && index > activeIndex) {
          node.group.visible = false
          return
        }
        node.group.visible = true
        const opacity = activeIndex < 0 || index === activeIndex ? ACTIVE_OPACITY : BELOW_OPACITY
        node.materials.forEach((material) => {
          if ("opacity" in material) {
            material.opacity = opacity
            material.transparent = opacity < 1
            material.depthWrite = opacity > 0.9
          }
        })
        if (node.edges) {
          node.edges.opacity = activeIndex < 0 ? 0.5 : index === activeIndex ? 0.6 : 0.12
        }
      })
    }
    applyOpacity()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt = { x: 0, y: 0 }

    function onPointerDown(event: PointerEvent) {
      downAt = { x: event.clientX, y: event.clientY }
    }

    function onPointerUp(event: PointerEvent) {
      if (Math.abs(event.clientX - downAt.x) > 3 || Math.abs(event.clientY - downAt.y) > 3) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickTargets, false)[0]
      if (!hit) return

      const floorId = hit.object.userData.floorId as string | undefined
      if (!floorId) return
      const { activeFloorId: active, floors: current } = stateRef.current

      if (floorId !== active) {
        stateRef.current.onPickFloor(floorId)
        return
      }
      const triangleRoom = hit.object.userData.triangleRoom as string[] | undefined
      const faceIndex = hit.faceIndex
      if (!triangleRoom || faceIndex === undefined || faceIndex === null) return
      const roomId = triangleRoom[faceIndex]
      const floor = current.find((item) => item.id === floorId)
      const room = floor?.rooms.find((item) => item.id === roomId)
      if (room) stateRef.current.onPickRoom(floorId, room)
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown)
    renderer.domElement.addEventListener("pointerup", onPointerUp)

    function resize() {
      const width = host!.clientWidth
      const height = host!.clientHeight
      if (width === 0 || height === 0) return
      const aspect = width / height
      const span = Math.max(halfY, halfX / aspect) * 1.06
      camera.left = -span * aspect
      camera.right = span * aspect
      camera.top = span
      camera.bottom = -span
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      labelRenderer.setSize(width, height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    let frame = 0
    let lastActive = stateRef.current.activeFloorId
    function tick() {
      frame = requestAnimationFrame(tick)
      if (stateRef.current.activeFloorId !== lastActive) {
        lastActive = stateRef.current.activeFloorId
        applyOpacity()
      }
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerup", onPointerUp)
      controls.dispose()
      disposables.forEach((item) => item.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
      nodes.length = 0
    }
  }, [floors])

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      style={{ background: PAPER.ground }}
    />
  )
}

export default VolumeView
