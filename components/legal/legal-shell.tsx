import Link from "next/link"
import { Building, ArrowLeft } from "lucide-react"
import { LEGAL_ENTITY, PLACEHOLDER_CLASS, isPlaceholder } from "@/lib/legal-entity"

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
    <p>
      <span className="font-medium text-slate-900">{num}.</span> {children}
    </p>
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

export function LegalShell({
  title,
  subtitle,
  effectiveDate,
  lastUpdated,
  children,
}: {
  title: string
  subtitle?: string
  effectiveDate?: string
  lastUpdated?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-3xl px-6 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Commrent</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>
        </div>
      </header>

      {/* Document */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        <header className="pb-8 border-b border-slate-100 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-base text-slate-600">{subtitle}</p>
          )}
          {(effectiveDate || lastUpdated) && (
            <div className="mt-4 space-y-1 text-sm text-slate-500">
              {effectiveDate && (
                <p>
                  Дата вступления в силу: <Field value={effectiveDate} />
                </p>
              )}
              {lastUpdated && (
                <p>
                  Дата последнего обновления: <Field value={lastUpdated} />
                </p>
              )}
            </div>
          )}
        </header>

        {children}

        {/* Reqs footer */}
        <section className="mt-12 pt-6 border-t border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Реквизиты</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[15px] text-slate-700">
            <dt className="text-slate-500">Полное наименование</dt>
            <dd>{LEGAL_ENTITY.fullName}</dd>
            <dt className="text-slate-500">БИН</dt>
            <dd><Field value={LEGAL_ENTITY.bin} /></dd>
            <dt className="text-slate-500">Юридический адрес</dt>
            <dd><Field value={LEGAL_ENTITY.legalAddress} /></dd>
            <dt className="text-slate-500">Банк</dt>
            <dd><Field value={LEGAL_ENTITY.bankName} /></dd>
            <dt className="text-slate-500">ИИК</dt>
            <dd><Field value={LEGAL_ENTITY.iik} /></dd>
            <dt className="text-slate-500">БИК</dt>
            <dd><Field value={LEGAL_ENTITY.bik} /></dd>
            <dt className="text-slate-500">Кбе</dt>
            <dd><Field value={LEGAL_ENTITY.kbe} /></dd>
            <dt className="text-slate-500">Директор</dt>
            <dd><Field value={LEGAL_ENTITY.directorName} /></dd>
            <dt className="text-slate-500">Телефон</dt>
            <dd><Field value={LEGAL_ENTITY.phone} /></dd>
            <dt className="text-slate-500">Email поддержки</dt>
            <dd>
              <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-blue-600 hover:underline">
                {LEGAL_ENTITY.email.support}
              </a>
            </dd>
            <dt className="text-slate-500">Сайт</dt>
            <dd>
              <a href={LEGAL_ENTITY.site} className="text-blue-600 hover:underline">
                {LEGAL_ENTITY.site}
              </a>
            </dd>
          </dl>
        </section>

        {/* Cross-links */}
        <nav className="mt-12 pt-6 border-t border-slate-100">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-3">Другие документы</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li><Link href="/offer" className="text-slate-700 hover:text-blue-600 hover:underline">Публичная оферта</Link></li>
            <li><Link href="/privacy" className="text-slate-700 hover:text-blue-600 hover:underline">Политика конфиденциальности</Link></li>
            <li><Link href="/terms" className="text-slate-700 hover:text-blue-600 hover:underline">Пользовательское соглашение</Link></li>
            <li><Link href="/sla" className="text-slate-700 hover:text-blue-600 hover:underline">SLA</Link></li>
          </ul>
        </nav>
      </article>
    </div>
  )
}
