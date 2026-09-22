import { auth } from "@/auth"
import { db } from "@/lib/db"
import { STATUS_COLORS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Download, FileText, Printer, Receipt, Upload, Wallet, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { MyDocumentUpload, MyDocumentDelete } from "@/components/cabinet/my-document-upload"
import { DocumentSignButton } from "@/components/cabinet/document-sign-button"
import { ReconciliationResponse } from "@/components/cabinet/reconciliation-response"
import { RequestExtensionButton } from "./request-extension-button"
import { PageHeader } from "@/components/ui/page"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function CabinetDocuments() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      contracts: { orderBy: { createdAt: "desc" }, take: 50 },
      documents: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  })

  if (!tenant) return null

  // Выставленные арендодателем документы (счета, АВР, акты сверки и т.д.)
  const issued = await db.generatedDocument.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: { generatedAt: "desc" },
    take: 50,
    select: { id: true, documentType: true, number: true, period: true, totalAmount: true, generatedAt: true, reconStatus: true, reconResponseNote: true },
  })
  const locale = await getLocale()
  const { t } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const day = (value: Date | string) => formatDateShortL(locale, value)
  const byKey = (prefix: string, key: string) => {
    const full = `${prefix}.${key}` as Parameters<typeof t>[0]
    const label = t(full)
    return label === full ? key : label
  }
  const issuedTypeLabel = (type: string) => byKey("domain.docTypes", type)

  // Какие выставленные АВР/акты сверки арендатор уже подписал.
  const signedIssuedIds = new Set(
    (await db.documentSignature.findMany({
      where: { documentType: { in: ["ACT", "RECONCILIATION"] }, documentId: { in: issued.map((d) => d.id) }, signerUserId: session!.user.id },
      select: { documentId: true },
    })).map((s) => s.documentId).filter((x): x is string => !!x),
  )

  const pendingSignatureCount = tenant.contracts.filter((contract) => ["SENT", "VIEWED"].includes(contract.status)).length
  const signedContractsCount = tenant.contracts.filter((contract) => contract.status === "SIGNED").length

  // «Запросить продление» показываем у подписанных договоров, истекающих в
  // ближайшие 90 дней (и не позднее 30 дней после истечения).
  const nowTs = new Date().getTime()
  const canRequestExtension = (c: { status: string; type: string; endDate: Date | null }) =>
    c.status === "SIGNED" && c.type !== "ADDENDUM" && !!c.endDate &&
    c.endDate.getTime() - nowTs < 90 * 86_400_000 &&
    c.endDate.getTime() > nowTs - 30 * 86_400_000

  const typeLabel = (type: string) => byKey("cabinetDocs.contracts.types", type)

  const docTypeLabel = (type: string) => byKey("cabinetDocs.mine.types", type)

  return (
    <div className="space-y-5">
      <PageHeader icon={FileText} title={t("cabinetDocs.title")} subtitle={t("cabinetDocs.subtitle")} />

      <div className="grid gap-3 sm:grid-cols-3">
        <DocumentStat label={t("cabinetDocs.stats.pendingSignature")} value={pendingSignatureCount} tone="amber" />
        <DocumentStat label={t("cabinetDocs.stats.signed")} value={signedContractsCount} tone="emerald" />
        <DocumentStat label={t("cabinetDocs.stats.myFiles")} value={tenant.documents.length} tone="blue" />
      </div>

      {/* Выставленные документы от арендодателя */}
      {issued.length > 0 && (
        <Card className="block p-0">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetDocs.issued.title")}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("cabinetDocs.issued.subtitle")}</p>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {issued.map((doc) => (
              <div key={doc.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {issuedTypeLabel(doc.documentType)}{doc.number ? ` № ${doc.number}` : ""}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {doc.period ? `${doc.period} · ` : ""}{day(doc.generatedAt)}
                      {doc.totalAmount != null ? ` · ${money(doc.totalAmount)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:self-center">
                  {doc.documentType === "RECONCILIATION" && (
                    <ReconciliationResponse documentId={doc.id} status={doc.reconStatus} note={doc.reconResponseNote} />
                  )}
                  {(doc.documentType === "ACT" || doc.documentType === "RECONCILIATION") && (
                    signedIssuedIds.has(doc.id) ? (
                      <Link href={`/verify/${doc.id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30" title={t("cabinetDocs.issued.verifyTitle")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t("cabinetDocs.issued.signedBadge")}
                      </Link>
                    ) : (
                      <DocumentSignButton documentId={doc.id} />
                    )
                  )}
                  <a
                    href={`/api/documents/archive/${doc.id}?format=pdf`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Download className="h-3.5 w-3.5" /> {t("common.actions.download")}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Документы для печати */}
      <Card className="block p-0">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetDocs.print.title")}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("cabinetDocs.print.subtitle")}
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <PrintLink
            href="/cabinet/documents/print/invoice"
            title={t("cabinetDocs.print.invoiceTitle")}
            description={t("cabinetDocs.print.invoiceText")}
            icon={<Receipt className="h-4 w-4" />}
            openLabel={t("cabinetDocs.print.open")}
          />
          <PrintLink
            href="/cabinet/documents/print/reconciliation"
            title={t("cabinetDocs.print.actTitle")}
            description={t("cabinetDocs.print.actText")}
            icon={<FileText className="h-4 w-4" />}
            openLabel={t("cabinetDocs.print.open")}
          />
          <PrintLink
            href="/cabinet/documents/print/requisites"
            title={t("cabinetDocs.print.requisitesTitle")}
            description={t("cabinetDocs.print.requisitesText")}
            icon={<Wallet className="h-4 w-4" />}
            openLabel={t("cabinetDocs.print.open")}
          />
        </div>
      </Card>

      {/* Contracts */}
      <Card className="block p-0">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetDocs.contracts.title")}</h2>
        </div>
        {tenant.contracts.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">{t("cabinetDocs.contracts.empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.contracts.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {typeLabel(c.type)} №{c.number}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {c.startDate && c.endDate
                        ? `${day(c.startDate)} — ${day(c.endDate)}`
                        : t("cabinetDocs.contracts.noPeriod")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <Badge variant="secondary" className={cn(STATUS_COLORS[c.status])}>
                    {byKey("domain.statuses", c.status)}
                  </Badge>
                  {canRequestExtension(c) && <RequestExtensionButton contractId={c.id} />}
                  {(c.status === "SENT" || c.status === "VIEWED") && c.signToken && (
                    <Link href={`/sign/${c.signToken}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                      {t("cabinetDocs.contracts.sign")}
                    </Link>
                  )}
                  {c.signToken && c.status !== "SENT" && c.status !== "VIEWED" && (
                    <Link href={`/sign/${c.signToken}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      {t("cabinetDocs.contracts.open")}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* My documents */}
      <Card className="block p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetDocs.mine.title")}</h2>
          <MyDocumentUpload />
        </div>
        {tenant.documents.length === 0 ? (
          <div className="py-12 text-center">
            <Upload className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">{t("cabinetDocs.mine.empty")}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {t("cabinetDocs.mine.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{d.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{docTypeLabel(d.type)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {d.fileUrl && (
                    <a href={d.fileUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t("cabinetDocs.mine.open")}</a>
                  )}
                  <MyDocumentDelete documentId={d.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function PrintLink({ href, title, description, icon, openLabel }: { href: string; title: string; description: string; icon: React.ReactNode; openLabel: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{description}</p>
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 group-hover:underline">
        <Printer className="h-3 w-3" />
        {openLabel}
      </span>
    </Link>
  )
}

function DocumentStat({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "emerald" }) {
  const toneClass = tone === "blue"
    ? "text-blue-600 dark:text-blue-300"
    : tone === "amber"
      ? "text-amber-600 dark:text-amber-300"
      : "text-emerald-600 dark:text-emerald-300"

  return (
    <Card className="block p-4">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  )
}
