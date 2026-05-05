import { db } from "@/lib/db"
import { EmailLogLoader } from "./client-section-loaders"
import type { EmailLogItem } from "./email-log"
import { safeServerValue } from "@/lib/server-fallback"

export async function TenantEmailLogSection({ tenantId }: { tenantId: string }) {
  const items = await safeServerValue(
    db.emailLog.findMany({
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
    }),
    [] as EmailLogItem[],
    { source: "admin.tenant.emailLog", route: "/admin/tenants/[id]", entity: "tenant", entityId: tenantId },
  )

  return <EmailLogLoader items={items} />
}
