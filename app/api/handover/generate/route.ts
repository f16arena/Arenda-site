import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { BUILDING_DEFAULT } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { buildLegalEntityFullName } from "@/lib/full-name"
import { shortenFio } from "@/lib/declension"
import { Document, Packer } from "docx"
import {
  p, center, fmtDate,
  Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType,
  tableNoBorders,
} from "@/lib/docx-helpers"

export const dynamic = "force-dynamic"

// GET /api/handover/generate?tenantId=xxx&direction=in (приём) | out (возврат)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  const direction = searchParams.get("direction") ?? "in"

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 })

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(tenantId, orgId)
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-tenant access" }, { status: 403 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      user: true,
      space: { include: { floor: { include: { building: { select: { address: true } } } } } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: { include: { building: { select: { address: true } } } } } } },
      },
      fullFloors: { include: { building: { select: { address: true } } } },
      bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const landlord = await getOrganizationRequisites(orgId)
  const today = new Date()
  const fullFloor = tenant.fullFloors?.[0]
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const primarySpace = assignedSpaces[0] ?? null
  const area = fullFloor?.totalArea ?? assignedSpaces.reduce((sum, space) => sum + space.area, 0)
  const buildingAddress = fullFloor?.building.address ?? primarySpace?.floor.building.address ?? BUILDING_DEFAULT.address
  const placement = fullFloor?.name
    ?? (assignedSpaces.length > 0
      ? assignedSpaces.map((space) => `${space.floor.name}, кабинет ${space.number}`).join("; ")
      : "")

  // Полное имя арендатора с автопрефиксом ИП/ТОО/ЧСИ (без дублирования если
  // префикс уже в companyName). Используется в шапке акта и реквизитах.
  const tenantFullName = buildLegalEntityFullName({
    legalType: tenant.legalType,
    companyName: tenant.companyName,
    directorName: tenant.directorName ?? tenant.user?.name,
  })

  const actTitle = direction === "out"
    ? "Акт возврата нежилого помещения"
    : "Акт приёма-передачи нежилого помещения"

  const intro = direction === "out"
    ? `Арендатор передаёт, а Арендодатель принимает обратно следующее помещение:`
    : `Арендодатель передаёт, а Арендатор принимает следующее помещение:`

  const sideTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableNoBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Арендодатель:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: landlord.fullName, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: `${landlord.taxIdLabel}: ${landlord.taxId}`, size: 20 })] }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `___________________ ${landlord.directorShort}`, size: 22 })],
                spacing: { before: 400 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "М.П.", size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: "Арендатор:", bold: true, size: 22 })], spacing: { after: 80 } }),
              new Paragraph({ children: [new TextRun({ text: tenantFullName, size: 20 })] }),
              ...(tenant.iin ? [new Paragraph({ children: [new TextRun({ text: `ИИН: ${tenant.iin}`, size: 20 })] })] : []),
              ...(tenant.bin ? [new Paragraph({ children: [new TextRun({ text: `БИН: ${tenant.bin}`, size: 20 })] })] : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `___________________ ${shortenFio(tenant.directorName ?? tenant.user.name)}`, size: 22 })],
                spacing: { before: 400 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "М.П.", size: 18 })],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const doc = new Document({
    styles: { default: { document: { run: { size: 22, font: "Times New Roman" } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1000 } } },
      children: [
        center(actTitle),
        new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({ text: "г. Усть-Каменогорск", size: 22 }),
            new TextRun({ text: "                                                            ", size: 22 }),
            new TextRun({ text: fmtDate(today), size: 22 }),
          ],
          spacing: { after: 300 },
        }),
        p(`${landlord.fullName}, в лице руководителя ${landlord.directorShort}, действующего на основании ${landlord.basis} (далее — «Арендодатель»), и ${tenantFullName}, в лице ${tenant.directorName ?? tenant.user.name} (далее — «Арендатор»), составили настоящий Акт о следующем:`),
        p(intro),
        p(`1. Адрес: ${buildingAddress}${placement ? `, ${placement}` : ""}.`, { indent: false }),
        p(`2. Площадь: ${area} кв.м.`, { indent: false }),
        p(`3. Состояние помещения: пригодно для использования по назначению.`, { indent: false }),
        p(`4. Замечания: отсутствуют.`, { indent: false }),
        p(`5. Стороны не имеют претензий друг к другу.`, { indent: false }),
        new Paragraph({ children: [new TextRun("")], spacing: { before: 400 } }),
        sideTable,
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeTenant = tenant.companyName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const prefix = direction === "out" ? "АктВозврата" : "АктПриема"
  const fileName = `${prefix}_${safeTenant}_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}.docx`

  // Архивируем handover в GeneratedDocument как остальные документы
  // (раньше handover был единственный неархивный — терялся след передачи).
  // session уже получен на старте функции, переиспользуем.
  if (session?.user?.id) {
    await db.generatedDocument.create({
      data: {
        organizationId: orgId,
        documentType: "HANDOVER",
        number: `HANDOVER-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        period: today.toISOString().slice(0, 7),
        totalAmount: 0,
        fileName,
        fileBytes: new Uint8Array(buffer),
        fileSize: buffer.length,
        format: "DOCX",
        generatedById: session.user.id,
      },
    }).catch((e) => {
      // Архивация — best-effort, не валим выдачу файла если БД не отвечает.
      console.error("[handover] archive failed:", e instanceof Error ? e.message : e)
    })
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
