/**
 * Выгружает текст документов для юриста-переводчика.
 *
 * Зачем скрипт, а не «отправить готовый договор». Договор собирается из пунктов
 * с устойчивыми идентификаторами, и часть пунктов включается по условиям («как
 * есть», входящий долг, ступени аренды, услуги). В одном отрендеренном образце
 * видна только сработавшая ветка — переведи его, и реальный договор выйдет
 * наполовину русским. Поэтому здесь собираются ВСЕ пункты: состояние
 * выкручивается «на максимум» по каждому типу договора, результаты
 * объединяются по идентификатору.
 *
 * Подставляемые значения (даты, суммы, имена) заменяются на пометки вида
 * {{АРЕНДНАЯ_ПЛАТА}}: переводчик обязан сохранить их в своём тексте, программа
 * подставит туда настоящие данные. Порядок пометок внутри фразы менять можно —
 * в казахском другой порядок слов.
 *
 * Запуск: npx tsx scripts/export-contract-for-translation.ts
 * Результат: docs/translation/*.docx
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { assemble } from "@/lib/contract-engine/assemble"
import { defaultPlacementTerms, defaultState, type ContractState } from "@/lib/contract-engine/schema"
import { dateLong, money, moneyWithWords } from "@/lib/contract-engine/numerals"

const OUT_DIR = path.join(process.cwd(), "docs", "translation")

/** Образцовые значения подобраны неповторяющимися — их безопасно менять на пометки. */
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

/** Пометки для переводчика: что программа подставит вместо этого текста. */
function replacements(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    [SAMPLE.contractNumber, "{{НОМЕР_ДОГОВОРА}}"],
    [dateLong(SAMPLE.contractDate), "{{ДАТА_ДОГОВОРА}}"],
    [dateLong(SAMPLE.startDate), "{{ДАТА_НАЧАЛА}}"],
    [dateLong(SAMPLE.endDate), "{{ДАТА_ОКОНЧАНИЯ}}"],
    [moneyWithWords(SAMPLE.rent), "{{АРЕНДНАЯ_ПЛАТА_ПРОПИСЬЮ}}"],
    [moneyWithWords(SAMPLE.deposit), "{{ДЕПОЗИТ_ПРОПИСЬЮ}}"],
    [moneyWithWords(SAMPLE.debtTotal), "{{ДОЛГ_ПРОПИСЬЮ}}"],
    [money(SAMPLE.rent), "{{АРЕНДНАЯ_ПЛАТА}}"],
    [money(SAMPLE.deposit), "{{ДЕПОЗИТ}}"],
    [money(SAMPLE.debtTotal), "{{ДОЛГ}}"],
    [SAMPLE.landlordName, "{{АРЕНДОДАТЕЛЬ}}"],
    [SAMPLE.tenantName, "{{АРЕНДАТОР}}"],
    [SAMPLE.landlordSignatory, "{{ПОДПИСАНТ_АРЕНДОДАТЕЛЯ}}"],
    [SAMPLE.tenantSignatory, "{{ПОДПИСАНТ_АРЕНДАТОРА}}"],
    [SAMPLE.address, "{{АДРЕС_ЗДАНИЯ}}"],
    [SAMPLE.placement, "{{РАЗМЕЩЕНИЕ}}"],
    [SAMPLE.city, "{{ГОРОД}}"],
    [String(SAMPLE.area), "{{ПЛОЩАДЬ}}"],
  ]
  // Сначала длинные: «прописью» содержит в себе числа, иначе затрём частями.
  return pairs.sort((a, b) => b[0].length - a[0].length)
}

function withMarkers(text: string): string {
  let out = text
  for (const [sample, marker] of replacements()) {
    if (sample) out = out.split(sample).join(marker)
  }
  return out.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
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
  // Две ступени: одна не считается ступенчатой арендой и пункт не сработает.
  f.rentSteps = [
    { from: "2026-04", amount: SAMPLE.rent },
    { from: "2026-10", amount: SAMPLE.rent + 100000 },
  ]
  // Каждый ресурс даёт свой пункт («стоимость электроэнергии», «холодной воды»…),
  // поэтому включаем все по счётчику — иначе переводчик увидит только один.
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

type Clause = { section: string; num: string; id: string; text: string }

function collect(s: ContractState): Clause[] {
  const out: Clause[] = []
  for (const section of assemble(s).sections) {
    for (const item of section.items) {
      out.push({ section: `${section.num}. ${section.title}`, num: item.num, id: item.id, text: withMarkers(item.html) })
      for (const child of item.children) {
        out.push({ section: `${section.num}. ${section.title}`, num: child.num, id: child.id, text: withMarkers(child.html) })
      }
    }
  }
  return out
}

const HEAD = { bold: true, size: 20 }

function cell(text: string, widthPercent: number, opts: { bold?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 20 })] })],
  })
}

function clauseTable(clauses: Clause[]): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Идентификатор", ...HEAD })] })] }),
        new TableCell({ width: { size: 43, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Русский текст", ...HEAD })] })] }),
        new TableCell({ width: { size: 43, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Қазақша (заполняет переводчик)", ...HEAD })] })] }),
      ],
    }),
  ]
  let currentSection = ""
  for (const c of clauses) {
    if (c.section !== currentSection) {
      currentSection = c.section
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              width: { size: 100, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: currentSection, bold: true, size: 22 })] })],
            }),
          ],
        }),
      )
    }
    rows.push(new TableRow({ children: [cell(c.id, 14), cell(`${c.num} ${c.text}`, 43), cell("", 43)] }))
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function instructions(): Paragraph[] {
  const lines = [
    "Документ для официального перевода на казахский язык. Каждая строка таблицы — отдельный пункт договора; программа собирает из них готовый документ, поэтому переводить нужно построчно, сохраняя разбивку.",
    "",
    "1. Пометки вида {{АРЕНДНАЯ_ПЛАТА}} — это места, куда программа подставляет данные конкретного договора: сумму, дату, название организации. Их нужно перенести в казахский текст без изменений, ровно в таком же написании. Переставлять их внутри фразы можно и нужно — в казахском другой порядок слов. Удалять или переводить — нельзя.",
    "",
    "2. Номера пунктов (1.1, 2.3 и т.д.) проставляются программой автоматически. В переводе их писать не нужно — только текст пункта.",
    "",
    "3. Столбец «Идентификатор» не переводится и не меняется: по нему перевод возвращается на своё место в договоре.",
    "",
    "4. Термины просим привести к единому виду — они должны совпадать с интерфейсом программы:",
    "    арендодатель — жалға беруші; арендатор — жалға алушы; помещение — үй-жай; договор — шарт;",
    "    дополнительное соглашение — қосымша келісім; задолженность — берешек; пеня — өсімпұл;",
    "    гарантийный депозит — кепілдік жарна; реквизиты — деректемелер; счёт-фактура — шот-фактура.",
    "    Аббревиатуры: ИИН — ЖСН, БИН — БСН, БИК — БСК, ИИК — ЖСК, НДС — ҚҚС, ЭСФ — ЭШФ, ЭЦП — ЭЦҚ, КГД — МКК.",
    "",
    "5. Числа внутри текста (2 месяца, 5 число, 0,5 % в день, 10 %) — это образцы: программа подставляет туда настоящие значения договора. Постройте казахскую фразу так, чтобы она была верна при любом числе.",
    "",
    "6. Отдельная просьба: дайте, пожалуйста, формулировку пункта о преимущественной редакции — какая языковая версия применяется при расхождении. Договор будет выпускаться в две колонки (казахская и русская) одним документом, по статье 15 Закона РК «О языках».",
    "",
    "7. Если какая-то русская формулировка вызывает вопросы по существу (а не по переводу) — отметьте её, мы поправим оригинал.",
  ]
  return lines.map((text) => new Paragraph({ children: [new TextRun({ text, size: 20 })], spacing: { after: 60 } }))
}

// ── Второй файл: допсоглашение, счёт, АВР, акт сверки, акт приёма-передачи ──
//
// Здесь не сборка из пунктов, а короткие подписи и формулировки прямо в коде.
// Поэтому отдаём их таблицей «русская строка → перевод», а сверху кладём
// отрендеренный образец документа: без него «Итого:» переводить наугад.

const OTHER_DOCS: Array<{ title: string; files: string[]; sample?: () => string }> = [
  { title: "Дополнительное соглашение к договору", files: ["app/actions/contract-addendums.ts"] },
  {
    title: "Счёт на оплату",
    files: ["lib/invoice-engine/render.ts", "lib/invoice-engine/docx.ts", "lib/invoice-engine/schema.ts", "lib/invoice-engine/prefill.ts"],
  },
  {
    title: "АВР (акт выполненных работ), форма Р-1",
    files: ["lib/avr-engine/render.ts", "lib/avr-engine/docx.ts", "lib/avr-engine/schema.ts", "lib/avr-engine/prefill.ts"],
  },
  {
    title: "Акт сверки взаимных расчётов",
    files: ["lib/reconciliation-engine/render.ts", "lib/reconciliation-engine/docx.ts", "lib/reconciliation-engine/schema.ts"],
  },
  { title: "Акт приёма-передачи", files: ["app/api/handover/generate/route.ts"] },
]

const SKIP_LITERAL = /^[\s\d.,:;№/()«»—–-]*$/

/** По выражению внутри ${…} подбираем понятную переводчику пометку. */
function markerFor(expression: string): string {
  const e = expression.toLowerCase()
  if (e.includes("companyname") || e.includes("tenantname")) return "АРЕНДАТОР"
  if (e.includes("number")) return "НОМЕР"
  if (e.includes("today") || e.includes("date") || e.includes("fmt(")) return "ДАТА"
  if (e.includes("money(") || e.includes("amount") || e.includes("sum")) return "СУММА"
  if (e.includes("reason")) return "ОСНОВАНИЕ"
  if (e.includes("period") || e.includes("month")) return "ПЕРИОД"
  if (e.includes("percent") || e.includes("rate")) return "СТАВКА"
  return "ЗНАЧЕНИЕ"
}

/**
 * Шаблонная строка → читаемый текст с пометками. Скобки считаем вручную:
 * внутри ${…} встречаются вложенные тернарники со своими кавычками, и
 * регулярным выражением их не разобрать.
 */
function templateToMarkers(raw: string): string {
  let out = ""
  let i = 0
  const used = new Map<string, number>()
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
    const expression = raw.slice(start + 2, j - 1)
    const base = markerFor(expression)
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    out += n === 1 ? `{{${base}}}` : `{{${base}_${n}}}`
    i = j
  }
  return out.replace(/\s+/g, " ").trim()
}

async function russianLiterals(files: string[]): Promise<string[]> {
  const { readFile } = await import("node:fs/promises")
  const found = new Set<string>()
  for (const file of files) {
    let src: string
    try {
      src = await readFile(path.join(process.cwd(), file), "utf8")
    } catch {
      continue
    }
    src = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
    // Обычные строки в кавычках.
    for (const m of src.matchAll(/"([^"\\\n]*[А-Яа-яЁё][^"\\\n]*)"/g)) {
      const text = (m[1] ?? "").trim()
      if (text.length < 3 || SKIP_LITERAL.test(text) || text.startsWith("@/")) continue
      found.add(text)
    }
    // Шаблонные строки: в них лежит тело допсоглашения, и без них файл пустой.
    for (const m of src.matchAll(/`((?:[^`\\]|\\.)*[А-Яа-яЁё](?:[^`\\]|\\.)*)`/g)) {
      const text = templateToMarkers(m[1] ?? "")
      if (text.length < 3 || SKIP_LITERAL.test(text)) continue
      found.add(text)
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b, "ru"))
}

function stringsTable(rows: string[]): Table {
  const head = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Русский текст", ...HEAD })] })] }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Қазақша (заполняет переводчик)", ...HEAD })] })] }),
    ],
  })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [head, ...rows.map((text) => new TableRow({ children: [cell(text, 50), cell("", 50)] }))],
  })
}

async function buildOtherDocs(): Promise<number> {
  const { defaultAvrState, renderAvrText } = await import("@/lib/avr-engine")
  const { defaultInvoiceState, renderInvoiceText } = await import("@/lib/invoice-engine")
  const { defaultReconState, renderReconText } = await import("@/lib/reconciliation-engine")
  const samples: Record<string, string> = {
    "Счёт на оплату": renderInvoiceText(defaultInvoiceState()),
    "АВР (акт выполненных работ), форма Р-1": renderAvrText(defaultAvrState()),
    "Акт сверки взаимных расчётов": renderReconText(defaultReconState()),
  }

  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: "Остальные документы Commrent — текст для перевода", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Здесь короткие подписи и формулировки: заголовки документов, названия столбцов, строки подписей. "
            + "Перед каждой таблицей — образец готового документа, чтобы было видно, где эта строка стоит. "
            + "Прочерки «—» и нули в образце означают незаполненные данные конкретного документа.",
          size: 20,
        }),
      ],
      spacing: { after: 160 },
    }),
  ]

  let total = 0
  for (const doc of OTHER_DOCS) {
    const rows = await russianLiterals(doc.files)
    if (rows.length === 0) continue
    total += rows.length
    children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }))
    const sample = samples[doc.title]
    if (sample) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Образец документа:", italics: true, size: 18 })] }))
      for (const line of sample.split("\n")) {
        children.push(new Paragraph({ children: [new TextRun({ text: line || " ", size: 16, font: "Consolas" })] }))
      }
      children.push(new Paragraph({ text: "" }))
    }
    children.push(stringsTable(rows))
    console.log(`${doc.title}: строк ${rows.length}`)
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Всего строк к переводу: ${total}`, bold: true, size: 20 })],
      spacing: { before: 200 },
    }),
  )

  const doc = new Document({ sections: [{ children }] })
  const file = path.join(OUT_DIR, "Остальные документы — текст для перевода.docx")
  await writeFile(file, await Packer.toBuffer(doc))
  console.log(`Готово: ${file}`)
  return total
}

/**
 * Пункты, объявленные в коде, но не попавшие ни в один образец.
 *
 * Это главная проверка файла: если пункт не сработал ни при каком состоянии,
 * переводчик его не увидит, а в реальном договоре он однажды появится —
 * по-русски посреди казахского текста.
 */
async function declaredClauseIds(): Promise<string[]> {
  const { readFile } = await import("node:fs/promises")
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

  type Variant = {
    title: string
    type: string
    family: "premises" | "territory" | "equipment"
    tweak?: (s: ContractState) => void
  }
  const variants: Variant[] = [
    { title: "Договор аренды помещения", type: "PREMISES", family: "premises" },
    {
      // Пункт «что входит в арендную плату» и пункт «оплачивается отдельно»
      // исключают друг друга: при всех счётчиках первый не срабатывает.
      // Поэтому второй проход с коммунальными, включёнными в плату.
      title: "Договор аренды помещения — коммунальные включены в плату",
      type: "PREMISES",
      family: "premises",
      tweak: (s) => {
        for (const key of Object.keys(s.financials.premisesUtilities) as Array<
          keyof typeof s.financials.premisesUtilities
        >) {
          s.financials.premisesUtilities[key] = "included"
        }
      },
    },
    { title: "Договор аренды места на территории", type: "TERRITORY", family: "territory" },
    { title: "Договор о размещении оборудования", type: "EQUIPMENT", family: "equipment" },
  ]

  const seen = new Set<string>()
  const collectedIds = new Set<string>()
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: "Договоры Commrent — текст для перевода на казахский язык", heading: HeadingLevel.HEADING_1 }),
    ...instructions(),
  ]
  let total = 0

  for (const v of variants) {
    const state = maximalState(v.type, v.family)
    v.tweak?.(state)
    const clauses = collect(state)
    // Повторы между типами не отдаём переводчику дважды: платить за них не надо.
    for (const c of clauses) collectedIds.add(c.id)
    const fresh = clauses.filter((c) => {
      const key = `${c.id}::${c.text}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    total += fresh.length
    children.push(
      new Paragraph({ text: v.title, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
      new Paragraph({
        children: [new TextRun({ text: `Новых пунктов в этом типе: ${fresh.length} (совпадающие с предыдущими типами не повторяются).`, italics: true, size: 18 })],
        spacing: { after: 120 },
      }),
      clauseTable(fresh),
    )
    console.log(`${v.title}: собрано ${clauses.length}, из них новых ${fresh.length}`)
  }

  children.push(
    new Paragraph({ text: "Приложение: чего в этом файле нет", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "1) Договор аренды места на крыше/фасаде — русского текста пока не существует, его нужно составить отдельно. "
            + "2) Суммы прописью и склонение фамилий в казахском строятся по своим правилам — это делает программа, "
            + "от переводчика нужны только образцы: как пишется сумма прописью и как склоняется «в лице директора».",
          size: 20,
        }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Всего пунктов к переводу: ${total}`, bold: true, size: 20 })], spacing: { before: 200 } }),
  )

  const doc = new Document({ sections: [{ children }] })
  const file = path.join(OUT_DIR, "Договор — текст для перевода.docx")
  await writeFile(file, await Packer.toBuffer(doc))
  console.log(`Готово: ${file}`)
  console.log(`Пунктов договора к переводу: ${total}\n`)

  const declared = await declaredClauseIds()
  const missed = declared.filter((id) => !collectedIds.has(id))
  if (missed.length > 0) {
    console.log(`
ВНИМАНИЕ: не сработали и не попали в файл ${missed.length} пунктов из ${declared.length}:`)
    console.log("  " + missed.join(", "))
    console.log("  Их надо включить в состояние-образец, иначе в договоре они однажды выйдут по-русски.")
  } else {
    console.log(`
Покрытие: все ${declared.length} объявленных пунктов попали в файл.`)
  }

  const others = await buildOtherDocs()
  console.log(`\nИтого к переводу: ${total} пунктов договора и ${others} строк остальных документов.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
