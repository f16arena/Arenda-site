import { NextResponse } from "next/server"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"
import { respondReconciliationByUser } from "@/lib/reconciliation-response"

export const dynamic = "force-dynamic"

// Ответ арендатора на акт сверки с мобильного: подтвердить или заявить
// расхождение. Body: { agree: boolean, note?: string }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { id } = await params
  const body = (await req.json().catch(() => null)) as { agree?: boolean; note?: string } | null
  if (!body || typeof body.agree !== "boolean") {
    return mobileError("Укажите agree: true|false")
  }

  const res = await respondReconciliationByUser(result.ctx.user.id, id, body.agree, body.note)
  if ("error" in res) return mobileError(res.error)
  return NextResponse.json({ ok: true })
}
