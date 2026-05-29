export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { ShieldCheck, ShieldAlert, ShieldQuestion, FileSignature, Clock, User } from "lucide-react"
import { db } from "@/lib/db"
import { verifyCmsWithNcanode } from "@/lib/ncanode"
import { getOrganizationRequisites } from "@/lib/organization-requisites"

// Публичная страница проверки ЭЦП (ТЗ 17.5). Открыта без авторизации — на неё ведёт
// QR-код с подписанного документа (commrent.kz/verify/{id}). Показывает подписантов,
// валидность сертификатов и (если NCANode настроен) живую криптопроверку подписи.

function maskIin(iin?: string | null): string {
  if (!iin) return ""
  if (iin.length !== 12) return iin
  return `${iin.slice(0, 4)}••••${iin.slice(-2)}`
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const onlyDigits = (v?: string | null) => String(v ?? "").replace(/\D/g, "")

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const contract = await db.contract.findUnique({
    where: { id },
    select: {
      id: true, number: true, type: true, status: true,
      signedAt: true, signedByTenantAt: true, signedByLandlordAt: true,
      startDate: true, endDate: true,
      tenant: { select: { companyName: true, bin: true, iin: true, user: { select: { organizationId: true } } } },
    },
  })
  if (!contract) notFound()

  const signatures = await db.documentSignature.findMany({
    where: { documentType: "CONTRACT", documentId: id },
    select: { id: true, signerName: true, signerIin: true, signerOrgBin: true, validFrom: true, validTo: true, algorithm: true, signedAt: true, signatureB64: true },
    orderBy: { signedAt: "asc" },
  })

  // Реквизиты сторон — чтобы подписать роль (Арендатор/Арендодатель) по ИИН/БИН.
  const orgId = contract.tenant.user.organizationId
  const org = orgId ? await getOrganizationRequisites(orgId).catch(() => null) : null
  const tenantIds = [onlyDigits(contract.tenant.bin), onlyDigits(contract.tenant.iin)].filter(Boolean)
  const orgIds = org ? [onlyDigits(org.bin), onlyDigits(org.iin), onlyDigits(org.taxId)].filter(Boolean) : []

  const ncanodeEnabled = !!process.env.NCANODE_SECRET
  const rows = await Promise.all(
    signatures.map(async (s) => {
      let liveValid: boolean | null = null
      let liveReason: string | undefined
      if (ncanodeEnabled) {
        const v = await verifyCmsWithNcanode(s.signatureB64)
        liveValid = v.valid
        liveReason = v.reason
      }
      const tax = onlyDigits(s.signerOrgBin) || onlyDigits(s.signerIin)
      const role = tax && tenantIds.includes(tax) ? "Арендатор" : tax && orgIds.includes(tax) ? "Арендодатель" : "Подписант"
      const certExpired = s.validTo ? new Date() > new Date(s.validTo) : false
      return { ...s, liveValid, liveReason, role, certExpired }
    }),
  )

  const fullySigned = contract.status === "SIGNED"
  const allLiveOk = !ncanodeEnabled || rows.every((r) => r.liveValid === true)
  const overall = fullySigned && allLiveOk && rows.length > 0 ? "ok" : rows.length === 0 ? "none" : "partial"
  const docTitle = contract.type === "ADDENDUM" ? "Дополнительное соглашение" : "Договор аренды"

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Заголовок-статус */}
        <div className={`rounded-2xl border p-6 text-center ${
          overall === "ok"
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
            : overall === "none"
              ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
        }`}>
          <div className="mb-2 flex justify-center">
            {overall === "ok" ? <ShieldCheck className="h-12 w-12 text-emerald-600" />
              : overall === "none" ? <ShieldQuestion className="h-12 w-12 text-slate-400" />
              : <ShieldAlert className="h-12 w-12 text-amber-600" />}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {overall === "ok" ? "Документ подписан и действителен"
              : overall === "none" ? "Документ ещё не подписан ЭЦП"
              : "Документ подписан частично"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {docTitle} № {contract.number || "—"} · проверка commrent.kz
          </p>
        </div>

        {/* Реквизиты документа */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><FileSignature className="h-4 w-4" /> Документ</div>
          <dl className="grid grid-cols-2 gap-y-2 text-slate-600 dark:text-slate-400">
            <dt>Номер</dt><dd className="text-right text-slate-900 dark:text-slate-100">{contract.number || "—"}</dd>
            <dt>Тип</dt><dd className="text-right text-slate-900 dark:text-slate-100">{docTitle}</dd>
            <dt>Арендатор</dt><dd className="text-right text-slate-900 dark:text-slate-100">{contract.tenant.companyName}</dd>
            {contract.signedAt && (<><dt>Подписан</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{fmtDateTime(contract.signedAt)}</dd></>)}
          </dl>
        </div>

        {/* Подписи */}
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              По этому документу ещё нет ЭЦП-подписей.
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{r.role}</span>
                </div>
                {r.liveValid === true && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Подпись верна</span>}
                {r.liveValid === false && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300"><ShieldAlert className="h-3.5 w-3.5" /> Не подтверждена</span>}
                {r.liveValid === null && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Проверена при подписании</span>}
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                <dt>Подписант</dt><dd className="text-right text-slate-900 dark:text-slate-100">{r.signerName}</dd>
                {r.signerOrgBin && (<><dt>БИН</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{r.signerOrgBin}</dd></>)}
                {r.signerIin && (<><dt>ИИН</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{maskIin(r.signerIin)}</dd></>)}
                <dt className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Время</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{fmtDateTime(r.signedAt)}</dd>
                <dt>Сертификат</dt><dd className={`text-right ${r.certExpired ? "text-amber-600" : "text-slate-900 dark:text-slate-100"}`}>{r.certExpired ? "истёк" : "действителен"} (до {r.validTo ? fmtDateTime(r.validTo) : "—"})</dd>
                <dt>Алгоритм</dt><dd className="text-right text-slate-900 dark:text-slate-100">{r.algorithm}</dd>
              </dl>
              {r.liveValid === false && r.liveReason && (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{r.liveReason}</p>
              )}
            </div>
          ))}
        </div>

        <p className="px-2 text-center text-xs text-slate-400">
          Подлинность подписей подтверждается{ncanodeEnabled ? " криптопроверкой НУЦ РК (ГОСТ, цепочка сертификатов, статус отзыва)" : " проверкой сертификата и привязки к тексту документа"}. ИИН частично скрыт в целях защиты персональных данных.
        </p>
      </div>
    </div>
  )
}
