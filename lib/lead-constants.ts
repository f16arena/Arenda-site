// Константы лидов вынесены отдельно от server actions:
// файлы с "use server" экспортируют только async функции в клиент,
// константы из них приходят undefined.

export const LEAD_STATUSES = ["NEW", "SHOWN", "NEGOTIATION", "SIGNED", "LOST"] as const
export const LEAD_SOURCES = ["SITE", "KRISHA", "OLX", "WORD_OF_MOUTH", "CALL", "OTHER"] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]
