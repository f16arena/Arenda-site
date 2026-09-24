import { ForceLight } from "@/components/force-light"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { LEGAL_ENTITY, PLACEHOLDER_CLASS, isPlaceholder } from "@/lib/legal-entity"
import { getT } from "@/lib/i18n/server"

// Юр. страницы — публичные, в одной цветовой гамме с лендингом (только светлая тема).
// Если когда-то у проекта будет полноценный dark mode для админки — этого shell
// он касаться не должен: оферта, политика и условия остаются «бумажным» документом.

export function Field({ value }: { value: string }) {
  if (isPlaceholder(value)) {
    return <span className={PLACEHOLDER_CLASS}>{value}</span>
  }
  return <span>{value}</span>
}

export function Section({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">
        {number}. {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  )
}

export function Clause({
  num,
  children,
}: {
  num: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="font-medium text-slate-900">{num}.</span> {children}
    </div>
  )
}

export function ClauseList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1 marker:text-slate-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export async function LegalShell({
  title,
  subtitle,
  effectiveDate,
  lastUpdated,
  version,
  showBankDetails = false,
  children,
}: {
  title: string
  subtitle?: string
  effectiveDate?: string
  lastUpdated?: string
  version?: string
  /** Если true — в подвале добавляем подробный блок «Банковские реквизиты для оплаты». Включаем в /offer. */
  showBankDetails?: boolean
  children: React.ReactNode
}) {
  // Рамка документа — интерфейс, её переводим. Сам текст оферты, политики и
  // условий приходит в children и остаётся русским до вычитки юриста.
  const { t } = await getT()
  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <ForceLight />
      {/* Header — те же визуалы, что на лендинге, чтобы пользователь
          понимал, что находится на том же сайте, а не на стороннем. */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center" aria-label="Commrent.kz">
            <Image
              src="/commrent-logo-navbar.png"
              alt="Commrent.kz"
              width={214}
              height={75}
              priority
              className="h-11 w-auto object-contain"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("landing.legal.toHome")}
          </Link>
        </div>
      </header>

      {/* Document — белая карточка на сером фоне, как Stripe/Linear legal pages */}
      <article className="mx-auto max-w-3xl px-6 py-12">
       <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 sm:px-10 shadow-sm">
        <header className="pb-8 border-b border-slate-100 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-base text-slate-600">{subtitle}</p>
          )}
          {(effectiveDate || lastUpdated || version) && (
            <div className="mt-4 space-y-1 text-sm text-slate-500">
              {version && (
                <p>
                  {t("landing.legal.version")} <span className="font-mono">v{version}</span>
                </p>
              )}
              {effectiveDate && (
                <p>
                  {t("landing.legal.effectiveDate")} <Field value={effectiveDate} />
                </p>
              )}
              {lastUpdated && (
                <p>
                  {t("landing.legal.lastUpdated")} <Field value={lastUpdated} />
                </p>
              )}
            </div>
          )}
        </header>

        {children}

        {/* Reqs footer — общие реквизиты (без банковских) */}
        <section className="mt-12 pt-6 border-t border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("landing.legal.requisites")}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[15px] text-slate-700">
            <dt className="text-slate-500">{t("landing.legal.fullName")}</dt>
            <dd>{LEGAL_ENTITY.fullName}</dd>
            <dt className="text-slate-500">{t("landing.legal.bin")}</dt>
            <dd>{LEGAL_ENTITY.bin}</dd>
            <dt className="text-slate-500">{t("landing.legal.legalAddress")}</dt>
            <dd>{LEGAL_ENTITY.legalAddress}</dd>
            <dt className="text-slate-500">{t("landing.legal.director")}</dt>
            <dd>{LEGAL_ENTITY.directorName}</dd>
            <dt className="text-slate-500">{t("landing.legal.phone")}</dt>
            <dd>
              <a href={`tel:${LEGAL_ENTITY.phone.replace(/\s/g, "")}`} className="hover:underline">
                {LEGAL_ENTITY.phone}
              </a>
            </dd>
            <dt className="text-slate-500">{t("landing.legal.generalQuestions")}</dt>
            <dd>
              <a href={`mailto:${LEGAL_ENTITY.email.info}`} className="text-blue-600 hover:underline">
                {LEGAL_ENTITY.email.info}
              </a>
            </dd>
            <dt className="text-slate-500">{t("landing.legal.support")}</dt>
            <dd>
              <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-blue-600 hover:underline">
                {LEGAL_ENTITY.email.support}
              </a>
            </dd>
            <dt className="text-slate-500">{t("landing.legal.site")}</dt>
            <dd>
              <a href={LEGAL_ENTITY.site} className="text-blue-600 hover:underline">
                {LEGAL_ENTITY.site}
              </a>
            </dd>
          </dl>
        </section>

        {/* Банковские реквизиты — только в /offer (для оплаты подписки) */}
        {showBankDetails && (
          <section className="mt-8 pt-6 border-t border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("landing.legal.bankDetails")}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[15px] text-slate-700">
              <dt className="text-slate-500">{t("landing.legal.recipient")}</dt>
              <dd>{LEGAL_ENTITY.fullName}</dd>
              <dt className="text-slate-500">{t("landing.legal.bin")}</dt>
              <dd className="font-mono">{LEGAL_ENTITY.bin}</dd>
              <dt className="text-slate-500">{t("landing.legal.bank")}</dt>
              <dd>{LEGAL_ENTITY.bankName}</dd>
              <dt className="text-slate-500">{t("landing.legal.iik")}</dt>
              <dd className="font-mono">{LEGAL_ENTITY.iik}</dd>
              <dt className="text-slate-500">{t("landing.legal.bik")}</dt>
              <dd className="font-mono">{LEGAL_ENTITY.bik}</dd>
              <dt className="text-slate-500">{t("landing.legal.kbe")}</dt>
              <dd className="font-mono">{LEGAL_ENTITY.kbe}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              {t("landing.legal.paymentPurpose")} <code className="px-1 py-0.5 bg-slate-100 rounded">{t("landing.legal.paymentPurposeText")}</code>.
            </p>
          </section>
        )}

        {/* Cross-links */}
        <nav className="mt-12 pt-6 border-t border-slate-100">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t("landing.legal.otherDocs")}</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li><Link href="/offer" className="text-slate-700 hover:text-blue-600 hover:underline">{t("landing.legal.offer")}</Link></li>
            <li><Link href="/privacy" className="text-slate-700 hover:text-blue-600 hover:underline">{t("landing.legal.privacy")}</Link></li>
            <li><Link href="/terms" className="text-slate-700 hover:text-blue-600 hover:underline">{t("landing.legal.terms")}</Link></li>
            <li><Link href="/sla" className="text-slate-700 hover:text-blue-600 hover:underline">SLA</Link></li>
          </ul>
        </nav>
       </div>
      </article>

      {/* Footer — мини, как на лендинге, чтобы пользователь чувствовал
          continuity и легко вернулся к продуктовым ссылкам. */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600">
          <p>
            {t("landing.legal.footerLine", {
              year: new Date().getFullYear(),
              name: LEGAL_ENTITY.fullName,
              brand: LEGAL_ENTITY.brand,
            })}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-slate-950">{t("landing.legal.navHome")}</Link>
            <Link href="/offer" className="hover:text-slate-950">{t("landing.legal.navOffer")}</Link>
            <Link href="/privacy" className="hover:text-slate-950">{t("landing.legal.navPrivacy")}</Link>
            <Link href="/terms" className="hover:text-slate-950">{t("landing.legal.navTerms")}</Link>
            <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="hover:text-slate-950">{LEGAL_ENTITY.email.support}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
