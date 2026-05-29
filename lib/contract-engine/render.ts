// Рендер договора в ДЕТЕРМИНИРОВАННУЮ строку (plain text).
//
// КРИТИЧНО (signing-контур): результат renderContractText кладётся в
// contract.content и подписывается ЭЦП через lib/contract-signing-payload.ts.
// Поэтому вывод обязан быть детерминированным: одно и то же состояние → одна и
// та же строка. Никаких Date.now()/случайностей в рендере.

import { type ContractState } from "./schema"
import { assemble, type AssemblyResult } from "./assemble"
import { partyIntro, partyRequisites } from "./parties"
import { dateLong } from "./numerals"

export interface RenderedContract {
  text: string
  assembly: AssemblyResult
}

export function renderContractText(s: ContractState): string {
  const a = assemble(s)
  const lines: string[] = []

  lines.push(`ДОГОВОР № ${s.meta.contractNumber || "____"}`)
  lines.push("аренды нежилого помещения")
  lines.push("")
  lines.push(`${s.meta.city}    ${dateLong(s.meta.contractDate)}`)
  lines.push("")
  lines.push(
    `${partyIntro(s.landlord, "Арендодатель")}, с одной стороны, и ${partyIntro(s.tenant, "Арендатор")}, с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:`,
  )
  lines.push("")

  for (const sec of a.sections) {
    lines.push(`${sec.num}. ${sec.title}`)
    for (const it of sec.items) {
      lines.push(it.sub ? `${it.num}. ${it.sub} ${it.html}` : `${it.num}. ${it.html}`)
      for (const k of it.children) lines.push(`    ${k.num}. ${k.html}`)
    }
    lines.push("")
  }

  lines.push(`${a.requisitesNum}. Реквизиты и подписи Сторон`)
  lines.push("")
  lines.push("АРЕНДОДАТЕЛЬ:")
  lines.push(partyRequisites(s.landlord))
  lines.push("")
  lines.push("АРЕНДАТОР:")
  lines.push(partyRequisites(s.tenant))

  return lines.join("\n")
}

export function renderContract(s: ContractState): RenderedContract {
  return { text: renderContractText(s), assembly: assemble(s) }
}
