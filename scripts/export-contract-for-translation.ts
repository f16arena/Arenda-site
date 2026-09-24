/**
 * Готовит документы для юриста-переводчика — в том виде, в каком их привычно
 * читать: обычный договор с шапкой, разделами и пунктами подряд, с прочерками
 * вместо подставляемых значений, как в бумажном бланке.
 *
 * Почему так, а не таблицей «пункт → перевод»: переводчику нужен документ,
 * иначе связный юридический текст не получится. Разложить перевод обратно по
 * пунктам — задача программы, а не человека; для этого рядом пишется
 * служебный файл соответствия (clause-map.json), который переводчику не идёт.
 *
 * Договор собирается из пунктов, часть включается по условиям. Поэтому каждый
 * тип рендерится в «максимальной» конфигурации: включено всё, что можно, —
 * иначе непопавшие пункты однажды выйдут по-русски посреди казахского текста.
 * Взаимоисключающие формулировки вынесены в приложение «Варианты пунктов».
 *
 * Запуск: npx tsx scripts/export-contract-for-translation.ts
 * Результат: docs/translation/*.docx
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { assemble } from "@/lib/contract-engine/assemble"
import { renderContractText } from "@/lib/contract-engine/render"
import { defaultPlacementTerms, defaultState, type ContractState } from "@/lib/contract-engine/schema"
import { dateLong, money, moneyWithWords } from "@/lib/contract-engine/numerals"

const OUT_DIR = path.join(process.cwd(), "docs", "translation")

/** Образцовые значения намеренно неповторяющиеся — их безопасно менять на прочерки. */
const SAMPLE = {
  contractNumber: "ДГ-777001",
  contractDate: "2026-03-17",
  city: "г. Усть-Каменогорск",
  landlordName: "ТОО «Арендодатель-Образец»",
  landlordSignatory: "Сериков С.С.",
  tenantName: "ТОО «Арендатор-Образец»",
  tenantSignatory: "Мұратов М.М.",
  address: "г. Усть-Каменогорск, проспект Образцовый, 77",
  placement: "3 этаж, помещение 317",
  area: 137,
  rent: 1234567,
  deposit: 2345678,
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  debtTotal: 3456789,
}

const LINE = "_________________"
const MONEY_BLANK = "__________ ₸ (______________________________)"
const DATE_BLANK = "«___» ____________ 20__ г."

/** Прочерки вместо подставляемых значений — как в бумажном бланке договора. */
function blanks(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    [SAMPLE.contractNumber, "________"],
    [dateLong(SAMPLE.contractDate), DATE_BLANK],
    [dateLong(SAMPLE.startDate), DATE_BLANK],
    [dateLong(SAMPLE.endDate), DATE_BLANK],
    [moneyWithWords(SAMPLE.rent), MONEY_BLANK],
    [moneyWithWords(SAMPLE.deposit), MONEY_BLANK],
    [moneyWithWords(SAMPLE.debtTotal), MONEY_BLANK],
    [money(SAMPLE.rent), "__________ ₸"],
    [money(SAMPLE.deposit), "__________ ₸"],
    [money(SAMPLE.debtTotal), "__________ ₸"],
    [SAMPLE.landlordName, LINE],
    [SAMPLE.tenantName, LINE],
    [SAMPLE.landlordSignatory, "____________________"],
    [SAMPLE.tenantSignatory, "____________________"],
    [SAMPLE.address, LINE],
    [SAMPLE.city, "г. ____________"],
    [SAMPLE.placement, "____________"],
    [String(SAMPLE.area), "______"],
  ]
  // Сначала длинные: сумма прописью содержит в себе число, иначе затрём частями.
  return pairs.sort((a, b) => b[0].length - a[0].length)
}

function withBlanks(text: string): string {
  let out = text
  for (const [sample, blank] of blanks()) {
    if (sample) out = out.split(sample).join(blank)
  }
  return out.replace(/<[^>]+>/g, "")
}

/** Состояние «включено всё, что можно» — чтобы сработали и необязательные пункты. */
function maximalState(placementType: string, family: "premises" | "territory" | "equipment"): ContractState {
  const s = defaultState()
  s.meta.contractNumber = SAMPLE.contractNumber
  s.meta.contractDate = SAMPLE.contractDate
  s.meta.city = SAMPLE.city
  s.meta.placementType = placementType
  s.landlord.name = SAMPLE.landlordName
  s.landlord.signatory = SAMPLE.landlordSignatory
  s.tenant.name = SAMPLE.tenantName
  s.tenant.signatory = SAMPLE.tenantSignatory
  s.premises.buildingAddress = SAMPLE.address
  s.premises.placement = SAMPLE.placement
  s.premises.spaceAreaSqm = SAMPLE.area
  s.building.totalRentableAreaSqm = 5000
  s.term.startDate = SAMPLE.startDate
  s.term.endDate = SAMPLE.endDate

  const f = s.financials
  f.monthlyRent = SAMPLE.rent
  f.deposit.enabled = true
  f.deposit.amount = SAMPLE.deposit
  f.deposit.installmentAllowed = true
  f.indexation.enabled = true
  f.debtSettlement = {
    enabled: true,
    totalAmount: SAMPLE.debtTotal,
    basisDoc: "акт сверки",
    discountPercent: 10,
    payWithinMonths: 2,
  }
  // Две ступени: одна ступенчатой арендой не считается и пункт не сработает.
  f.rentSteps = [
    { from: "2026-04", amount: SAMPLE.rent },
    { from: "2026-10", amount: SAMPLE.rent + 100000 },
  ]
  // Каждый ресурс даёт свой пункт («стоимость электроэнергии», «холодной воды»…),
  // поэтому включаем все по счётчику — иначе в документ попадёт только один.
  for (const key of Object.keys(f.premisesUtilities) as Array<keyof typeof f.premisesUtilities>) {
    f.premisesUtilities[key] = "metered_separate"
  }
  f.operatingCosts.method = "fixed_per_sqm"
  f.operatingCosts.fixed = { winterRate: 900, summerRate: 600 }
  f.additionalServices.premisesCleaning = { ordered: true, ratePerSqm: 350 }
  f.additionalServices.internet = { ordered: true, monthly: 15000 }
  f.additionalServices.phone = { ordered: true }
  f.additionalServices.premisesSecurity = { ordered: true, monthly: 30000 }
  f.additionalServices.other = { ordered: true }

  s.modules.asIsAcceptanceEnabled = true
  if (family !== "premises") {
    s.premises.purposeUse = "размещения (эксплуатации) оборудования"
    s.placement = { ...defaultPlacementTerms(family), family }
  }
  return s
}

/** Тот же договор, но коммунальные включены в плату: другая редакция пунктов. */
function utilitiesIncluded(s: ContractState): ContractState {
  const copy: ContractState = JSON.parse(JSON.stringify(s))
  for (const key of Object.keys(copy.financials.premisesUtilities) as Array<
    keyof typeof copy.financials.premisesUtilities
  >) {
    copy.financials.premisesUtilities[key] = "included"
  }
  return copy
}

type Clause = { id: string; num: string; text: string }

function clauses(s: ContractState): Clause[] {
  const out: Clause[] = []
  for (const section of assemble(s).sections) {
    for (const item of section.items) {
      out.push({ id: item.id, num: item.num, text: withBlanks(item.html) })
      for (const child of item.children) out.push({ id: child.id, num: child.num, text: withBlanks(child.html) })
    }
  }
  return out
}

const TYPES: Array<{ file: string; title: string; type: string; family: "premises" | "territory" | "equipment" }> = [
  { file: "1. Договор аренды помещения", title: "Договор аренды нежилого помещения", type: "PREMISES", family: "premises" },
  { file: "2. Договор аренды места на территории", title: "Договор аренды места на прилегающей территории", type: "TERRITORY", family: "territory" },
  { file: "3. Договор о размещении оборудования", title: "Договор о размещении оборудования", type: "EQUIPMENT", family: "equipment" },
]

const NOTE = [
  "Документ для перевода на казахский язык.",
  "",
  "Прочерки (________) — это места, куда программа подставляет данные конкретного договора: номер, дату, название организации, сумму, площадь. В казахском тексте их нужно сохранить, поставив на то место, которого требует казахский порядок слов.",
  "",
  "Числа внутри текста (5 число месяца, 30 календарных дней, 0,5 % в день, 10 %) — образцы: программа подставляет туда настоящие значения. Постройте фразу так, чтобы она была верна при любом числе.",
  "",
  "Номера пунктов (1.1, 2.3 …) программа проставляет сама, в переводе они не нужны — важен порядок пунктов, он должен остаться тем же.",
  "",
  "Термины просим привести к единому виду, они должны совпадать с интерфейсом программы: арендодатель — жалға беруші, арендатор — жалға алушы, помещение — үй-жай, договор — шарт, дополнительное соглашение — қосымша келісім, задолженность — берешек, пеня — өсімпұл, гарантийный депозит — кепілдік жарна, реквизиты — деректемелер. Аббревиатуры: ИИН — ЖСН, БИН — БСН, БИК — БСК, ИИК — ЖСК, НДС — ҚҚС, ЭСФ — ЭШФ, ЭЦП — ЭЦҚ.",
  "",
  "Отдельная просьба: дайте, пожалуйста, формулировку пункта о преимущественной редакции — какая языковая версия применяется при расхождении. Договор выпускается в две колонки (казахская и русская) одним документом, по статье 15 Закона РК «О языках».",
  "",
  "Если какая-то формулировка вызывает вопросы по существу, а не по переводу, — отметьте её, поправим русский оригинал.",
]

function docFrom(title: string, body: string, extra: Paragraph[] = []): Document {
  const head = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...NOTE.map((t) => new Paragraph({ children: [new TextRun({ text: t, size: 18, italics: true })] })),
    new Paragraph({ text: "" }),
    new Paragraph({ border: { bottom: { style: "single", size: 6, color: "999999" } }, children: [] }),
    new Paragraph({ text: "" }),
  ]
  const lines = body.split("\n").map((line) => {
    const isHeading = /^\d+\.\s+\S/.test(line) && line.length < 80
    return new Paragraph({
      children: [new TextRun({ text: line || " ", size: 22, bold: isHeading })],
      spacing: { after: line ? 80 : 0 },
    })
  })
  return new Document({ sections: [{ children: [...head, ...lines, ...extra] }] })
}

async function declaredClauseIds(): Promise<string[]> {
  const ids = new Set<string>()
  for (const file of ["lib/contract-engine/registry.ts", "lib/contract-engine/placement.ts"]) {
    const src = await readFile(path.join(process.cwd(), file), "utf8")
    for (const m of src.matchAll(/\bid:\s*"(cl_[\w-]+)"/g)) {
      // Идентификатор, склеенный из куска и переменной («cl_sep_» + ключ),
      // проверить нечем: настоящие ключи известны только во время сборки.
      if (!src.includes(`"${m[1]}" +`)) ids.add(m[1])
    }
  }
  return [...ids].sort()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const covered = new Set<string>()
  const map: Record<string, Clause[]> = {}

  for (const t of TYPES) {
    const state = maximalState(t.type, t.family)
    const list = clauses(state)
    for (const c of list) covered.add(c.id)
    map[t.type] = list

    // Пункты, которые в основной редакции не сработали: коммунальные, включённые
    // в арендную плату, исключают пункт «оплачивается отдельно», и наоборот.
    const alternative = clauses(utilitiesIncluded(state)).filter((c) => !list.some((x) => x.id === c.id))
    for (const c of alternative) covered.add(c.id)

    const extra: Paragraph[] = []
    if (alternative.length > 0) {
      extra.push(
        new Paragraph({ text: "Приложение. Варианты пунктов", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
        new Paragraph({
          children: [
            new TextRun({
              text:
                "Эти пункты встают в договор вместо соседних, когда коммунальные услуги включены в арендную плату, "
                + "а не оплачиваются по счётчику отдельно. Их тоже нужно перевести.",
              italics: true,
              size: 18,
            }),
          ],
          spacing: { after: 120 },
        }),
        ...alternative.map((c) => new Paragraph({ children: [new TextRun({ text: c.text, size: 22 })], spacing: { after: 80 } })),
      )
      map[`${t.type}_ALT`] = alternative
    }

    const body = withBlanks(renderContractText(state))
    await writeFile(path.join(OUT_DIR, `${t.file}.docx`), await Packer.toBuffer(docFrom(t.title, body, extra)))
    console.log(`${t.file}.docx — пунктов ${list.length}${alternative.length ? `, вариантов ${alternative.length}` : ""}`)
  }

  await buildOtherDocs(map)

  const declared = await declaredClauseIds()
  const missed = declared.filter((id) => !covered.has(id))
  if (missed.length > 0) {
    console.log(`\nВНИМАНИЕ: не попали в документы ${missed.length} пунктов из ${declared.length}:`)
    console.log("  " + missed.join(", "))
    console.log("  Переводчику отдавать нельзя: эти пункты однажды выйдут по-русски.")
  } else {
    console.log(`\nПокрытие: все ${declared.length} объявленных пунктов попали в документы.`)
  }

  // Служебный файл: по нему перевод раскладывается обратно по пунктам.
  // Переводчику он не нужен.
  await writeFile(path.join(OUT_DIR, "clause-map.json"), JSON.stringify(map, null, 1), "utf8")
  console.log("Служебное соответствие пунктов: docs/translation/clause-map.json")
}

// ── Остальные документы: допсоглашение, счёт, АВР, акт сверки, приём-передача ──

async function buildOtherDocs(map: Record<string, Clause[]>) {
  const { defaultAvrState, renderAvrText } = await import("@/lib/avr-engine")
  const { defaultInvoiceState, renderInvoiceText } = await import("@/lib/invoice-engine")
  const { defaultReconState, renderReconText } = await import("@/lib/reconciliation-engine")

  const docs: Array<{ file: string; title: string; body: string }> = [
    { file: "4. Счёт на оплату", title: "Счёт на оплату", body: renderInvoiceText(defaultInvoiceState()) },
    { file: "5. АВР (акт выполненных работ)", title: "Акт выполненных работ (оказанных услуг), форма Р-1", body: renderAvrText(defaultAvrState()) },
    { file: "6. Акт сверки", title: "Акт сверки взаимных расчётов", body: renderReconText(defaultReconState()) },
  ]

  for (const d of docs) {
    await writeFile(path.join(OUT_DIR, `${d.file}.docx`), await Packer.toBuffer(docFrom(d.title, d.body)))
    console.log(`${d.file}.docx`)
  }

  // Допсоглашения собираются не движком, а серверным действием, поэтому текст
  // берём из исходника: там четыре вида ДС, каждый своим блоком.
  const src = (await readFile(path.join(process.cwd(), "app/actions/contract-addendums.ts"), "utf8"))
    .replace(/\/\/[^\n]*/g, "")
  const blocks = new Set<string>()
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*[А-Яа-яЁё](?:[^`\\]|\\.)*)`/g)) {
    const text = templateToBlanks(m[1] ?? "")
    if (text.length > 2) blocks.add(text)
  }
  const lines = [...blocks]
  await writeFile(
    path.join(OUT_DIR, "7. Дополнительные соглашения.docx"),
    await Packer.toBuffer(
      docFrom(
        "Дополнительные соглашения к договору аренды",
        "Формулировки дополнительных соглашений: продление срока, расторжение, изменение условий аренды, подключение услуг.\n\n"
          + lines.join("\n"),
      ),
    ),
  )
  map.ADDENDUM = lines.map((text, i) => ({ id: `ads_${i}`, num: "", text }))
  console.log(`7. Дополнительные соглашения.docx — формулировок ${lines.length}`)
}

/** Шаблонная строка → текст с прочерками вместо подставляемых значений. */
function templateToBlanks(raw: string): string {
  let out = ""
  let i = 0
  while (i < raw.length) {
    const start = raw.indexOf("${", i)
    if (start === -1) {
      out += raw.slice(i)
      break
    }
    out += raw.slice(i, start)
    let depth = 1
    let j = start + 2
    while (j < raw.length && depth > 0) {
      if (raw[j] === "{") depth++
      else if (raw[j] === "}") depth--
      j++
    }
    out += "________"
    i = j
  }
  return out.replace(/\s+/g, " ").trim()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
