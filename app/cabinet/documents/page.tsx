import { auth } from "@/auth"
import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS, formatMoney } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Download, FileText, Printer, Receipt, Upload, Wallet, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { DocumentSignButton } from "@/components/cabinet/document-sign-button"

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
    select: { id: true, documentType: true, number: true, period: true, totalAmount: true, generatedAt: true },
  })
  const issuedTypeLabel: Record<string, string> = {
    INVOICE: "Счёт на оплату",
    ACT: "Акт оказанных услуг",
    RECONCILIATION: "Акт сверки",
    CONTRACT: "Договор",
    HANDOVER: "Акт приёма-передачи",
  }

  // Какие выставленные АВР/акты сверки арендатор уже подписал.
  const signedIssuedIds = new Set(
    (await db.documentSignature.findMany({
      where: { documentType: { in: ["ACT", "RECONCILIATION"] }, documentId: { in: issued.map((d) => d.id) }, signerUserId: session!.user.id },
      select: { documentId: true },
    })).map((s) => s.documentId).filter((x): x is string => !!x),
  )

  const pendingSignatureCount = tenant.contracts.filter((contract) => ["SENT", "VIEWED"].includes(contract.status)).length
  const signedContractsCount = tenant.contracts.filter((contract) => contract.status === "SIGNED").length

  const typeLabel: Record<string, string> = {
    STANDARD: "Договор аренды",
    EXTENSION: "Пролонгация",
    ACT: "Акт сверки",
  }

  const docTypeLabel: Record<string, string> = {
    ID_CARD: "Удостоверение личности",
    CHARTER: "Устав",
    IP_CERTIFICATE: "Свидетельство ИП",
    CHSI_LICENSE: "Лицензия ЧСИ",
    CHSI_CERTIFICATE: "Удостоверение ЧСИ",
    CHSI_CHAMBER_MEMBERSHIP: "Членство в палате ЧСИ",
    ORDER: "Приказ",
    OTHER: "Прочее",
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Документы</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Договоры и ваши документы</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <DocumentStat label="Ожидают подписи" value={pendingSignatureCount} tone="amber" />
        <DocumentStat label="Подписаны" value={signedContractsCount} tone="emerald" />
        <DocumentStat label="Мои файлы" value={tenant.documents.length} tone="blue" />
      </div>

      {/* Выставленные документы от арендодателя */}
      {issued.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Выставленные документы</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Счета, акты и акты сверки от арендодателя — скачайте при необходимости.</p>
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
                      {issuedTypeLabel[doc.documentType] ?? doc.documentType}{doc.number ? ` № ${doc.number}` : ""}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {doc.period ? `${doc.period} · ` : ""}{new Date(doc.generatedAt).toLocaleDateString("ru-RU")}
                      {doc.totalAmount != null ? ` · ${formatMoney(doc.totalAmount)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:self-center">
                  {(doc.documentType === "ACT" || doc.documentType === "RECONCILIATION") && (
                    signedIssuedIds.has(doc.id) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Подписано
                      </span>
                    ) : (
                      <DocumentSignButton documentId={doc.id} />
                    )
                  )}
                  <a
                    href={`/api/documents/archive/${doc.id}`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Download className="h-3.5 w-3.5" /> Скачать
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Документы для печати */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Документы для печати</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Сформируйте и распечатайте счёт, акт сверки или реквизиты прямо из кабинета.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <PrintLink
            href="/cabinet/documents/print/invoice"
            title="Счёт-фактура"
            description="Счёт на оплату по открытым начислениям за текущий период."
            icon={<Receipt className="h-4 w-4" />}
          />
          <PrintLink
            href="/cabinet/documents/print/reconciliation"
            title="Акт сверки"
            description="Сверка взаиморасчётов за выбранный период."
            icon={<FileText className="h-4 w-4" />}
          />
          <PrintLink
            href="/cabinet/documents/print/requisites"
            title="Реквизиты для оплаты"
            description="БИН, ИИК, БИК арендодателя, сумма к оплате, QR-код Kaspi."
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Contracts */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Договоры и акты</h2>
        </div>
        {tenant.contracts.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Нет документов</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {tenant.contracts.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {typeLabel[c.type] ?? c.type} №{c.number}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {c.startDate && c.endDate
                        ? `${new Date(c.startDate).toLocaleDateString("ru-RU")} — ${new Date(c.endDate).toLocaleDateString("ru-RU")}`
                        : "Период не указан"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[c.status])}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  {(c.status === "SENT" || c.status === "VIEWED") && c.signToken && (
                    <Link href={`/sign/${c.signToken}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                      Подписать
                    </Link>
                  )}
                  {c.signToken && c.status !== "SENT" && c.status !== "VIEWED" && (
                    <Link href={`/sign/${c.signToken}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      Открыть
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My documents */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Мои документы</h2>
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
            <Upload className="h-3 w-3" />
            Загрузить
          </button>
        </div>
        {tenant.documents.length === 0 ? (
          <div className="py-12 text-center">
            <Upload className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Документы не загружены</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Загрузите ИИН, устав, свидетельство ИП и другие документы
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {tenant.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{d.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{docTypeLabel[d.type] ?? d.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    Загружен
                  </span>
                  <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Открыть</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PrintLink({ href, title, description, icon }: { href: string; title: string; description: string; icon: React.ReactNode }) {
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
        Открыть для печати
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
