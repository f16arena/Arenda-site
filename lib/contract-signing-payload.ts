// Канонический («подписываемый») образ договора.
//
// Обе стороны (арендатор и арендодатель) подписывают через NCALayer ОДИН И ТОТ ЖЕ
// детерминированный текст. Сервер заново строит его из БД и сверяет с тем, что
// вложено в CMS (encapContentInfo), — так подпись жёстко привязывается к конкретной
// редакции договора и не может быть «переклеена» на другой документ.
//
// Формат намеренно стабилен: любое изменение здесь инвалидирует ранее снятые
// проверки привязки, поэтому версионируем префиксом.

const PAYLOAD_VERSION = "ARENDA-CONTRACT-SIGN-V1"

export interface ContractSigningFields {
  number: string
  type?: string | null
  content: string
  startDate?: Date | string | null
  endDate?: Date | string | null
  tenantCompany?: string | null
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return date.toISOString().slice(0, 10) // YYYY-MM-DD, без таймзонных сдвигов формата
}

/**
 * Строит детерминированную строку для подписи. Одинаковый ввод → одинаковый вывод
 * (важно для сверки на сервере). Перевод строк нормализуем к \n.
 */
export function buildContractSigningPayload(c: ContractSigningFields): string {
  const docTitle = c.type === "ADDENDUM" ? "ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ" : "ДОГОВОР АРЕНДЫ"
  const content = (c.content ?? "").replace(/\r\n/g, "\n").trim()
  const lines = [
    PAYLOAD_VERSION,
    `${docTitle} № ${c.number}`,
    `Период: ${fmtDate(c.startDate)} — ${fmtDate(c.endDate)}`,
    `Арендатор: ${c.tenantCompany ?? "—"}`,
    "---",
    content,
  ]
  return lines.join("\n")
}

/** base64 (UTF-8) от канонического payload — именно это уходит в NCALayer на подпись. */
export function contractPayloadBase64(c: ContractSigningFields): string {
  return Buffer.from(buildContractSigningPayload(c), "utf-8").toString("base64")
}
