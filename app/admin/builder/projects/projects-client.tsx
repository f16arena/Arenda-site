"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Pencil, Copy, Trash2, Box } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createBuilderProject, renameBuilderProject, deleteBuilderProject, duplicateBuilderProject } from "@/app/actions/builder"
import { buildEmptyProject } from "@/lib/builder/demo-project"

type Project = { id: string; name: string; updatedAt: string }

export function ProjectsList({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function createNew() {
    startTransition(async () => {
      const res = await createBuilderProject("Новый проект", buildEmptyProject())
      router.push(`/admin/builder?project=${res.id}`)
    })
  }

  function rename(id: string, current: string) {
    const name = window.prompt("Название проекта:", current)
    if (name == null || !name.trim()) return
    startTransition(async () => {
      await renameBuilderProject(id, name.trim())
      toast.success("Переименовано")
      router.refresh()
    })
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Удалить проект «${name}»? Действие необратимо.`)) return
    startTransition(async () => {
      await deleteBuilderProject(id)
      toast.success("Удалено")
      router.refresh()
    })
  }

  function duplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateBuilderProject(id)
      if (res) {
        toast.success("Создана копия")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">Сохранённые 3D-проекты конструктора зданий</p>
        <Button onClick={createNew} disabled={pending} leftIcon={<Plus className="h-4 w-4" />}>Новый проект</Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400 dark:border-slate-800">
          Пока нет сохранённых проектов. Нажмите «Новый проект» или откройте конструктор.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <Link href={`/admin/builder?project=${p.id}`} className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300">
                  <Box className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-200">{p.name}</div>
                  <div className="text-xs text-slate-400">{new Date(p.updatedAt).toLocaleString("ru-RU")}</div>
                </div>
              </Link>
              <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                <Link href={`/admin/builder?project=${p.id}`} className="font-medium text-blue-600 dark:text-blue-400">Открыть</Link>
                <span className="flex-1" />
                <button type="button" onClick={() => rename(p.id, p.name)} disabled={pending} title="Переименовать" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => duplicate(p.id)} disabled={pending} title="Дублировать" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><Copy className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => remove(p.id, p.name)} disabled={pending} title="Удалить" className="text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
