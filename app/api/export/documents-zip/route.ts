import { NextResponse } from "next/server"
import { zipSync } from "fflate"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { isTenantRole } from "@/lib/role-capabilities"

export const dynamic = "force-dynamic"

const TYPE_LABEL: Record<string, string> = {
  INVOICE: "Счета",
  ACT: "АВР",
  RECONCILIATION: "Акты сверки",
  HANDOVER: "Акты приёма-передачи",
}

// GET /api/export/documents-zip?period=YYYY-MM[&types=INVOICE,ACT]
// Все сгенерированные документы организации за месяц одним ZIP-архивом
// (счета + АВР по умолчанию). Файлы — как хранятся (DOCX/XLSX/PDF):
// конвертация каждого в PDF на лету затянула бы выгрузку до таймаута.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || isTenantRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { orgId } = await requireOrgAccess()

  const url = new URL(req.url)
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "period должен быть в формате YYYY-MM" }, { status: 400 })
  }
  const typesRaw = url.searchParams.get("types") ?? "INVOICE,ACT"
  const types = typesRaw.split(",").map((t) => t.trim().toUpperCase()).filter((t) => TYPE_LABEL[t])
  if (types.length === 0) return NextResponse.json({ error: "Неизвестные типы документов" }, { status: 400 })

  const docs = await db.generatedDocument.findMany({
    where: { organizationId: orgId, documentType: { in: types }, period, deletedAt: null },
    select: { documentType: true, number: true, tenantName: true, fileName: true, fileBytes: true },
    orderBy: [{ documentType: "asc" }, { number: "asc" }],
    take: 500,
  })
  if (docs.length === 0) {
    return NextResponse.json({ error: `За ${period} документов не найдено` }, { status: 404 })
  }

  // Папки по типу, имя файла: «Номер — Арендатор — исходное_имя».
  const safe = (s: string) => s.replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
  const entries: Record<string, Uint8Array> = {}
  for (const d of docs) {
    const folder = TYPE_LABEL[d.documentType] ?? d.documentType
    const ext = d.fileName.includes(".") ? d.fileName.slice(d.fileName.lastIndexOf(".")) : ""
    let name = `${folder}/${safe(`${d.number ?? "Б-Н"} — ${d.tenantName}`)}${ext}`
    // Коллизии имён (один номер у разных файлов) — добавляем суффикс.
    let i = 2
    while (entries[name]) {
      name = `${folder}/${safe(`${d.number ?? "Б-Н"} — ${d.tenantName}`)} (${i})${ext}`
      i++
    }
    entries[name] = new Uint8Array(d.fileBytes as unknown as Uint8Array)
  }

  const zipped = zipSync(entries, { level: 6 })
  const zipName = `Документы_${period}.zip`
  return new NextResponse(Buffer.from(zipped) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  })
}
