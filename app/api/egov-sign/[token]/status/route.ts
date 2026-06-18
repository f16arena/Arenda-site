export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { loadContractForEgov } from "@/lib/egov-sign"

// Опрос статуса подписания для фронта (страница со QR). Токен в пути — секрет.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await loadContractForEgov(token)
  if (!contract) return NextResponse.json({ found: false }, { status: 404 })
  return NextResponse.json({
    found: true,
    status: contract.status,
    signedByTenant: !!contract.signedByTenantAt,
  })
}
