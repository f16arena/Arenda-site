import { db } from "@/lib/db"
import { EmailLogLoader } from "./client-section-loaders"
import type { EmailLogItem } from "./email-log"

export async function TenantEmailLogSection({ tenantId }: { tenantId: string }) {
  const items = await db.emailLog.findMany({
    where: { tenantId },
    orderBy: { sentAt: "desc" },
    take: 30,
    select: {
      id: true,
      recipient: true,
      subject: true,
      type: true,
      status: true,
      externalId: true,
      error: true,
      openedAt: true,
      openCount: true,
      sentAt: true,
    },
  }).catch(() => [] as EmailLogItem[])

  return <EmailLogLoader items={items} />
}
