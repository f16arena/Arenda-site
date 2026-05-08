export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { buildKaspiPayQrString } from "@/lib/kaspi"
import { CabinetPrintButton } from "../print-button"

/**
 * Печатная форма «Реквизиты для оплаты». Тенант видит реквизиты арендодателя
 * (БИН, ИИК, БИК), сумму к оплате (общий долг) и Kaspi-QR с предзаполненной
 * суммой и описанием.
 */
export default async function CabinetRequisitesPrint() {
  const session = await auth()
  if (!session) redirect("/login")

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { organizationId: true } },
    },
  })
  if (!tenant) redirect("/cabinet/documents")

  const orgId = tenant.user.organizationId ?? session.user.organizationId
  const landlord = orgId ? await getOrganizationRequisites(orgId) : null

  const debtAgg = await db.charge.aggregate({
    where: { tenantId: tenant.id, isPaid: false, deletedAt: null },
    _sum: { amount: true },
  })
  const totalDebt = debtAgg._sum.amount ?? 0

  const paymentPurpose = `Оплата за аренду от ${tenant.companyName}${tenant.bin ? `, БИН ${tenant.bin}` : tenant.iin ? `, ИИН ${tenant.iin}` : ""}`
  const kaspiQrText = await buildKaspiPayQrString({
    amount: Math.max(totalDebt, 0),
    description: paymentPurpose,
    reference: tenant.id,
  }).catch(() => null)

  // Генерируем DataURL для QR. Используем динамический импорт qrcode чтобы не
  // тащить зависимость в bundle на других маршрутах.
  let qrDataUrl: string | null = null
  if (kaspiQrText) {
    try {
      const qrcode = await import("qrcode")
      qrDataUrl = await qrcode.default.toDataURL(kaspiQrText, { margin: 1, width: 220 })
    } catch {
      qrDataUrl = null
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/cabinet/documents" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Реквизиты для оплаты</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Распечатайте или сохраните в PDF</p>
          </div>
        </div>
        <CabinetPrintButton />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 print-area">
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">РЕКВИЗИТЫ ДЛЯ ОПЛАТЫ АРЕНДЫ</h2>
          {landlord && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{landlord.fullName}</p>}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Получатель платежа:</p>
            {landlord ? (
              <div className="space-y-1">
                <p className="text-slate-700 dark:text-slate-300">{landlord.fullName}</p>
                {landlord.legalAddress && <p className="text-slate-500 dark:text-slate-400">{landlord.legalAddress}</p>}
                <p className="text-slate-500 dark:text-slate-400">{landlord.taxIdLabel}: <span className="font-mono">{landlord.taxId}</span></p>
                <p className="text-slate-500 dark:text-slate-400">Банк: {landlord.bank}</p>
                <p className="text-slate-500 dark:text-slate-400">ИИК: <span className="font-mono">{landlord.iik}</span></p>
                <p className="text-slate-500 dark:text-slate-400">БИК: <span className="font-mono">{landlord.bik}</span></p>
                {landlord.secondIik && (
                  <div className="mt-3">
                    <p className="text-slate-500 dark:text-slate-400">Дополнительный счёт:</p>
                    <p className="text-slate-500 dark:text-slate-400">Банк: {landlord.secondBank}</p>
                    <p className="text-slate-500 dark:text-slate-400">ИИК: <span className="font-mono">{landlord.secondIik}</span></p>
                    <p className="text-slate-500 dark:text-slate-400">БИК: <span className="font-mono">{landlord.secondBik}</span></p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">Реквизиты арендодателя не настроены</p>
            )}
          </div>

          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Плательщик:</p>
            <div className="space-y-1">
              <p className="text-slate-700 dark:text-slate-300">{tenant.companyName}</p>
              {tenant.bin && <p className="text-slate-500 dark:text-slate-400">БИН: <span className="font-mono">{tenant.bin}</span></p>}
              {tenant.iin && !tenant.bin && <p className="text-slate-500 dark:text-slate-400">ИИН: <span className="font-mono">{tenant.iin}</span></p>}
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Сумма к оплате</p>
              <p className={`text-2xl font-bold mt-1 ${totalDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatMoney(totalDebt)}
              </p>
              {totalDebt === 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Задолженности нет</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-5 py-4 text-sm mb-6">
          <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Назначение платежа:</p>
          <p className="text-slate-700 dark:text-slate-300">{paymentPurpose}</p>
        </div>

        {qrDataUrl && (
          <div className="flex flex-col items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR-код для оплаты через Kaspi" width={220} height={220} />
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
              Отсканируйте QR-код в приложении Kaspi.kz, чтобы открыть форму перевода с
              предзаполненной суммой и назначением платежа.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
