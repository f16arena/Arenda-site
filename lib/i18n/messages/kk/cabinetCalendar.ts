import type { cabinetCalendar as ruCal, cabinetProfile as ruProfile, cabinetPayDocs as ruPayDocs } from "../ru/cabinetCalendar"

export const cabinetCalendar: typeof ruCal = {
  prevMonth: "Алдыңғы ай",
  nextMonth: "Келесі ай",
  today: "Бүгін",
  expectedDate: "Болжалды төлем күні",
  noPayments: "Төлем жоқ",
  overdue: "Мерзімі өткен",
  paid: "Төленді",
  due: "Төлеуге",
  received: "Төлем түсті",
  loadFailed: "Төлем күнтізбесін жүктеу мүмкін болмады",
  legend: "Белгілер",
  hint: "Күнді басыңыз — сол күнгі төлемдерді көрсетеміз.",
}

export const cabinetProfile: typeof ruProfile = {
  title: "Менің профилім",
}

export const cabinetPayDocs: typeof ruPayDocs = {
  title: "Төлеуге арналған құжаттар",
  subtitle: "Жалдауыңыз бойынша шот пен акт. Жүктеп алыңыз, қажет болса ЭЦҚ-мен қол қойыңыз — содан кейін төлеңіз.",
  period: "Кезең ",
  signedByYou: "сіз қол қойдыңыз",
}
