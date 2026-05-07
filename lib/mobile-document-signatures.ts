import { db } from "@/lib/db"
import { assertContractInOrg } from "@/lib/scope-guards"
import crypto from "crypto"

const DOCUMENT_TYPES = new Set(["CONTRACT", "INVOICE", "ACT", "RECONCILIATION", "HANDOVER"])

export function normalizeSignatureMethods(value: unknown) {
  const methods = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

  const allowed = methods.length > 0
    ? methods
    : ["NCA_LAYER", "SMS_OTP_DRAFT"]

  return [...new Set(allowed)].filter((method) => (
    method === "NCA_LAYER"
    || method === "SMS_OTP_DRAFT"
    || method === "SIMPLE_CONFIRMATION_DRAFT"
  ))
}

export function createSignatureToken() {
  return crypto.randomBytes(24).toString("hex")
}

export async function assertDocumentCanBeSigned(input: {
  orgId: string
  documentType: string
  documentId?: string | null
}) {
  if (!DOCUMENT_TYPES.has(input.documentType)) {
    throw new Error("Unsupported document type")
  }

  if (!input.documentId) return

  if (input.documentType === "CONTRACT") {
    await assertContractInOrg(input.documentId, input.orgId)
    return
  }

  const generated = await db.generatedDocument.findFirst({
    where: {
      id: input.documentId,
      organizationId: input.orgId,
      documentType: input.documentType,
    },
    select: { id: true },
  })
  if (!generated) throw new Error("Document not found or unavailable for signature")
}

export async function getSignatureDocumentPreview(input: {
  orgId: string
  documentType: string
  documentId?: string | null
}) {
  if (!input.documentId) return null

  if (input.documentType === "CONTRACT") {
    return db.contract.findFirst({
      where: {
        id: input.documentId,
        tenant: { user: { organizationId: input.orgId } },
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        content: true,
        startDate: true,
        endDate: true,
        tenant: { select: { companyName: true } },
      },
    })
  }

  return db.generatedDocument.findFirst({
    where: {
      id: input.documentId,
      organizationId: input.orgId,
      documentType: input.documentType,
    },
    select: {
      id: true,
      documentType: true,
      number: true,
      tenantName: true,
      period: true,
      totalAmount: true,
      fileName: true,
      fileSize: true,
      format: true,
      generatedAt: true,
    },
  })
}

export function maskPhone(phone?: string | null) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 6) return "***"
  return `+${digits.slice(0, 1)} *** *** ${digits.slice(-4)}`
}
