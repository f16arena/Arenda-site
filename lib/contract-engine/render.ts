// Рендер договора в ДЕТЕРМИНИРОВАННУЮ строку (plain text).
//
// КРИТИЧНО (signing-контур): результат renderContractText кладётся в
// contract.content и подписывается ЭЦП через lib/contract-signing-payload.ts.
// Поэтому вывод обязан быть детерминированным: одно и то же состояние → одна и
// та же строка. Никаких Date.now()/случайностей в рендере.

import { type ContractState } from "./schema"
import { assemble, type AssemblyResult } from "./assemble"
import { partyIntro, partyRequisites } from "./parties"
import { dateLong, money } from "./numerals"
import { deriveContext } from "./derive"

function fillBlank(v: string | undefined | null, blank = "____________________________"): string {
  return v && v.trim() ? v.trim() : blank
}

/**
 * Текст приложений (Акт приёма-передачи / Заявление на услуги / Расчёт ЭР),
 * детерминированно — зеркало DOCX-приложений (lib/contract-engine/docx.ts).
 * Включается в content, чтобы арендатор видел ПОЛНЫЙ документ на странице подписи
 * и подпись покрывала приложения.
 */
function renderAnnexesText(s: ContractState): string[] {
  const c = deriveContext(s)
  const out: string[] = []
  const head = (no: number, title: string, subtitle: string) => {
    out.push("", "—".repeat(40))
    out.push(`Приложение № ${no} к Договору № ${s.meta.contractNumber || "____"} от ${dateLong(s.meta.contractDate)}`)
    out.push("", title, subtitle, "")
  }

  if (c.annexes.act) {
    const p = s.premises
    const h = s.handoverAct
    head(c.annexNumbers.act, "АКТ", "приёма-передачи нежилого помещения")
    out.push(`${s.meta.city}    ${dateLong(s.meta.contractDate)}`, "")
    out.push(`${s.landlord.name || "Арендодатель"} (Арендодатель) и ${s.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:`)
    out.push(`1. Арендодатель передал, а Арендатор принял нежилое помещение по адресу: ${p.buildingAddress || "________"}${p.placement ? ", " + p.placement : ""}, общей площадью ${p.spaceAreaSqm || "____"} кв. м.`)
    out.push("2. Состояние Помещения на момент передачи:")
    const conditions: [string, string][] = [
      ["стены", h?.conditionWalls ?? ""], ["пол", h?.conditionFloor ?? ""], ["потолок", h?.conditionCeiling ?? ""],
      ["окна, двери", h?.conditionWindowsDoors ?? ""], ["электропроводка, освещение", h?.conditionElectrical ?? ""],
      ["сантехника, отопление", h?.conditionPlumbing ?? ""], ["иное", h?.conditionOther ?? ""],
    ]
    for (const [label, value] of conditions) out.push(`    — ${label}: ${fillBlank(value)}`)
    out.push(`3. Показания счётчиков: электроэнергия ${fillBlank(h?.meterElectricity, "________")} кВт·ч; холодная вода ${fillBlank(h?.meterColdWater, "________")} куб. м; горячая вода ${fillBlank(h?.meterHotWater, "________")} куб. м.`)
    out.push(`4. Передаваемые ключи: ${fillBlank(h?.keysCount, "____")} комплектов.`)
    out.push("5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет.")
  }

  if (c.annexes.services) {
    const sv = s.financials.additionalServices
    head(c.annexNumbers.services, "ЗАЯВЛЕНИЕ", "на дополнительные услуги")
    out.push(`Арендатор: ${s.tenant.name || "________"}. Помещение: ${s.premises.buildingAddress || "________"}, ${s.premises.spaceAreaSqm || "____"} кв. м.`)
    out.push("Арендатор поручает Арендодателю оказание следующих услуг:")
    const rows: [string, boolean, string][] = [
      ["Уборка внутри Помещения", sv.premisesCleaning.ordered, sv.premisesCleaning.monthly ? money(sv.premisesCleaning.monthly) + "/мес" : sv.premisesCleaning.ratePerSqm ? money(sv.premisesCleaning.ratePerSqm) + " за 1 кв. м/мес" : "____/мес"],
      ["Стационарная телефонная линия", sv.phone.ordered, sv.phone.monthly ? money(sv.phone.monthly) + "/мес" : "по тарифам оператора"],
      ["Доступ в интернет (Wi-Fi)", sv.internet.ordered, sv.internet.monthly ? money(sv.internet.monthly) + "/мес" : "____/мес"],
      ["Охрана помещения (тревожная кнопка / пульт)", sv.premisesSecurity.ordered, sv.premisesSecurity.monthly ? money(sv.premisesSecurity.monthly) + "/мес" : "____/мес"],
    ]
    rows.forEach((r, i) => out.push(`    ${i + 1}. [${r[1] ? "✓" : " "}] ${r[0]} — ${r[2]}`))
    out.push("Стоимость услуг оплачивается ежемесячно одновременно с арендной платой отдельной строкой счёта. Состав услуг может быть изменён уведомлением за 15 календарных дней.")
  }

  if (c.annexes.operatingCosts) {
    const op = s.financials.operatingCosts
    head(c.annexNumbers.operatingCosts, "РАСЧЁТ", "эксплуатационных расходов")
    if (op.method === "fixed_per_sqm") {
      const area = s.premises.spaceAreaSqm || 0
      out.push(`Площадь Помещения: ${s.premises.spaceAreaSqm || "____"} кв. м`)
      out.push(`Тариф (окт–апр): ${money(op.fixed?.winterRate ?? 0)} за 1 кв. м/мес`)
      out.push(`Тариф (май–сен): ${money(op.fixed?.summerRate ?? 0)} за 1 кв. м/мес`)
      out.push(`Расходы в месяц (окт–апр): ${money((op.fixed?.winterRate ?? 0) * area)}`)
      out.push(`Расходы в месяц (май–сен): ${money((op.fixed?.summerRate ?? 0) * area)}`)
    } else {
      out.push("Формула долевого расчёта: ЭР = (Сумма фактических расходов здания за расчётный период ÷ Общая арендуемая площадь здания) × Площадь Помещения.")
      out.push(`Общая арендуемая площадь здания: ${s.building.totalRentableAreaSqm || "____"} кв. м`)
      out.push(`Площадь Помещения: ${s.premises.spaceAreaSqm || "____"} кв. м`)
      out.push(`Авансовая ставка: ${op.pooled?.estimatedRatePerSqm ? money(op.pooled.estimatedRatePerSqm) + " за 1 кв. м/мес" : "—"}`)
      out.push("Перерасчёт по фактическим расходам производится в порядке и сроки, установленные п. 3 Договора; разница подлежит доплате/возврату.")
    }
    out.push("Эксплуатационные расходы покрывают: " + c.covers.join("; ") + ".")
  }

  return out
}

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

  // Приложения (Акт приёма-передачи / Заявление на услуги / Расчёт ЭР) —
  // неотъемлемая часть договора, должны быть видны арендатору на подписи.
  lines.push(...renderAnnexesText(s))

  return lines.join("\n")
}

export function renderContract(s: ContractState): RenderedContract {
  return { text: renderContractText(s), assembly: assemble(s) }
}
