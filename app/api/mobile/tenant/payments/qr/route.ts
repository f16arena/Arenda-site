import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest, getMobilePaymentPurpose, currentPeriod } from "@/lib/mobile-tenant"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  // Реквизиты в QR читает арендатор — язык из его профиля (cookie тут нет).
  const { t } = await getTForUser(ctx.user.id)
  const url = new URL(req.url)
  const amountParam = url.searchParams.get("amount")?.trim()
  let amount: number | null = null
  if (amountParam) {
    const n = Number(amountParam.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return mobileError(t("adminDocs.api.payments.badAmountShort"))
    amount = Math.round(n)
  }

  const requisites = await getOrganizationRequisites(ctx.org.id)
  if (!requisites.iik && !requisites.fullName) {
    return mobileError(t("adminDocs.api.payments.requisitesMissing"), 503)
  }

  const period = currentPeriod()
  const purpose = getMobilePaymentPurpose(tenant, period)

  const lines = [
    requisites.fullName ? t("emails.requisites.recipient", { value: requisites.fullName }) : null,
    requisites.bin ? t("emails.requisites.taxId", { value: requisites.bin }) : null,
    requisites.iik ? t("emails.requisites.iik", { value: requisites.iik }) : null,
    requisites.bank ? t("emails.requisites.bank", { value: requisites.bank }) : null,
    requisites.bik ? t("emails.requisites.bik", { value: requisites.bik }) : null,
    requisites.kbe ? t("emails.requisites.kbe", { value: requisites.kbe }) : null,
    requisites.knp ? t("emails.requisites.knp", { value: requisites.knp }) : null,
    t("emails.requisites.purpose", { value: purpose }),
    amount ? t("emails.requisites.amount", { value: `${amount} KZT` }) : null,
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
