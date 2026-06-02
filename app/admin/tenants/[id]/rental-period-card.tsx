// Блок «Период аренды» карточки арендатора. Вынесен из page.tsx, чтобы держать
// страницу тонкой (perf-gate: tenant detail = fast shell). Срок берётся из
// активного договора (источник правды), не из ручных полей.

export function RentalPeriodCard({
  activeContract,
}: {
  activeContract: { number: string | null; startDate: Date | null; endDate: Date | null } | null
}) {
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("ru-RU") : "—")
  return (
    <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">Период аренды</p>
      {activeContract ? (
        <>
          <p>
            Договор № {activeContract.number ?? "—"} · {fmt(activeContract.startDate)} — {fmt(activeContract.endDate)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Чтобы изменить — создайте новый договор через раздел «Документы».
          </p>
        </>
      ) : (
        <>
          <p className="text-amber-700 dark:text-amber-300">Договор ещё не создан</p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Срок аренды появится после создания договора в разделе «Документы».
          </p>
        </>
      )}
    </div>
  )
}
