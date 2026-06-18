export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { buildApi1, egovBaseFromEnv, loadContractForEgov } from "@/lib/egov-sign"

// API №1 (GET): метаданные подписания + ссылка на API №2. Зовётся приложением
// eGov Mobile после сканирования QR `mobileSign:<этот URL>`. Публичный эндпоинт.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await loadContractForEgov(token)
  if (!contract) {
    return NextResponse.json({ message: "Документ не найден" }, { status: 404 })
  }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return NextResponse.json({ message: "Договор уже завершён" }, { status: 410 })
  }
  if (contract.signedByTenantAt) {
    return NextResponse.json({ message: "Договор уже подписан арендатором" }, { status: 410 })
  }

  const origin = egovBaseFromEnv() ?? req.nextUrl.origin
  const body = await buildApi1(origin, token, contract)
  return NextResponse.json(body)
}
