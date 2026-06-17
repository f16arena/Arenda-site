// Вводные формулы сторон (преамбула) и блок реквизитов — по типу стороны.
// Портировано из прототипа intro()/reqBlock().

import { type Party } from "./schema"

/** Идентификатор стороны для преамбулы (БИН/ИИН по типу). */
function partyId(p: Party): string {
  if (p.type === "too") return p.bin ? `БИН ${p.bin}` : "БИН ________"
  if (p.type === "ip") return p.bin || p.iin ? `ИИН/БИН ${p.bin || p.iin}` : "ИИН/БИН ________"
  return p.iin ? `ИИН ${p.iin}` : "ИИН ________"
}

/** Удостоверение личности физлица одной строкой: «удостоверение личности №… от …, выдано …». */
function idDocPhrase(p: Party): string {
  if (!p.idDocNumber && !p.idDocIssuedBy && !p.idDocIssuedAt) return ""
  const parts = [`удостоверение личности №${p.idDocNumber || "________"}`]
  if (p.idDocIssuedAt) parts.push(`от ${p.idDocIssuedAt}`)
  if (p.idDocIssuedBy) parts.push(`выдано ${p.idDocIssuedBy}`)
  return parts.join(" ")
}

/** Преамбула стороны: «… (БИН …), в лице …, действующего на основании …, именуемое «Арендодатель»». */
export function partyIntro(p: Party, role: string): string {
  const id = partyId(p)
  const name = p.type === "ip" ? "Индивидуальный предприниматель " + p.name : p.name
  if (p.type === "individual") {
    const sub = p.individualSubtype && p.individualSubtype !== "regular"
    // ЧСИ/адвокат/нотариус — лицо частной практики, действует на основании лицензии.
    if (sub && p.basis && p.basis.trim()) {
      return `${name} (${id}), действующий(-ая) на основании ${p.basis}, именуемый(-ая) в дальнейшем «${role}»`
    }
    // Обычное физлицо — выступает ОТ СВОЕГО ИМЕНИ. Основание — удостоверение
    // личности (если заполнено), без «в лице» и «на основании устава».
    const doc = idDocPhrase(p)
    const tail = doc ? `, ${doc}` : ""
    return `гражданин(-ка) ${name} (${id})${tail}, действующий(-ая) от своего имени, именуемый(-ая) в дальнейшем «${role}»`
  }
  return `${name} (${id}), в лице ${p.signatory || "________"}, действующего на основании ${p.basis || "________"}, именуемое в дальнейшем «${role}»`
}

/** Блок реквизитов стороны (для раздела 13), plain-text. */
export function partyRequisites(p: Party): string {
  // Физлицо: адрес проживания, ИИН, удостоверение личности, без «Основание:
  // Устав» и без М.П. (печати нет); подпись — сам гражданин.
  if (p.type === "individual" && (!p.individualSubtype || p.individualSubtype === "regular")) {
    const lines = [
      p.name || "________",
      `Адрес проживания: ${p.address || "________"}`,
      `ИИН: ${p.iin || "________"}`,
    ]
    const doc = idDocPhrase(p)
    if (doc) lines.push(doc.charAt(0).toUpperCase() + doc.slice(1))
    if (p.iik || p.bank || p.bik) lines.push(`ИИК: ${p.iik || "________"} · Банк: ${p.bank || "________"} · БИК: ${p.bik || "________"}`)
    if (p.phone) lines.push(`Тел.: ${p.phone}`)
    if (p.email) lines.push(`E-mail: ${p.email}`)
    lines.push("_______________ /" + (p.name || "________") + "/")
    return lines.join("\n")
  }
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
