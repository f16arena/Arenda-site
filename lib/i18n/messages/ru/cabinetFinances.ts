// Кабинет арендатора → Финансы.

export const cabinetFinances = {
  title: "Финансы",
  subtitle: "Начисления и оплаты",
  summary: {
    debt: "Задолженность",
    debtWithDeposit: " · в т.ч. депозит {amount}",
    debtWithCredit: " · аванс {amount}",
    area: "Площадь",
    fixedRent: "Фикс. сумма",
    rate: "Ставка: {amount}/м²",
    monthlyRent: "Аренда в месяц",
  },
  reports: {
    title: "Отправленные чеки и оплаты",
    subtitle: "Здесь видно, что уже отправлено администратору на проверку.",
    receipt: " · чек: {name}",
    disputed: "Требует уточнения",
    rejected: "Отклонено",
    checking: "На проверке",
  },
  // Документы к оплате: счета и акты, которые видит арендатор.
  docs: {
    period: "Период {period}",
    youSigned: "вы подписали",
  },
  history: {
    title: "История оплат",
    done: "Проведено",
  },
  charges: {
    paid: "Оплачено",
    unpaid: "Долг",
    empty: "Начислений нет",
  },
  purpose: {
    placementFallback: "помещение по договору",
    value: "Аренда {placement}, {company}, период {period}",
    qrAmount: "Сумма к оплате",
  },
}
