// Блок «Период аренды» карточки арендатора. Вынесен из page.tsx, чтобы держать
// страницу тонкой (perf-gate: tenant detail = fast shell). Срок берётся из
// активного договора (источник правды), не из ручных полей.

import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"

export async function RentalPeriodCard({
  activeContract,
}: {
  activeContract: { number: string | null; startDate: Date | null; endDate: Date | null } | null
}) {
  const locale = await getLocale()
  const { t } = await getT(locale)
  const fmt = (d: Date | null) => (d ? formatDateShortL(locale, d) : "—")
  return (
    <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{t("adminTenants.rentalPeriod.title")}</p>
      {activeContract ? (
        <>
          <p>
            {t("adminTenants.rentalPeriod.line", {
              number: activeContract.number ?? "—",
              start: fmt(activeContract.startDate),
              end: fmt(activeContract.endDate),
            })}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("adminTenants.rentalPeriod.changeHint")}
          </p>
        </>
      ) : (
        <>
          <p className="text-amber-700 dark:text-amber-300">{t("adminTenants.rentalPeriod.noContract")}</p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("adminTenants.rentalPeriod.noContractHint")}
          </p>
        </>
      )}
    </div>
  )
}
