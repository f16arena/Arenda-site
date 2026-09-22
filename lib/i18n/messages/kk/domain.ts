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
    PENALTY: "Айыппұл/өсімпұл",
    SERVICE_DELIVERED: "Көрсетілген қызмет",
    OTHER: "Басқа",
  },
  docTypes: {
    INVOICE: "Төлем шоты",
    ACT: "Көрсетілген қызметтер актісі",
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
