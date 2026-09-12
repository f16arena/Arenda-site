export const dynamic = "force-dynamic"

import { Box } from "lucide-react"
import { listBuilderProjects } from "@/app/actions/builder"
import { listBuildableBuildings } from "@/app/actions/builder-from-building"
import { ProjectsList } from "./projects-client"
import { BuildFromBuilding } from "./build-from-building"

export default async function BuilderProjectsPage() {
  const [projects, buildings] = await Promise.all([listBuilderProjects(), listBuildableBuildings()])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
          <Box className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3D-конструктор</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Мои здания — сохранённые проекты Building Studio</p>
        </div>
      </div>
      <BuildFromBuilding buildings={buildings} />
      <ProjectsList projects={projects} />
    </div>
  )
}
