export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { signContractByTenantEcp } from "@/app/actions/contract-workflow"
import {
  buildApi2Documents,
  checkEgovBearer,
  extractSignedCms,
  loadContractForEgov,
} from "@/lib/egov-sign"

// API №2 (GET): документ(ы) на подпись. auth_type=Token → нужен Bearer.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!checkEgovBearer(req, token)) {
    return NextResponse.json({ message: "Не авторизовано" }, { status: 401 })
  }
  const contract = await loadContractForEgov(token)
  if (!contract) return NextResponse.json({ message: "Документ не найден" }, { status: 404 })
  if (contract.status === "SIGNED" || contract.status === "REJECTED" || contract.signedByTenantAt) {
    return NextResponse.json({ message: "Договор уже подписан или завершён" }, { status: 410 })
  }
  return NextResponse.json(buildApi2Documents(contract))
}

// API №2 (PUT): приём подписанных документов. JSON «мутировал» — в
// documentsToSign[].document.file.data лежит CMS base64. Проверяем подпись через
// общий поток (signContractByTenantEcp): разбор CMS, сверка ИИН/БИН арендатора,
// NCANode-криптопроверка, привязка к каноническому тексту.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!checkEgovBearer(req, token)) {
    return NextResponse.json({ message: "Не авторизовано" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "Некорректный JSON" }, { status: 400 })
  }

  const cms = extractSignedCms(body)
  if (!cms) {
    return NextResponse.json({ message: "В запросе нет подписанного документа" }, { status: 400 })
  }

  const result = await signContractByTenantEcp(token, cms)
  if (result.ok) {
    return NextResponse.json({ status: "success" })
  }
  // Подпись не прошла валидацию → 403 (по протоколу), текст для отображения в приложении.
  return NextResponse.json({ message: result.error }, { status: 403 })
}
