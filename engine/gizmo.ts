// ADR: Редактор-гизмо как самостоятельная обёртка над Babylon на ОТДЕЛЬНОМ
// UtilityLayerRenderer — гизмо не попадает в основной рендер/пики сцены и легко
// гасится через setMode. Снап (0.5 м / 15°) включён через snapDistance гизмо, а
// финальные значения дополнительно округляются в onChange, чтобы команда движка
// получала детерминированные позицию (метры Babylon) и поворот вокруг Y (градусы 0..360).

import {
  AbstractMesh,
  PositionGizmo,
  RotationGizmo,
  Scene,
  UtilityLayerRenderer,
  Vector3,
} from "@babylonjs/core";

/** Режим работы гизмо. `none` полностью скрывает гизмо. */
export type GizmoMode = "none" | "move" | "rotate";

/** Полезная нагрузка колбэка изменения: мировая позиция (м) и поворот вокруг Y (deg, 0..360). */
export interface GizmoChange {
  x: number;
  y: number;
  z: number;
  rotationYDeg: number;
}

/** Шаг привязки позиции, метры Babylon. */
const POSITION_SNAP_M = 0.5;
/** Шаг привязки поворота, градусы. */
const ROTATION_SNAP_DEG = 15;

const DEG_PER_RAD = 180 / Math.PI;

/** Округление до ближайшего кратного `step` (step > 0). */
function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Нормализация угла в диапазон [0, 360). */
function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Колбэк по умолчанию — no-op, чтобы вызов был безопасен до присвоения. */
const NOOP_ON_CHANGE: (t: GizmoChange) => void = () => {
  /* no-op */
};

export class GizmoController {
  private readonly utilityLayer: UtilityLayerRenderer;
  private readonly positionGizmo: PositionGizmo;
  private readonly rotationGizmo: RotationGizmo;

  private attachedMesh: AbstractMesh | null = null;
  private mode: GizmoMode = "none";
  private disposed = false;

  /** Вызывается по окончании перетаскивания (drag end) для move и rotate. */
  public onChange: (t: GizmoChange) => void = NOOP_ON_CHANGE;

  public constructor(scene: Scene) {
    this.utilityLayer = new UtilityLayerRenderer(scene);

    this.positionGizmo = new PositionGizmo(this.utilityLayer);
    this.rotationGizmo = new RotationGizmo(this.utilityLayer);

    // Снап на уровне самих гизмо: drag «прилипает» к сетке/углу.
    this.positionGizmo.snapDistance = POSITION_SNAP_M;
    this.rotationGizmo.snapDistance = (ROTATION_SNAP_DEG / DEG_PER_RAD);

    // Гизмо двигает/вращает реальный меш — движок читает узел в onChange.
    this.positionGizmo.updateGizmoPositionToMatchAttachedMesh = true;
    this.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = true;

    this.positionGizmo.onDragEndObservable.add(() => this.emitChange());
    this.rotationGizmo.onDragEndObservable.add(() => this.emitChange());

    // Стартовое состояние — оба выключены.
    this.applyMode();
  }

  /** Переключить режим. `none` прячет оба гизмо. */
  public setMode(mode: GizmoMode): void {
    if (this.disposed) {
      return;
    }
    this.mode = mode;
    this.applyMode();
  }

  /** Привязать активный гизмо к мешу или открепить через `null`. */
  public attach(mesh: AbstractMesh | null): void {
    if (this.disposed) {
      return;
    }
    this.attachedMesh = mesh;
    this.applyMode();
  }

  /** Корректно освободить гизмо и utility layer. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.attachedMesh = null;
    this.onChange = NOOP_ON_CHANGE;

    this.positionGizmo.onDragEndObservable.clear();
    this.rotationGizmo.onDragEndObservable.clear();

    this.positionGizmo.attachedMesh = null;
    this.rotationGizmo.attachedMesh = null;

    this.positionGizmo.dispose();
    this.rotationGizmo.dispose();
    this.utilityLayer.dispose();
  }

  /** Привязка нужного гизмо к мешу согласно режиму; неактивные — откреплены. */
  private applyMode(): void {
    const mesh = this.attachedMesh;

    const moveTarget = this.mode === "move" ? mesh : null;
    const rotateTarget = this.mode === "rotate" ? mesh : null;

    this.positionGizmo.attachedMesh = moveTarget;
    this.rotationGizmo.attachedMesh = rotateTarget;
  }

  /** Считать состояние прикреплённого узла, применить снап и вызвать onChange. */
  private emitChange(): void {
    const mesh = this.attachedMesh;
    if (mesh === null) {
      return;
    }

    const world: Vector3 = mesh.getAbsolutePosition();

    const x = snapTo(world.x, POSITION_SNAP_M);
    const y = snapTo(world.y, POSITION_SNAP_M);
    const z = snapTo(world.z, POSITION_SNAP_M);

    const rawDeg = mesh.rotation.y * DEG_PER_RAD;
    const rotationYDeg = normalizeDeg(snapTo(rawDeg, ROTATION_SNAP_DEG));

    this.onChange({ x, y, z, rotationYDeg });
  }
}
