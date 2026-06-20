import type { PricingPlan, PricingPeriod, PricingMatrix } from "@/components/landing/pricing-data"

// Секция тарифов в стиле нового дизайна (классы .plans/.plan/...), но с ЖИВЫМИ
// данными из БД: цена/мес со скидкой Founding, зачёркнутая обычная, фичи плана,
// остаток Founding-слотов. Цена показывается за помесячный период.

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
const Arrow = () => (
  <svg className="arr" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export function PricingDesignSection({
  plans,
  periods,
  matrix,
  founding,
  ctaHref = "/signup",
}: {
  plans: PricingPlan[]
  periods: PricingPeriod[]
  matrix: PricingMatrix
  founding: { remaining: number; total: number; isActive: boolean } | null
  ctaHref?: string
}) {
  const monthly = periods.find((p) => p.monthsCount === 1) ?? periods[0]
  // Только платные тарифы: исключаем FREE и планы с нулевой ценой (триал/бесплатный) —
  // пробный период предлагается отдельной кнопкой, а не карточкой за 0 ₸.
  const paid = plans.filter((p) => {
    if (p.code === "FREE") return false
    const base = monthly ? matrix[p.code]?.[monthly.code]?.normal?.basePriceMonthly ?? 0 : 0
    return base > 0
  })
  const useFounders = !!founding?.isActive
  // «Популярный» — средняя карточка (для нечётного — центральная).
  const featIndex = paid.length >= 3 ? 1 : -1

  return (
    <div className="sec" id="pricing">
      <div className="wrap">
        <div className="center-head reveal">
          <span className="kicker center">Тарифы</span>
          <h2>От одного здания до сети объектов</h2>
          <p>
            Гибкие периоды оплаты и скидки за длинный пакет.
            {useFounders && founding
              ? ` Осталось ${founding.remaining} из ${founding.total} мест Founding Members — пожизненная скидка −40%.`
              : " Первые 15 клиентов — Founding Members с пожизненной скидкой −40%."}
          </p>
        </div>

        {paid.length === 0 || !monthly ? (
          <p className="center-head" style={{ marginTop: 40 }}>Тарифы временно недоступны.</p>
        ) : (
          <div className="plans mt48" style={paid.length > 3 ? { gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" } : undefined}>
            {paid.map((plan, i) => {
              const cell = matrix[plan.code]?.[monthly.code]
              const breakdown = cell ? (useFounders ? cell.founders : cell.normal) : null
              const perMonth = breakdown?.pricePerMonth ?? null
              const base = breakdown?.basePriceMonthly ?? null
              const hasDiscount = perMonth != null && base != null && perMonth < base
              const feat = i === featIndex
              return (
                <div key={plan.code} className={`plan reveal${feat ? " feat" : ""}`}>
                  <div className="pn">{plan.name}</div>
                  {plan.description && <div className="pd">{plan.description}</div>}
                  <div className="price">
                    {perMonth != null ? (
                      <>
                        <span className="amt tnum">{fmt(perMonth)}</span>
                        <span className="per">₸ / мес</span>
                      </>
                    ) : (
                      <span className="amt">Индивидуально</span>
                    )}
                  </div>
                  {hasDiscount && base != null && (
                    <div className="old tnum">{fmt(base)} ₸ без скидки Founding</div>
                  )}
                  {plan.highlights.length > 0 && (
                    <ul>
                      {plan.highlights.map((h) => (
                        <li key={h}><Check />{h}</li>
                      ))}
                    </ul>
                  )}
                  <div className="spacer" />
                  <a href={ctaHref} className={`btn ${feat ? "btn-blue" : "btn-line"}`}>
                    Выбрать{feat ? <Arrow /> : null}
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
