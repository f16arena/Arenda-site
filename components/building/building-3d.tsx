"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import { X, Layers, Building2, Trees, Box as BoxIcon } from "lucide-react"
import { isObjectSpace } from "@/lib/zone-kinds"
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

export default function Building3D({
  buildingName,
  floors,
}: {
  buildingName: string
  floors: BuildingFloor3D[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // "all" — всё здание; иначе id активного этажа/территории (срез)
  const [active, setActive] = useState<string>("all")
  const [selected, setSelected] = useState<{ floorId: string; elId: string } | null>(null)
  const wallMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map())
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)

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

    // ── Геометрия уровней ──
    const sizes = regular.map((f) => ({
      w: f.layout?.width ?? 30,
      h: f.layout?.height ?? 20,
      ceil: floorHeight(f.layout),
    }))
    const maxW = Math.max(30, ...sizes.map((s) => s.w))
    const maxH = Math.max(20, ...sizes.map((s) => s.h))
    const levels: number[] = []
    let y = SLAB
    for (const s of sizes) {
      levels.push(y)
      y += s.ceil + SLAB
    }
    const buildingTop = y

    const activeIdx = regular.findIndex((f) => f.id === active)
    const cutaway = activeIdx >= 0

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xd6eaff)
    scene.fog = new THREE.Fog(0xd6eaff, 120, 320)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000)
    const camDist = Math.max(maxW, maxH, buildingTop) * 1.4 + 10
    camera.position.set(camDist * 0.8, Math.max(buildingTop * 1.2, camDist * 0.55), camDist * 0.9)

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
    controls.target.set(0, cutaway ? levels[activeIdx] : buildingTop / 3, 0)
    controls.maxPolarAngle = Math.PI / 2.05
    controls.minDistance = 6
    controls.maxDistance = camDist * 2.2
    controls.enableDamping = true

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

    // ── Газон (земля) ──
    const territoriesW = territories.reduce((acc, t) => acc + (t.layout?.width ?? 20) + 3, 0)
    const groundSize = Math.max(maxW, maxH) * 2 + territoriesW * 2 + 40
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: 0x9bc97f }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    ground.receiveShadow = true
    scene.add(ground)

    // Площадка под зданием (бетон)
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(maxW + 4, 0.06, maxH + 4),
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1 }),
    )
    plaza.position.y = 0.01
    plaza.receiveShadow = true
    scene.add(plaza)

    const clickable: THREE.Object3D[] = []
    const wallMaterials = wallMaterialsRef.current
    wallMaterials.clear()

    const slabMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4 })

    // Объекты зоны (крыша/территория) без плана: раскладываем маркеры сеткой.
    // Маркер — цветной по статусу столбик + подпись, кликабельный (как комната).
    const placeObjectMarkers = (
      zone: BuildingFloor3D,
      origin: { cx: number; cz: number; w: number; h: number; y: number },
    ) => {
      const objects = zone.spaces.filter((s) => isObjectSpace(s.kind))
      if (objects.length === 0) return
      const cols = Math.ceil(Math.sqrt(objects.length))
      const rows = Math.ceil(objects.length / cols)
      const stepX = origin.w / (cols + 1)
      const stepZ = origin.h / (rows + 1)
      objects.forEach((sp, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = origin.cx - origin.w / 2 + stepX * (col + 1)
        const z = origin.cz - origin.h / 2 + stepZ * (row + 1)
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(STATUS_FILL[detectStatus(sp)] ?? "#94a3b8") })
        const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 12), mat)
        marker.position.set(x, origin.y + 0.8, z)
        marker.castShadow = true
        marker.userData.elId = sp.id
        marker.userData.floorId = zone.id
        scene.add(marker)
        clickable.push(marker)
        wallMaterials.set(sp.id, mat)
        const label = makeLabel(sp.number)
        label.position.set(x, origin.y + 2, z)
        scene.add(label)
      })
    }

    // ── Этажи стопкой ──
    regular.forEach((floor, i) => {
      const { w, h, ceil } = sizes[i]
      const baseY = levels[i]
      const isActive = active === floor.id
      const hidden = cutaway && i > activeIdx
      if (hidden) return

      // Перекрытие под этажом
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, SLAB, h + 0.6), slabMat)
      slab.position.set(0, baseY - SLAB / 2, 0)
      slab.castShadow = true
      slab.receiveShadow = true
      scene.add(slab)

      if (!floor.layout) {
        // Этаж без плана: полупрозрачная коробка-заглушка
        const stub = new THREE.Mesh(
          new THREE.BoxGeometry(w, ceil, h),
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.25 }),
        )
        stub.position.set(0, baseY + ceil / 2, 0)
        scene.add(stub)
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
    const roofW = sizes.length > 0 ? sizes[sizes.length - 1].w : 30
    const roofH = sizes.length > 0 ? sizes[sizes.length - 1].h : 20
    if (!cutaway && regular.length > 0) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(roofW + 0.8, SLAB, roofH + 0.8),
        new THREE.MeshStandardMaterial({ color: 0xa8a29e }),
      )
      roof.position.set(0, buildingTop - SLAB / 2, 0)
      roof.castShadow = true
      scene.add(roof)
    }

    // ── Объекты на крыше (зоны ROOF): антенны/щиты поверх здания ──
    if (!cutaway) {
      for (const roofZone of roofs) {
        placeObjectMarkers(roofZone, { cx: 0, cz: 0, w: roofW, h: roofH, y: buildingTop })
      }
    }

    // ── Территории: площадки рядом со зданием ──
    let offsetX = maxW / 2 + 3
    for (const terr of territories) {
      const tw = terr.layout?.width ?? 20
      const th = terr.layout?.height ?? 15
      const isActive = active === terr.id

      // Асфальт территории
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(tw + 1, 0.05, th + 1),
        new THREE.MeshStandardMaterial({ color: 0xb8b5b2 }),
      )
      pad.position.set(offsetX + tw / 2, 0.02, 0)
      pad.receiveShadow = true
      scene.add(pad)

      if (terr.layout) {
        const built = buildFloorGroup(terr.layout, terr.spaces, {
          labels: isActive ? "full" : "none",
          flat: true,
          shadows: true,
        })
        built.group.position.set(offsetX, 0.05, -th / 2)
        for (const obj of built.clickable) {
          obj.userData.floorId = terr.id
          clickable.push(obj)
        }
        for (const [elId, mat] of built.wallMaterials) wallMaterials.set(elId, mat)
        scene.add(built.group)
      } else {
        // Без плана — объекты территории (парковки, веранды) маркерами сеткой.
        placeObjectMarkers(terr, { cx: offsetX + tw / 2, cz: 0, w: tw, h: th, y: 0.05 })
      }

      const tLabel = makeLabel(terr.name)
      tLabel.position.set(offsetX + tw / 2, 0.8, th / 2 + 0.5)
      scene.add(tLabel)

      offsetX += tw + 3
    }

    // ── Клик по комнате ──
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
      setSelected(target
        ? { floorId: target.userData.floorId as string, elId: target.userData.elId as string }
        : null)
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
      cameraStateRef.current = { position: camera.position.clone(), target: controls.target.clone() }
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      renderer.dispose()
      disposeObject(scene)
      container.innerHTML = ""
      wallMaterials.clear()
    }
  }, [regular, roofs, territories, active])

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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Переключатель этажей (срез как в Sims): верхний этаж сверху */}
      <div className="absolute left-3 top-3 z-10 flex w-44 flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{buildingName}</p>
        <FloorButton
          active={active === "all"}
          icon={Building2}
          label="Здание целиком"
          onClick={() => { setActive("all"); setSelected(null) }}
        />
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
        {[...regular].reverse().map((f) => (
          <FloorButton
            key={f.id}
            active={active === f.id}
            icon={Layers}
            label={f.name}
            sub={f.layout ? undefined : "нет плана"}
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
