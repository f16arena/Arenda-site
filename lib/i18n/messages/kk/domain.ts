import type { domain as ru } from "../ru/domain"

export const domain: typeof ru = {
  chargeTypes: {
    RENT: "Жалдау ақысы",
    DEPOSIT: "Кепілдік жарна",
    DEPOSIT_REFUND: "Кепілдік жарнаны қайтару",
    SERVICE_FEE: "Пайдалану алымы",
    SERVICE_FEE_INDEXED: "Пайдалану алымы (индекстелген)",
    ELECTRICITY: "Электр энергиясы",
    WATER: "Су",
    HEATING: "Жылу",
    GARBAGE: "Қоқыс шығару",
    SECURITY: "Күзет",
    INTERNET: "Интернет",
    GAS: "Газ",
    CLEANING: "Тазалау",
    PARKING: "Тұрақ",
    PENALTY: "Айыппұл/өсімпұл",
    SERVICE_DELIVERED: "Көрсетілген қызмет",
    OTHER: "Басқа",
  },
  roles: {
    OWNER: "Иесі",
    ADMIN: "Әкімші",
    ACCOUNTANT: "Бухгалтер",
    // «Шаруашылық меңгерушісі» — как в кадровых документах; так же в
    // common.roles и adminSettings, чтобы одна роль звалась везде одинаково.
    FACILITY_MANAGER: "Шаруашылық меңгерушісі",
    EMPLOYEE: "Қызметкер",
    TENANT: "Жалға алушы",
  },
  statuses: {
    NEW: "Жаңа",
    OPEN: "Ашық",
    IN_PROGRESS: "Жұмыста",
    DONE: "Орындалды",
    CLOSED: "Жабылды",
    CANCELLED: "Бас тартылды",
    POSTPONED: "Кейінге қалдырылды",
    DRAFT: "Жоба",
    SENT: "Жіберілді",
    VIEWED: "Қаралды",
    SIGNED_BY_TENANT: "Жалға алушы қол қойған",
    SIGNED: "Қол қойылған",
    REJECTED: "Қабылданбады",
    EXPIRED: "Мерзімі өтті",
    ARCHIVED: "Мұрағат",
    VACANT: "Бос",
    OCCUPIED: "Бос емес",
    MAINTENANCE: "Қызмет көрсетуде",
    PENDING: "Күтуде",
    PAID: "Төленді",
  },
  paymentMethods: {
    TRANSFER: "Банк аударымы",
    KASPI: "Kaspi",
    CASH: "Қолма-қол ақша",
    CARD: "Карта",
  },
  docTypes: {
    INVOICE: "Төлем шоты",
    // В таблицах и списках — коротко; полное «көрсетілген қызметтер
    // актісі» остаётся в самом документе.
    ACT: "Қызмет актісі",
    RECONCILIATION: "Салыстыру актісі",
    HANDOVER: "Қабылдау-тапсыру актісі",
    CONTRACT: "Шарт",
    ADDENDUM: "Қосымша келісім",
  },
  // В казахских реквизитах пишут не транслит, а свои аббревиатуры:
  // ИИН → ЖСН, БИН → БСН, БИК → БСК, ИИК → ЖСК.
  requisites: {
    recipient: "Алушы",
    taxId: "ЖСН/БСН",
    bank: "Банк",
    bik: "БСК",
    iik: "ЖСК",
    amount: "Сома",
    purpose: "Төлем мақсаты",
  },
}
