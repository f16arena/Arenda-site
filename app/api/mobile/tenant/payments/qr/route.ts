import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest, getMobilePaymentPurpose, currentPeriod } from "@/lib/mobile-tenant"
import { getOrganizationRequisites } from "@/lib/organization-requisites"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const url = new URL(req.url)
  const amountParam = url.searchParams.get("amount")?.trim()
  let amount: number | null = null
  if (amountParam) {
    const n = Number(amountParam.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return mobileError("Неверная сумма")
    amount = Math.round(n)
  }

  const requisites = await getOrganizationRequisites(ctx.org.id)
  if (!requisites.iik && !requisites.fullName) {
    return mobileError("Реквизиты организации не настроены", 503)
  }

  const period = currentPeriod()
  const purpose = getMobilePaymentPurpose(tenant, period)

  const lines = [
    requisites.fullName ? `Получатель: ${requisites.fullName}` : null,
    requisites.bin ? `БИН: ${requisites.bin}` : null,
    requisites.iik ? `ИИК: ${requisites.iik}` : null,
    requisites.bank ? `Банк: ${requisites.bank}` : null,
    requisites.bik ? `БИК: ${requisites.bik}` : null,
    requisites.kbe ? `Кбе: ${requisites.kbe}` : null,
    requisites.knp ? `КНП: ${requisites.knp}` : null,
    `Назначение: ${purpose}`,
    amount ? `Сумма: ${amount} KZT` : null,
  ].filter(Boolean) as string[]

  const payload = lines.join("\n")
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 })

  return NextResponse.json({
    qrDataUrl,
    payload,
    requisites: {
      fullName: requisites.fullName,
      bin: requisites.bin,
      iik: requisites.iik,
      bik: requisites.bik,
      bank: requisites.bank,
      kbe: requisites.kbe,
      knp: requisites.knp,
    },
    period,
    purpose,
    amount,
  })
}
