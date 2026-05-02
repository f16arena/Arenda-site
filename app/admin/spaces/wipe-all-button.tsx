"use client"

import { useTransition } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteAllSpacesInBuilding } from "@/app/actions/spaces"

export function WipeAllSpacesButton({
  buildingId,
  buildingName,
  spacesCount,
}: {
  buildingId: string
  buildingName: string
  spacesCount: number
}) {
  const [pending, startTransition] = useTransition()

  if (spacesCount === 0) return null

  const handle = () => {
    if (!window.confirm(
      `Удалить ВСЕ ${spacesCount} помещени${spacesCount === 1 ? "е" : spacesCount < 5 ? "я" : "й"} здания «${buildingName}»?\n\n` +
      `⚠ Помещения с активными арендаторами удалить нельзя — система сообщит, какие именно.\n` +
      `⚠ Этажи и план остаются — стираются только Space-записи.\n\n` +
      `Это действие необратимо.`,
    )) return
    if (!window.confirm("Точно удалить? Это последнее предупреждение.")) return
    startTransition(async () => {
      try {
        const r = await deleteAllSpacesInBuilding(buildingId)
        toast.success(`Удалено помещений: ${r.count}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось удалить")
      }
    })
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      title={`Стереть все ${spacesCount} помещений в здании ${buildingName}`}
      className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 px-3 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Удаление..." : "Очистить всё"}
    </button>
  )
}
