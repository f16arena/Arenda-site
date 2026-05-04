import { db } from "@/lib/db"
import { DocumentsChecklistLoader } from "./client-section-loaders"

export async function TenantDocumentsSection({
  tenantId,
  legalType,
}: {
  tenantId: string
  legalType: string
}) {
  const documents = await db.tenantDocument.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      name: true,
      fileUrl: true,
      storageFileId: true,
      createdAt: true,
    },
  })

  return (
    <DocumentsChecklistLoader
      tenantId={tenantId}
      legalType={legalType}
      documents={documents}
    />
  )
}
