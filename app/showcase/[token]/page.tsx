export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { parseDocument } from "@/types/builder"
import { BuilderApp } from "@/components/builder/BuilderApp"

/**
 * Публичная read-only витрина Building Studio (§7). Доступна по share-токену на
 * корневом домене (proxy пускает /showcase без авторизации). Рендерит редактор в
 * режиме readOnly: орбита/walk/камеры + карточка помещения, без панелей редактора.
 */
export default async function ShowcasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await db.builderShare.findUnique({ where: { token }, select: { projectId: true } })
  if (!share) notFound()
  const project = await db.builderProject.findUnique({ where: { id: share.projectId }, select: { name: true, doc: true } })
  if (!project) notFound()
  const parsed = (() => {
    try {
      return parseDocument(project.doc)
    } catch {
      return null
    }
  })()
  if (!parsed) notFound()
  return <BuilderApp readOnly initialDoc={parsed} showcaseName={project.name} />
}
