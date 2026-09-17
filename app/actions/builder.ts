"use server"

// ADR: Персистентность Building Studio (Фаза 5). Документ хранится как JSONB в
// BuilderProject; автосейв использует оптимистичную блокировку по revision (updateMany
// where revision — если 0 строк, значит кто-то сохранил параллельно). Док валидируется
// Zod (parseDocument) перед записью. Орг-скоуп вместо RLS. Showcase — отдельный токен.

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { uid } from "@/core/id"
import { parseDocument, type BuilderDocument } from "@/types/builder"
import { assertBuildingAccess } from "@/lib/building-access"
import { floorToLayout } from "@/lib/builder/to-layout"
import { revalidateTag } from "next/cache"
import { floorsForBuildingTag } from "@/lib/admin-shell-cache"

/** Модель, привязанная к зданию, открыта только тем, кому открыто здание. */
async function assertProjectAccess(id: string, orgId: string): Promise<void> {
  const project = await db.builderProject.findFirst({
    where: { id, organizationId: orgId },
    select: { buildingId: true },
  })
  if (!project) throw new Error("Модель не найдена")
  if (project.buildingId) await assertBuildingAccess(project.buildingId, orgId)
}

async function requireBuilderAccess(): Promise<string> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error("Запрещено")
  const { orgId } = await requireOrgAccess()
  return orgId
}

export async function createBuilderProject(name: string, doc: BuilderDocument): Promise<{ id: string; revision: number }> {
  const orgId = await requireBuilderAccess()
  const session = await auth()
  const validated = parseDocument(doc)
  const created = await db.builderProject.create({
    data: {
      organizationId: orgId,
      name: (name || "Без названия").slice(0, 120),
      doc: validated,
      schemaVersion: validated.schemaVersion,
      revision: 0,
      createdById: session?.user?.id ?? null,
    },
    select: { id: true, revision: true },
  })
  return created
}

export async function saveBuilderProject(
  id: string,
  doc: BuilderDocument,
  revision: number,
  name?: string,
): Promise<{ revision: number; conflict?: boolean }> {
  const orgId = await requireBuilderAccess()
  await assertProjectAccess(id, orgId)
  const validated = parseDocument(doc)
  const res = await db.builderProject.updateMany({
    where: { id, organizationId: orgId, revision },
    data: {
      doc: validated,
      revision: revision + 1,
      schemaVersion: validated.schemaVersion,
      ...(name ? { name: name.slice(0, 120) } : {}),
    },
  })
  if (res.count === 0) return { revision, conflict: true }
  // Одна геометрия: план этажа на карте выводится из модели. Ошибка
  // вывода не должна ломать сохранение модели — она отдельная и логируется.
  try {
    await syncLayoutsFromDocument(id, validated)
  } catch (cause) {
    console.error("[builder] не удалось вывести планы этажей из модели", cause)
  }
  return { revision: revision + 1 }
}

/**
 * Записать планы этажей здания из модели. Этаж модели находит свой этаж в
 * базе по sourceFloorId (новые модели) или по номеру этажа (старые).
 * Этажи без единой комнаты в модели не трогаем: нарисованное или схему
 * пустотой не затираем.
 */
async function syncLayoutsFromDocument(projectId: string, doc: BuilderDocument): Promise<void> {
  const project = await db.builderProject.findUnique({ where: { id: projectId }, select: { buildingId: true } })
  if (!project?.buildingId) return
  const dbFloors = await db.floor.findMany({
    where: { buildingId: project.buildingId },
    select: { id: true, number: true, layoutJson: true },
  })
  const byId = new Map(dbFloors.map((f) => [f.id, f]))
  const byNumber = new Map(dbFloors.map((f) => [f.number, f]))
  const modelFloors = doc.buildings.flatMap((b) => b.floors)
  for (const floor of modelFloors) {
    const target = (floor.sourceFloorId && byId.get(floor.sourceFloorId)) || byNumber.get(floor.level)
    if (!target) continue
    const layout = floorToLayout(floor)
    const hasRooms = layout.elements.some((el) => el.type === "polygon")
    // Пустой этаж модели (очистили, чтобы обвести по скану) не затирает план,
    // пришедший не из модели (схема, нарисованное вручную). Но свой прежний
    // вывод из модели он обязан убрать — иначе на карте висит удалённое.
    const previousFromModel = (() => {
      try {
        return target.layoutJson ? (JSON.parse(target.layoutJson) as { source?: string }).source === "model" : false
      } catch {
        return false
      }
    })()
    if (!hasRooms && !previousFromModel) continue
    const json = hasRooms || layout.underlay ? JSON.stringify(layout) : null
    // этаж не менялся — не перезаписываем (план со сканом весит сотни килобайт)
    if ((target.layoutJson ?? null) === json) continue
    await db.floor.update({ where: { id: target.id }, data: { layoutJson: json } })
  }
  revalidateTag(floorsForBuildingTag(project.buildingId), { expire: 0 })
  revalidatePath(`/admin/buildings/${project.buildingId}/map`)
}

export async function loadBuilderProject(id: string): Promise<{ id: string; name: string; doc: BuilderDocument; revision: number } | null> {
  const orgId = await requireBuilderAccess()
  await assertProjectAccess(id, orgId)
  const p = await db.builderProject.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, name: true, doc: true, revision: true },
  })
  if (!p) return null
  return { id: p.id, name: p.name, doc: parseDocument(p.doc), revision: p.revision }
}

export async function listBuilderProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const orgId = await requireBuilderAccess()
  const rows = await db.builderProject.findMany({
    where: { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
    take: 50,
  })
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() }))
}

export async function renameBuilderProject(id: string, name: string): Promise<{ ok: boolean }> {
  const orgId = await requireBuilderAccess()
  const res = await db.builderProject.updateMany({
    where: { id, organizationId: orgId },
    data: { name: (name || "Без названия").slice(0, 120) },
  })
  revalidatePath("/admin/builder/projects")
  return { ok: res.count > 0 }
}

export async function deleteBuilderProject(id: string): Promise<{ ok: boolean }> {
  const orgId = await requireBuilderAccess()
  const res = await db.builderProject.deleteMany({ where: { id, organizationId: orgId } })
  revalidatePath("/admin/builder/projects")
  return { ok: res.count > 0 }
}

export async function duplicateBuilderProject(id: string): Promise<{ id: string } | null> {
  const orgId = await requireBuilderAccess()
  const session = await auth()
  const src = await db.builderProject.findFirst({ where: { id, organizationId: orgId }, select: { name: true, doc: true, schemaVersion: true } })
  if (!src) return null
  const validated = parseDocument(src.doc)
  const created = await db.builderProject.create({
    data: {
      organizationId: orgId,
      name: `${src.name} (копия)`.slice(0, 120),
      doc: validated,
      schemaVersion: src.schemaVersion,
      revision: 0,
      createdById: session?.user?.id ?? null,
    },
    select: { id: true },
  })
  revalidatePath("/admin/builder/projects")
  return created
}

export async function createBuilderShare(projectId: string): Promise<{ token: string }> {
  const orgId = await requireBuilderAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) throw new Error("Проект не найден")
  const token = `${uid("sh")}${uid("k")}`.replace(/[^a-z0-9]/gi, "").slice(0, 32)
  await db.builderShare.create({ data: { token, projectId } })
  return { token }
}
