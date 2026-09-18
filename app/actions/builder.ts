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
  // Снимок модели — страховка на случай «сломал и сохранил». Не чаще раза в
  // 10 минут, иначе при автосохранении таблица росла бы каждые несколько секунд.
  try {
    await takeSnapshot(id, revision + 1, validated)
  } catch (cause) {
    console.error("[builder] не удалось сохранить снимок модели", cause)
  }
  // Одна геометрия: план этажа на карте выводится из модели. Ошибка
  // вывода не должна ломать сохранение модели — она отдельная и логируется.
  try {
    await syncLayoutsFromDocument(id, validated)
  } catch (cause) {
    console.error("[builder] не удалось вывести планы этажей из модели", cause)
  }
  return { revision: revision + 1 }
}

/** Как часто делаем снимок и сколько храним. */
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000
const SNAPSHOT_KEEP = 20

/**
 * Когда для проекта делали снимок в этом процессе. Автосохранение идёт каждые
 * несколько секунд, и без этого кэша каждое из них ходило бы в базу за датой
 * последнего снимка. Кэш — лишь оптимизация: он может быть пустым после
 * перезапуска, тогда проверяем по базе, как раньше.
 */
const lastSnapshotAt = new Map<string, number>()

async function takeSnapshot(projectId: string, revision: number, doc: BuilderDocument): Promise<void> {
  const cached = lastSnapshotAt.get(projectId)
  if (cached && Date.now() - cached < SNAPSHOT_EVERY_MS) return
  const last = await db.builderSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  if (last && Date.now() - last.createdAt.getTime() < SNAPSHOT_EVERY_MS) {
    lastSnapshotAt.set(projectId, last.createdAt.getTime())
    return
  }
  await db.builderSnapshot.create({ data: { projectId, revision, doc } })
  lastSnapshotAt.set(projectId, Date.now())
  // оставляем последние SNAPSHOT_KEEP: без чистки таблица растёт бесконечно
  const old = await db.builderSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    skip: SNAPSHOT_KEEP,
    select: { id: true },
  })
  if (old.length) await db.builderSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
}

/** Снимки проекта: время, ревизия и краткая сводка модели. */
export async function listBuilderSnapshots(
  projectId: string,
): Promise<Array<{ id: string; revision: number; createdAt: string; floors: number; rooms: number }>> {
  const orgId = await requireBuilderAccess()
  await assertProjectAccess(projectId, orgId)
  const rows = await db.builderSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: SNAPSHOT_KEEP,
    select: { id: true, revision: true, createdAt: true, doc: true },
  })
  return rows.map((r) => {
    const doc = r.doc as unknown as BuilderDocument
    const floors = doc.buildings?.reduce((s, b) => s + (b.floors?.length ?? 0), 0) ?? 0
    const rooms = doc.buildings?.reduce(
      (s, b) => s + (b.floors ?? []).reduce((k, f) => k + Object.keys(f.wallGraph?.edges ?? {}).length, 0),
      0,
    ) ?? 0
    return { id: r.id, revision: r.revision, createdAt: r.createdAt.toISOString(), floors, rooms }
  })
}

/**
 * Восстановить модель из снимка. Текущее состояние перед заменой само попадает
 * в снимки — вернуться обратно всегда можно.
 */
export async function restoreBuilderSnapshot(projectId: string, snapshotId: string): Promise<{ revision: number }> {
  const orgId = await requireBuilderAccess()
  await assertProjectAccess(projectId, orgId)
  const snap = await db.builderSnapshot.findFirst({ where: { id: snapshotId, projectId }, select: { doc: true } })
  if (!snap) throw new Error("Снимок не найден")
  const current = await db.builderProject.findFirst({ where: { id: projectId }, select: { revision: true, doc: true } })
  if (!current) throw new Error("Проект не найден")
  const validated = parseDocument(snap.doc)
  // перед откатом кладём текущую модель в снимки — «отменить отмену»
  await db.builderSnapshot.create({ data: { projectId, revision: current.revision, doc: current.doc as never, note: "перед восстановлением" } })
  await db.builderProject.update({
    where: { id: projectId },
    data: { doc: validated, revision: current.revision + 1, schemaVersion: validated.schemaVersion },
  })
  try {
    await syncLayoutsFromDocument(projectId, validated)
  } catch (cause) {
    console.error("[builder] не удалось вывести планы этажей после восстановления", cause)
  }
  return { revision: current.revision + 1 }
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

/**
 * Публичная ссылка-витрина. По умолчанию живёт 30 дней: вечная ссылка —
 * это утечка планировки здания, если её переслали дальше. Отзывается вручную.
 */
export async function createBuilderShare(projectId: string, days = 30): Promise<{ token: string; expiresAt: string | null }> {
  const orgId = await requireBuilderAccess()
  const { userId } = await requireOrgAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) throw new Error("Проект не найден")
  const token = `${uid("sh")}${uid("k")}${uid("t")}`.replace(/[^a-z0-9]/gi, "").slice(0, 40)
  const expiresAt = days > 0 ? new Date(Date.now() + Math.min(days, 365) * 86400_000) : null
  await db.builderShare.create({ data: { token, projectId, expiresAt, createdById: userId } })
  return { token, expiresAt: expiresAt ? expiresAt.toISOString() : null }
}

/** Действующие ссылки проекта (для панели «Поделиться») вместе с числом открытий. */
export async function listBuilderShares(
  projectId: string,
): Promise<Array<{ token: string; createdAt: string; expiresAt: string | null; views: number; lastViewAt: string | null }>> {
  const orgId = await requireBuilderAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) return []
  const rows = await db.builderShare.findMany({
    where: { projectId, revokedAt: null },
    select: { token: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  })
  const tokens = rows.map((r) => r.token)
  const counts = tokens.length
    ? await db.builderShareView.groupBy({ by: ["token"], where: { token: { in: tokens } }, _count: { _all: true }, _max: { openedAt: true } })
    : []
  const byToken = new Map(counts.map((c) => [c.token, { views: c._count._all, last: c._max.openedAt }]))
  return rows.map((r) => {
    const v = byToken.get(r.token)
    return {
      token: r.token,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      views: v?.views ?? 0,
      lastViewAt: v?.last ? v.last.toISOString() : null,
    }
  })
}

/** Журнал открытий витрины: последние заходы по всем ссылкам проекта. */
export async function listBuilderShareViews(
  projectId: string,
  take = 50,
): Promise<Array<{ token: string; openedAt: string; visitor: string | null; userAgent: string | null }>> {
  const orgId = await requireBuilderAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) return []
  const rows = await db.builderShareView.findMany({
    where: { projectId },
    select: { token: true, openedAt: true, visitor: true, userAgent: true },
    orderBy: { openedAt: "desc" },
    take: Math.min(200, Math.max(1, take)),
  })
  return rows.map((r) => ({ token: r.token, openedAt: r.openedAt.toISOString(), visitor: r.visitor, userAgent: r.userAgent }))
}

/** Отозвать ссылку (одну или все у проекта): витрина сразу перестаёт открываться. */
export async function revokeBuilderShare(projectId: string, token?: string): Promise<{ revoked: number }> {
  const orgId = await requireBuilderAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) throw new Error("Проект не найден")
  const res = await db.builderShare.updateMany({
    where: { projectId, revokedAt: null, ...(token ? { token } : {}) },
    data: { revokedAt: new Date() },
  })
  return { revoked: res.count }
}
