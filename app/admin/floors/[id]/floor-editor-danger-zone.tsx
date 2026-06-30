"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { clearFloorPlan } from "@/app/actions/floor-layout"
import { deleteAllSpacesOnFloor } from "@/app/actions/spaces"
import { deleteFloor } from "@/app/actions/buildings"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function DangerZone({
  floorId,
  floorName,
  spacesCount,
  elementsCount,
  onClearElements,
  onPlanCleared,
  onFloorDeleted,
  canEditFloor = true,
  canDeleteSpaces = true,
  canDeleteFloor = true,
}: {
  floorId: string
  floorName: string
  spacesCount: number
  elementsCount: number
  onClearElements: () => void
  onPlanCleared: () => void
  onFloorDeleted: () => void
  canEditFloor?: boolean
  canDeleteSpaces?: boolean
  canDeleteFloor?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const handleClearElements = () => {
    onClearElements()
  }

  const handleClearPlan = async () => {
    setBusy("plan")
    try {
      await clearFloorPlan(floorId)
      onPlanCleared()
      toast.success("План очищен. Можно рисовать заново.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось очистить план")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteAllSpaces = async () => {
    setBusy("spaces")
    try {
      const result = await deleteAllSpacesOnFloor(floorId)
      toast.success(`Удалено помещений: ${result.count}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить помещения")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteFloor = async () => {
    const cascade = spacesCount > 0
    setBusy("floor")
    try {
      await deleteFloor(floorId, { cascade })
      toast.success(`Этаж «${floorName}» удален`)
      onFloorDeleted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить этаж")
      setBusy(null)
    }
  }

  const cascadeNote = spacesCount > 0
    ? "\n\nНа этаже есть помещения. Они тоже будут удалены, если ни одно не занято арендатором."
    : ""

  // Если ни одно действие недоступно — не показываем «Опасную зону» вовсе.
  if (!canEditFloor && !canDeleteSpaces && !canDeleteFloor) return null

  return (
    <details
      className="overflow-hidden rounded-xl border border-red-200 bg-white dark:border-red-500/30 dark:bg-slate-900"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-red-700 hover:bg-red-50/50 dark:text-red-300 dark:hover:bg-red-500/5">
        <Trash2 className="h-3.5 w-3.5" />
        Опасная зона
      </summary>
      <div className="space-y-2 border-t border-red-100 px-4 py-3 dark:border-red-500/20">
        {canEditFloor && (
        <>
        <ConfirmDialog
          variant="danger"
          title="Удалить все элементы с плана?"
          description={
            "Помещения в базе не удаляются. Стираются только нарисованные комнаты, двери, иконки и подписи. " +
            "До сохранения это можно отменить через Ctrl+Z."
          }
          confirmLabel="Удалить элементы"
          onConfirm={handleClearElements}
          trigger={
            <DangerButton
              tone="yellow"
              title={`Очистить элементы (${elementsCount})`}
              description="Стирает только визуальные элементы плана. Помещения в базе не затрагиваются."
              disabled={elementsCount === 0}
            />
          }
        />
        <ConfirmDialog
          variant="danger"
          title={`Очистить нарисованный план «${floorName}»?`}
          description="Будут стерты рисунок, подложка и общая площадь этажа. Помещения в базе останутся на месте."
          confirmLabel="Очистить план"
          onConfirm={handleClearPlan}
          trigger={
            <DangerButton
              tone="amber"
              title={busy === "plan" ? "Очистка..." : "Очистить план"}
              description="Стирает рисунок, подложку и общую площадь. Помещения остаются."
              disabled={!!busy}
            />
          }
        />
        </>
        )}
        {canDeleteSpaces && (
        <ConfirmDialog
          variant="danger"
          title={`Удалить все помещения этажа «${floorName}»?`}
          description={
            "Помещения с активными арендаторами удалить нельзя. Если есть привязка к арендатору, система остановит действие. " +
            "Это действие необратимо."
          }
          confirmLabel="Удалить помещения"
          onConfirm={handleDeleteAllSpaces}
          trigger={
            <DangerButton
              tone="orange"
              title={busy === "spaces" ? "Удаление..." : `Удалить все помещения (${spacesCount})`}
              description="Удаляет Space-записи только если они не заняты арендаторами."
              disabled={!!busy || spacesCount === 0}
            />
          }
        />
        )}
        {canDeleteFloor && (
        <ConfirmDialog
          variant="danger"
          title={`Удалить этаж «${floorName}» полностью?`}
          description={
            `План, помещения и сам этаж исчезнут без возврата.${cascadeNote}` +
            " Это последнее предупреждение."
          }
          confirmLabel="Удалить этаж"
          onConfirm={handleDeleteFloor}
          trigger={
            <DangerButton
              tone="red"
              title={busy === "floor" ? "Удаление..." : "Удалить этаж целиком"}
              description="Удаляет этаж вместе с помещениями, если это разрешено связями."
              disabled={!!busy}
            />
          }
        />
        )}
      </div>
    </details>
  )
}

function DangerButton({
  tone,
  title,
  description,
  disabled,
  onClick,
}: {
  tone: "yellow" | "amber" | "orange" | "red"
  title: string
  description: string
  disabled?: boolean
  onClick?: () => void
}) {
  const toneClass = {
    yellow: "border-yellow-200 bg-yellow-50/50 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-yellow-300 dark:hover:bg-yellow-500/10",
    amber: "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300 dark:hover:bg-amber-500/10",
    orange: "border-orange-200 bg-orange-50/50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/5 dark:text-orange-300 dark:hover:bg-orange-500/10",
    red: "border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/5 dark:text-red-300 dark:hover:bg-red-500/10",
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{description}</p>
    </button>
  )
}
