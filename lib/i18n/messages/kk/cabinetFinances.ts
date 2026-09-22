import type { cabinetFinances as ru } from "../ru/cabinetFinances"

export const cabinetFinances: typeof ru = {
  title: "Төлемдер",
  subtitle: "Есептеулер мен төлемдер",
  summary: {
    debt: "Берешек",
    debtWithDeposit: " · оның ішінде кепілдік жарна {amount}",
    debtWithCredit: " · артық төлем {amount}",
    area: "Аудан",
    fixedRent: "Тіркелген сома",
    rate: "Мөлшерлеме: {amount}/м²",
    monthlyRent: "Айлық жалдау ақысы",
  },
  reports: {
    title: "Жіберілген түбіртектер мен төлемдер",
    subtitle: "Әкімшіге тексеруге не жібергеніңіз осында көрінеді.",
    receipt: " · түбіртек: {name}",
    disputed: "Нақтылау керек",
    rejected: "Қабылданбады",
    checking: "Тексерілуде",
  },
  history: {
    title: "Төлемдер тарихы",
    done: "Өткізілді",
  },
  charges: {
    paid: "Төленді",
    unpaid: "Берешек",
    empty: "Есептеу жоқ",
  },
  purpose: {
    placementFallback: "шарт бойынша үй-жай",
    value: "{placement} жалдау ақысы, {company}, {period} кезеңі",
    qrAmount: "Төлеуге тиіс сома",
  },
}
