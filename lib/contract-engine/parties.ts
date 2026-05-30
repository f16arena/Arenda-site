// Вводные формулы сторон (преамбула) и блок реквизитов — по типу стороны.
// Портировано из прототипа intro()/reqBlock().

import { type Party } from "./schema"

/** Идентификатор стороны для преамбулы (БИН/ИИН по типу). */
function partyId(p: Party): string {
  if (p.type === "too") return p.bin ? `БИН ${p.bin}` : "БИН ________"
  if (p.type === "ip") return p.bin || p.iin ? `ИИН/БИН ${p.bin || p.iin}` : "ИИН/БИН ________"
  return p.iin ? `ИИН ${p.iin}` : "ИИН ________"
}

/** Преамбула стороны: «… (БИН …), в лице …, действующего на основании …, именуемое «Арендодатель»». */
export function partyIntro(p: Party, role: string): string {
  const id = partyId(p)
  const name = p.type === "ip" ? "Индивидуальный предприниматель " + p.name : p.name
  if (p.type === "individual") {
    return `${name} (${id}), действующий(-ая) от своего имени, именуемый(-ая) в дальнейшем «${role}»`
  }
  return `${name} (${id}), в лице ${p.signatory || "________"}, действующего на основании ${p.basis || "________"}, именуемое в дальнейшем «${role}»`
}

/** Блок реквизитов стороны (для раздела 13), plain-text. */
export function partyRequisites(p: Party): string {
  const idLabel = p.type === "too" ? "БИН" : "ИИН"
  const lines = [
    p.name || "________",
    `Адрес: ${p.address || "________"}`,
    `${idLabel}: ${p.bin || p.iin || "________"}`,
    `ИИК: ${p.iik || "________"} · Банк: ${p.bank || "________"} · БИК: ${p.bik || "________"}`,
  ]
  if (p.phone) lines.push(`Тел.: ${p.phone}`)
  if (p.email) lines.push(`E-mail: ${p.email}`)
  lines.push(`Основание: ${p.basis || "________"}`)
  lines.push("_______________ /" + (p.signatory || "________") + "/ М.П.")
  return lines.join("\n")
}
