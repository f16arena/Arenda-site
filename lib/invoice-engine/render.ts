// Детерминированный текстовый рендер счёта (каноническая строка). Те же данные
// идут в DOCX и предпросмотр.

import { money, moneyWithWords } from "@/lib/contract-engine"
import { periodLabel } from "@/lib/avr-engine"
import { type InvoiceState, itemSum, invSubtotal, invVat, invTotal } from "./schema"

export function renderInvoiceText(s: InvoiceState): string {
  const out: string[] = []
  out.push("СЧЁТ НА ОПЛАТУ")
  out.push(`Номер: ${s.meta.number || "—"} · Дата: ${s.meta.date || "—"}`)
  out.push(`Период: ${periodLabel(s.period)}`)
  if (s.contractRef.number) out.push(`По договору № ${s.contractRef.number}${s.contractRef.date ? ` от ${s.contractRef.date}` : ""}`)
  if (s.dueDate) out.push(`Оплатить до: ${s.dueDate}`)
  out.push("")
  out.push(`Поставщик: ${s.seller.name || "—"} (ИИН/БИН ${s.seller.binIin || "—"})`)
  out.push(`  Банк: ${s.seller.bank || "—"}, ИИК ${s.seller.iik || "—"}, БИК ${s.seller.bik || "—"}, Кбе ${s.seller.kbe || "—"}, КНП ${s.seller.knp || "—"}`)
  out.push(`Получатель: ${s.buyer.name || "—"} (ИИН/БИН ${s.buyer.binIin || "—"})`)
  out.push("")
  out.push("Позиции:")
  s.items.forEach((it, i) => {
    out.push(`${i + 1}. ${it.name || "—"} | ${it.unit || "—"} | кол-во: ${it.qty} | цена: ${money(it.price)} | сумма: ${money(itemSum(it))}`)
  })
  out.push("")
  out.push(`Итого: ${money(invSubtotal(s))}`)
  if (s.vat.enabled) out.push(`в т.ч. НДС ${s.vat.rate}%: ${money(invVat(s))}`)
  out.push(`Всего к оплате: ${moneyWithWords(invTotal(s))}`)
  out.push("")
  out.push(`Поставщик: ${s.seller.signatory || "____"} ____________ М.П.`)
  return out.join("\n")
}
