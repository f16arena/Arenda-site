"use server"

// ADR: Персистентность Building Studio (Фаза 5). Документ хранится как JSONB в
// BuilderProject; автосейв использует оптимистичную блокировку по revision (updateMany
// where revision — если 0 строк, значит кто-то сохранил параллельно). Док валидируется
// Zod (parseDocument) перед записью. Орг-скоуп вместо RLS. Showcase — отдельный токен.

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { uid } from "@/core/id"
import { parseDocument, type BuilderDocument } from "@/types/builder"

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
  return { revision: revision + 1 }
}

export async function loadBuilderProject(id: string): Promise<{ id: string; name: string; doc: BuilderDocument; revision: number } | null> {
  const orgId = await requireBuilderAccess()
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

export async function createBuilderShare(projectId: string): Promise<{ token: string }> {
  const orgId = await requireBuilderAccess()
  const p = await db.builderProject.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } })
  if (!p) throw new Error("Проект не найден")
  const token = `${uid("sh")}${uid("k")}`.replace(/[^a-z0-9]/gi, "").slice(0, 32)
  await db.builderShare.create({ data: { token, projectId } })
  return { token }
}
