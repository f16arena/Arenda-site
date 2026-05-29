// Детерминированный текстовый рендер АВР — каноническая строка, которую подписывает
// ЭЦП-контур (аналог contract.content). От порядка полей зависит подпись: не менять
// произвольно. Те же данные идут в DOCX (форма Р-1) и в предпросмотр.

import { money, moneyWithWords } from "@/lib/contract-engine"
import { type AvrState, type AvrParty, itemSum, avrSubtotal, avrVat, avrTotal, periodLabel, periodEndDate } from "./schema"

function partyBlock(label: string, p: AvrParty): string {
  const lines = [
    `${label}: ${p.name || "—"}`,
    `  ИИН/БИН: ${p.binIin || "—"}`,
    `  Адрес: ${p.address || "—"}`,
  ]
  if (p.comm) lines.push(`  Связь: ${p.comm}`)
  lines.push(`  В лице: ${p.signatory || "—"}${p.position ? `, ${p.position}` : ""}`)
  return lines.join("\n")
}

export function renderAvrText(s: AvrState): string {
  const out: string[] = []
  out.push("АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) — форма Р-1")
  out.push(`Номер документа: ${s.meta.number || "—"}`)
  out.push(`Дата составления: ${s.meta.date || "—"}`)
  out.push(`Период оказания услуг: ${periodLabel(s.period)}`)
  out.push(`Договор (контракт): № ${s.contractRef.number || "—"}${s.contractRef.date ? ` от ${s.contractRef.date}` : ""}`)
  out.push("")
  out.push(partyBlock("Исполнитель", s.executor))
  out.push(partyBlock("Заказчик", s.customer))
  out.push("")
  out.push("Перечень работ (услуг):")
  s.items.forEach((it, i) => {
    out.push(
      `${i + 1}. ${it.name || "—"} | дата: ${it.date || "—"} | ед.: ${it.unit || "—"} | кол-во: ${it.qty} | цена: ${money(it.price)} | стоимость: ${money(itemSum(it))}`,
    )
  })
  const subtotal = avrSubtotal(s)
  const vat = avrVat(s)
  const total = avrTotal(s)
  out.push("")
  out.push(`Итого: ${money(subtotal)}`)
  if (s.vat.enabled) out.push(`в т.ч. НДС ${s.vat.rate}%: ${money(vat)}`)
  out.push(`Всего к оплате: ${moneyWithWords(total)}`)
  out.push("")
  out.push(`Сведения об использовании запасов заказчика: ${s.stocks || "не использовались"}`)
  out.push(`Приложение: перечень документации на ${s.attachmentPages || 0} страниц(е/ах).`)
  out.push("")
  out.push("Работы (услуги) выполнены в полном объёме и в установленные сроки; стороны претензий друг к другу не имеют.")
  out.push(`Сдал (Исполнитель): ${s.executor.signatory || "____"} ____________ М.П.`)
  out.push(`Принял (Заказчик): ${s.customer.signatory || "____"} ____________ М.П.`)
  // Косвенно фиксируем период конца оказания для воспроизводимости.
  out.push(`(дата оказания: ${periodEndDate(s.period) || "—"})`)
  return out.join("\n")
}
