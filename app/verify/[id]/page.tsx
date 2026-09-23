export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { ShieldCheck, ShieldAlert, ShieldQuestion, FileSignature, Clock, User } from "lucide-react"
import { db } from "@/lib/db"
import { verifyCmsWithNcanode } from "@/lib/ncanode"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { getT } from "@/lib/i18n/server"
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config"

// Публичная страница проверки ЭЦП (ТЗ 17.5). Открыта без авторизации — на неё ведёт
// QR-код с подписанного документа (commrent.kz/verify/{id}). Показывает подписантов,
// валидность сертификатов и (если NCANode настроен) живую криптопроверку подписи.

function maskIin(iin?: string | null): string {
  if (!iin) return ""
  if (iin.length !== 12) return iin
  return `${iin.slice(0, 4)}••••${iin.slice(-2)}`
}

function fmtDateTime(locale: Locale, d: Date | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleString(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const onlyDigits = (v?: string | null) => String(v ?? "").replace(/\D/g, "")

// Тип документа из базы → ключ подписи в словаре.
const DOC_TYPE_KEYS = {
  ADDENDUM: true,
  CONTRACT_RENT: true,
  ACT: true,
  RECONCILIATION: true,
  INVOICE: true,
  CONTRACT: true,
  HANDOVER: true,
} as const

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { t, locale } = await getT()

  // Документ может быть договором (Contract) или выставленным актом/счётом (GeneratedDocument).
  const contract = await db.contract.findUnique({
    where: { id },
    select: { number: true, type: true, status: true, signedAt: true, deletedAt: true, tenant: { select: { companyName: true, bin: true, iin: true, user: { select: { organizationId: true } } } } },
  })

  let docNumber = "—"
  let docTitleKey: keyof typeof DOC_TYPE_KEYS | null = null
  let docTitleRaw = t("auth.verify.document")
  let tenantName = ""
  let signedAt: Date | null = null
  let docFullySigned = false
  let orgId: string | null = null
  let tenantIds: string[] = []

  if (contract?.deletedAt) notFound()
  if (contract) {
    docNumber = contract.number || "—"
    docTitleKey = contract.type === "ADDENDUM" ? "ADDENDUM" : "CONTRACT_RENT"
    tenantName = contract.tenant.companyName
    signedAt = contract.signedAt
    docFullySigned = contract.status === "SIGNED"
    orgId = contract.tenant.user.organizationId
    tenantIds = [onlyDigits(contract.tenant.bin), onlyDigits(contract.tenant.iin)].filter((x): x is string => !!x)
  } else {
    const gen = await db.generatedDocument.findUnique({
      where: { id },
      select: { number: true, documentType: true, tenantName: true, tenantId: true, organizationId: true, deletedAt: true },
    })
    // Удалённый документ не подтверждаем.
    if (!gen || gen.deletedAt) notFound()
    docNumber = gen.number || "—"
    // Незнакомый тип показываем как есть — это код из базы, не текст.
    docTitleKey = gen.documentType in DOC_TYPE_KEYS
      ? (gen.documentType as keyof typeof DOC_TYPE_KEYS)
      : null
    if (!docTitleKey) docTitleRaw = gen.documentType
    tenantName = gen.tenantName
    orgId = gen.organizationId
    const row = gen.tenantId
      ? await db.tenant.findUnique({
          where: { id: gen.tenantId },
          select: { bin: true, iin: true },
        })
      : null
    tenantIds = [onlyDigits(row?.bin), onlyDigits(row?.iin)].filter((x): x is string => !!x)
  }

  const signatures = await db.documentSignature.findMany({
    // Только подписи организации самого документа — чужая подпись с тем же id не засчитывается.
    where: { documentId: id, ...(orgId ? { organizationId: orgId } : {}) },
    select: { id: true, signerName: true, signerIin: true, signerOrgBin: true, validFrom: true, validTo: true, algorithm: true, signedAt: true, signatureB64: true, tspGenTime: true, tspSerial: true },
    orderBy: { signedAt: "asc" },
  })

  const org = orgId ? await getOrganizationRequisites(orgId).catch(() => null) : null
  const orgIds = org ? [onlyDigits(org.bin), onlyDigits(org.iin), onlyDigits(org.taxId)].filter((x): x is string => !!x) : []

  const ncanodeEnabled = !!process.env.NCANODE_SECRET
  const rows = await Promise.all(
    signatures.map(async (s) => {
      let liveValid: boolean | null = null
      let liveReason: string | undefined
      if (ncanodeEnabled && s.signatureB64) {
        const v = await verifyCmsWithNcanode(s.signatureB64)
        liveValid = v.valid
        liveReason = v.reason
      }
      const tax = onlyDigits(s.signerOrgBin) || onlyDigits(s.signerIin)
      const roleKey = tax && tenantIds.includes(tax)
        ? "tenant"
        : tax && orgIds.includes(tax)
          ? "landlord"
          : "signer"
      const certExpired = s.validTo ? new Date() > new Date(s.validTo) : false
      return { ...s, liveValid, liveReason, roleKey, certExpired }
    }),
  )

  const docTitle = docTitleKey
    ? t(`auth.verify.docTypes.${docTitleKey}` as "auth.verify.docTypes.CONTRACT")
    : docTitleRaw

  const fullySigned = contract ? docFullySigned : rows.length > 0
  const allLiveOk = rows.every((r) => r.liveValid !== false)
  const overall = fullySigned && allLiveOk && rows.length > 0 ? "ok" : rows.length === 0 ? "none" : "partial"

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
            {overall === "ok"
              ? t("auth.verify.okTitle")
              : overall === "none"
                ? t("auth.verify.noneTitle")
                : t("auth.verify.partialTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("auth.verify.checkLine", { doc: docTitle, number: docNumber })}
          </p>
        </div>

        {/* Реквизиты документа */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><FileSignature className="h-4 w-4" /> {t("auth.verify.document")}
          </div>
          <dl className="grid grid-cols-2 gap-y-2 text-slate-600 dark:text-slate-400">
            <dt>{t("auth.verify.number")}</dt>
            <dd className="text-right text-slate-900 dark:text-slate-100">{docNumber}</dd>
            <dt>{t("auth.verify.type")}</dt>
            <dd className="text-right text-slate-900 dark:text-slate-100">{docTitle}</dd>
            <dt>{t("auth.verify.tenant")}</dt>
            <dd className="text-right text-slate-900 dark:text-slate-100">{tenantName}</dd>
            {signedAt && (
              <>
                <dt>{t("auth.verify.signedAt")}</dt>
                <dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">
                  {fmtDateTime(locale, signedAt)}
                </dd>
              </>
            )}
          </dl>
        </div>

        {/* Подписи */}
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              {t("auth.verify.noSignatures")}
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {t(`auth.verify.${r.roleKey}` as "auth.verify.signer")}
                  </span>
                </div>
                {r.liveValid === true && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> {t("auth.verify.sigValid")}
                  </span>}
                {r.liveValid === false && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300"><ShieldAlert className="h-3.5 w-3.5" /> {t("auth.verify.sigInvalid")}
                  </span>}
                {r.liveValid === null && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {t("auth.verify.sigAtSigning")}
                  </span>}
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                <dt>{t("auth.verify.signer")}</dt>
                <dd className="text-right text-slate-900 dark:text-slate-100">{r.signerName}</dd>
                {r.signerOrgBin && (<><dt>{t("auth.verify.bin")}</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{r.signerOrgBin}</dd></>)}
                {r.signerIin && (<><dt>{t("auth.verify.iin")}</dt><dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">{maskIin(r.signerIin)}</dd></>)}
                <dt className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {t("auth.verify.time")}
                </dt>
                <dd className="text-right tabular-nums text-slate-900 dark:text-slate-100">
                  {fmtDateTime(locale, r.signedAt)}
                </dd>
                {r.tspGenTime && (
                  <>
                    <dt className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {t("auth.verify.tsp")}
                    </dt>
                    <dd className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {fmtDateTime(locale, r.tspGenTime)}
                    </dd>
                  </>
                )}
                <dt>{t("auth.verify.cert")}</dt>
                <dd
                  className={`text-right ${r.certExpired ? "text-amber-600" : "text-slate-900 dark:text-slate-100"}`}
                >
                  {t("auth.verify.certUntil", {
                    status: r.certExpired ? t("auth.verify.expired") : t("auth.verify.valid"),
                    date: r.validTo ? fmtDateTime(locale, r.validTo) : "—",
                  })}
                </dd>
                <dt>{t("auth.verify.algorithm")}</dt>
                <dd className="text-right text-slate-900 dark:text-slate-100">{r.algorithm}</dd>
              </dl>
              {r.liveValid === false && r.liveReason && (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{r.liveReason}</p>
              )}
            </div>
          ))}
        </div>

        <p className="px-2 text-center text-xs text-slate-400">
          {t("auth.verify.footer", {
            method: ncanodeEnabled
              ? t("auth.verify.cryptoCheck")
              : t("auth.verify.certCheck"),
          })}
        </p>
      </div>
    </div>
  )
}
