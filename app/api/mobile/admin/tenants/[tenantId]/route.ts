import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"
import { mobileError } from "@/lib/mobile-context"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getTenantAreaTotal } from "@/lib/tenant-placement"

export const dynamic = "force-dynamic"

const CLOSED_REQUEST_STATUSES = ["DONE", "CLOSED", "CANCELLED"]
const INACTIVE_CONTRACT_STATUSES = ["REJECTED", "EXPIRED"]
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { tenantId } = await params
  const origin = new URL(req.url).origin
  const now = new Date()
  const soon = new Date(now.getTime() + 45 * DAY_MS)

  const tenant = await db.tenant.findFirst({
    where: {
      id: tenantId,
      user: { organizationId: result.ctx.org.id },
      ...tenantInBuildingsWhere(result.buildingIds),
    },
    select: {
      id: true,
      userId: true,
      companyName: true,
      legalType: true,
      bin: true,
      iin: true,
      category: true,
      paymentDueDay: true,
      fixedMonthlyRent: true,
      customRate: true,
      contractStart: true,
      contractEnd: true,
      user: { select: { name: true, phone: true, email: true } },
      space: {
        select: {
          number: true,
          area: true,
          floor: { select: { name: true, ratePerSqm: true, building: { select: { id: true, name: true } } } },
        },
      },
      tenantSpaces: {
        select: {
          space: {
            select: {
              number: true,
              area: true,
              floor: { select: { name: true, ratePerSqm: true, building: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      fullFloors: {
        select: {
          name: true,
          totalArea: true,
          fixedMonthlyRent: true,
          building: { select: { id: true, name: true } },
        },
      },
      _count: { select: { documents: true } },
    },
  })

  if (!tenant) return mobileError("Арендатор не найден или нет доступа", 404)

  const [
    charges,
    payments,
    paymentReports,
    contracts,
    generated,
    tenantDocuments,
    requests,
    signatureRequests,
    debt,
    overdueDebt,
  ] = await Promise.all([
    db.charge.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        period: true,
        type: true,
        amount: true,
        description: true,
        isPaid: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: [{ isPaid: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    db.payment.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
        note: true,
        createdAt: true,
      },
      orderBy: { paymentDate: "desc" },
      take: 20,
    }),
    db.paymentReport.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
        status: true,
        paymentPurpose: true,
        note: true,
        receiptName: true,
        receiptMime: true,
        receiptFileId: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.contract.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        tenantId: true,
        number: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        signedAt: true,
        sentAt: true,
        signToken: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    db.generatedDocument.findMany({
      where: { organizationId: result.ctx.org.id, tenantId: tenant.id },
      select: {
        id: true,
        tenantId: true,
        tenantName: true,
        documentType: true,
        number: true,
        period: true,
        totalAmount: true,
        fileName: true,
        fileSize: true,
        format: true,
        generatedAt: true,
      },
      orderBy: { generatedAt: "desc" },
      take: 30,
    }),
    db.tenantDocument.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        type: true,
        name: true,
        fileUrl: true,
        storageFileId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.request.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            companyName: true,
            userId: true,
            space: { select: { number: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } } },
            tenantSpaces: {
              take: 1,
              select: { space: { select: { number: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } } } },
            },
          },
        },
        comments: {
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: { select: { comments: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    db.documentSignatureRequest.findMany({
      where: {
        organizationId: result.ctx.org.id,
        recipientUserId: tenant.userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        documentType: true,
        documentId: true,
        documentRef: true,
        title: true,
        message: true,
        status: true,
        allowedMethods: true,
        preferredMethod: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.charge.aggregate({
      where: { tenantId: tenant.id, isPaid: false },
      _sum: { amount: true },
    }),
    db.charge.aggregate({
      where: { tenantId: tenant.id, isPaid: false, dueDate: { lt: now } },
      _sum: { amount: true },
    }),
  ])

  const tenantContracts = contracts.map((contract) => ({
    id: contract.id,
    tenantId: contract.tenantId,
    tenantName: tenant.companyName,
    number: contract.number,
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    signedAt: contract.signedAt,
    sentAt: contract.sentAt,
    webUrl: contract.signToken ? `${origin}/sign/${contract.signToken}` : `${origin}/admin/contracts`,
  }))

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      companyName: tenant.companyName,
      legalType: tenant.legalType,
      bin: tenant.bin,
      iin: tenant.iin,
      category: tenant.category,
      paymentDueDay: tenant.paymentDueDay,
      contact: {
        name: tenant.user.name,
        phone: tenant.user.phone,
        email: tenant.user.email,
      },
      placement: tenantPlacement(tenant),
      area: roundArea(getTenantAreaTotal(tenant)),
      monthlyRent: calculateTenantMonthlyRent(tenant),
      totalDebt: debt._sum.amount ?? 0,
      overdueDebt: overdueDebt._sum.amount ?? 0,
      activeRequests: requests.filter((request) => !CLOSED_REQUEST_STATUSES.includes(request.status)).length,
      documents: tenant._count.documents + generated.length + contracts.length,
      contractStart: tenant.contractStart,
      contractEnd: tenant.contractEnd,
      contracts: {
        total: contracts.length,
        active: contracts.filter((contract) => !INACTIVE_CONTRACT_STATUSES.includes(contract.status)).length,
        signed: contracts.filter((contract) => contract.status === "SIGNED").length,
        expiringSoon: contracts.filter((contract) => !!contract.endDate && contract.endDate >= now && contract.endDate <= soon).length,
      },
    },
    charges,
    payments,
    paymentReports: paymentReports.map((report) => ({
      ...report,
      receiptUrl: report.receiptFileId
        ? `${origin}/api/mobile/tenant/documents/storage/${report.receiptFileId}`
        : null,
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        userId: tenant.userId,
      },
    })),
    contracts: tenantContracts,
    generatedDocuments: generated.map((document) => ({
      ...document,
      downloadUrl: `${origin}/api/mobile/admin/documents/generated/${document.id}`,
    })),
    tenantDocuments: tenantDocuments.map((document) => ({
      ...document,
      downloadUrl: document.storageFileId ? `${origin}/api/mobile/tenant/documents/storage/${document.storageFileId}` : document.fileUrl,
    })),
    requests,
    signatureRequests,
  })
}

function roundArea(value: number) {
  return Math.round(value * 10) / 10
}

type TenantForDetail = {
  space: {
    number: string
    floor: { name: string; building: { name: string } }
  } | null
  tenantSpaces: Array<{
    space: {
      number: string
      floor: { name: string; building: { name: string } }
    }
  }>
  fullFloors: Array<{
    name: string
    building: { name: string }
  }>
}

function tenantPlacement(tenant: TenantForDetail) {
  const labels: string[] = []

  if (tenant.space) {
    labels.push(`${tenant.space.floor.building.name}, ${tenant.space.floor.name}, каб. ${tenant.space.number}`)
  }

  for (const item of tenant.tenantSpaces.slice(0, 2)) {
    labels.push(`${item.space.floor.building.name}, ${item.space.floor.name}, каб. ${item.space.number}`)
  }

  for (const floor of tenant.fullFloors.slice(0, 2)) {
    labels.push(`${floor.building.name}, ${floor.name}`)
  }

  const hiddenCount = Math.max(0, tenant.tenantSpaces.length + tenant.fullFloors.length + (tenant.space ? 1 : 0) - labels.length)
  return labels.length > 0 ? `${labels.join(" · ")}${hiddenCount ? ` +${hiddenCount}` : ""}` : "Площадь не назначена"
}
