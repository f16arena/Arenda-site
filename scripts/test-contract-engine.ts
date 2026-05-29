// Приёмочные тесты ядра конструктора договоров (спецификация §15).
// Чистый движок, без БД/окружения. Запуск: npm run test:engine

import {
  defaultState,
  assemble,
  validate,
  advise,
  applyAdvisorFix,
  deriveContext,
  renderContractText,
  effectiveState,
  availableAmendmentTypes,
  renderAmendment,
  canTransition,
  type Amendment,
  type AmendmentType,
  type ContractState,
} from "../lib/contract-engine"

let passed = 0
let failed = 0
function check(name: string, cond: boolean | undefined) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

function clone(s: ContractState): ContractState {
  return structuredClone(s)
}

// ── базовое состояние с разумными значениями для генерации ──
function base(): ContractState {
  const s = defaultState()
  s.financials.monthlyRent = 300_000
  s.financials.deposit.amount = 300_000
  s.premises.spaceAreaSqm = 50
  s.term.startDate = "2026-06-01"
  s.term.endDate = "2027-05-31"
  return s
}

// 1. Пресет A — всё включено, электро по счётчику, расходов нет
{
  const s = base()
  const a = assemble(s)
  const c = a.ctx
  check("A: электро metered", c.metered.some((r) => r.key === "electricity"))
  check("A: нет эксплуатационных расходов", !c.opEnabled)
  check("A: нет блока cl_service_fee", !a.snapshot["cl_service_fee"])
  check("A: Прил.№3 выключено", !c.annexes.operatingCosts)
  check("A: annex_list без Прил.№3", !renderContractText(s).includes("Приложение № 3"))
  check("A: валидатор чист", a.validation.hard.length === 0)
}

// 2. Пресет B — раздельный учёт + фикс. сбор за МОП
{
  const s = base()
  s.financials.premisesUtilities = {
    electricity: "metered_separate",
    coldWater: "metered_separate",
    hotWater: "metered_separate",
    heating: "metered_separate",
    sewerage: "metered_separate",
    garbage: "metered_separate",
  }
  s.financials.operatingCosts = {
    method: "fixed_per_sqm",
    scope: "common_area",
    fixed: { winterRate: 500, summerRate: 300 },
  }
  const a = assemble(s)
  check("B: эксплуатационные расходы включены", a.ctx.opEnabled)
  check("B: есть cl_service_fee", !!a.snapshot["cl_service_fee"])
  check("B: Прил.№3 включено", a.ctx.annexes.operatingCosts)
  check("B: подпункты по счётчику для каждого ресурса", !!a.snapshot["cl_sep_coldWater"] && !!a.snapshot["cl_sep_heating"])
  check("B: валидатор чист (ставки заданы)", a.validation.hard.length === 0)
}

// 3. Пресет C — котловой долевой расчёт, all_inclusive, без двойного начисления
{
  const s = base()
  s.financials.premisesUtilities = {
    electricity: "in_operating_costs",
    coldWater: "in_operating_costs",
    hotWater: "in_operating_costs",
    heating: "in_operating_costs",
    sewerage: "in_operating_costs",
    garbage: "in_operating_costs",
  }
  s.financials.operatingCosts = {
    method: "pooled_prorata",
    scope: "all_inclusive",
    pooled: { basis: "estimated_with_reconciliation", estimatedRatePerSqm: 400, reconciliationPeriod: "quarterly", reconciliationDays: 10 },
  }
  s.building.totalRentableAreaSqm = 1000
  const a = assemble(s)
  const txt = renderContractText(s)
  check("C: метод pooled", s.financials.operatingCosts.method === "pooled_prorata")
  check("C: формула доли в тексте", txt.includes("÷ общая арендуемая площадь здания"))
  check("C: нет двойного начисления (валидатор чист)", a.validation.hard.length === 0)
}

// 4. Долевой без общей площади → hard-ошибка (8.3) + Помощник POOL_AREA_EMPTY
{
  const s = base()
  s.financials.premisesUtilities.heating = "in_operating_costs"
  s.financials.operatingCosts = { method: "pooled_prorata", scope: "common_area", pooled: { basis: "actual_monthly", reconciliationPeriod: "quarterly", reconciliationDays: 10 } }
  s.building.totalRentableAreaSqm = 0
  const c = deriveContext(s)
  const v = validate(s, c)
  check("4: hard про общую площадь", v.hard.some((m) => m.includes("общую арендуемую площадь")))
  check("4: Помощник POOL_AREA_EMPTY", advise(s, c).some((a) => a.id === "POOL_AREA_EMPTY"))
}

// 4b. Двойное начисление (all_inclusive + metered тот же ресурс) → hard (8.4)
{
  const s = base()
  s.financials.premisesUtilities.heating = "metered_separate"
  s.financials.operatingCosts = { method: "fixed_per_sqm", scope: "all_inclusive", fixed: { winterRate: 1, summerRate: 1 } }
  const c = deriveContext(s)
  const v = validate(s, c)
  check("4b: hard про двойное начисление", v.hard.some((m) => m.includes("Двойное начисление")))
}

// 5. Акт выключен → нет Прил.№1, альт. редакции, annex_list без Прил.№1
{
  const s = base()
  s.modules.actEnabled = false
  const a = assemble(s)
  const txt = renderContractText(s)
  check("5: Прил.№1 выключено", !a.ctx.annexes.act)
  check("5: альт. редакция передачи (без Акта)", txt.includes("без оформления отдельного акта"))
  check("5: annex_list не содержит Прил.№1", !txt.includes("Приложение № 1"))
}

// 6. Страхование выключено → раздел 7 отсутствует; сквозная ренумерация; нет «(раздел 7)»
{
  const on = base()
  on.modules.insuranceEnabled = true
  const aOn = assemble(on)
  check("6: со страхованием — Ответственность = раздел 8", aOn.snapshot["cl_penalty_tenant"]?.startsWith("8."))
  check("6: cl_property_liability содержит (раздел 7)", aOn.sections.flatMap((x) => x.items).find((i) => i.id === "cl_property_liability")?.html.includes("(раздел 7"))

  const off = base()
  off.modules.insuranceEnabled = false
  const aOff = assemble(off)
  check("6: без страхования — раздела «Страхование» нет", !aOff.sections.some((x) => x.title === "Страхование"))
  check("6: СКВОЗНАЯ ренумерация — Ответственность стала разделом 7", aOff.snapshot["cl_penalty_tenant"]?.startsWith("7."))
  check("6: нет «(раздел 7)» в cl_property_liability", !aOff.sections.flatMap((x) => x.items).find((i) => i.id === "cl_property_liability")?.html.includes("(раздел 7"))
}

// 7. Индексация/пролонгация — только через ДС
{
  const s = base()
  const items = assemble(s).sections.flatMap((x) => x.items)
  check("7: пролонгация — автопролонгации нет", items.find((i) => i.id === "cl_prolongation")?.html.includes("Автоматическая пролонгация Договора не применяется"))
  check("7: индексация — только по соглашению", items.find((i) => i.id === "cl_indexation")?.html.includes("исключительно по соглашению Сторон"))
}

// 8. Пеня: по умолчанию симметрична; при расхождении Помощник + autoFix
{
  const s = base()
  check("8: дефолт симметричен — нет PENALTY_ASYMMETRY", !advise(s, deriveContext(s)).some((a) => a.id === "PENALTY_ASYMMETRY"))
  const s2 = clone(s)
  s2.financials.penalty.landlordPerDay = 0.1
  check("8: расхождение → PENALTY_ASYMMETRY", advise(s2, deriveContext(s2)).some((a) => a.id === "PENALTY_ASYMMETRY"))
  const fixed = applyAdvisorFix(s2, "equalize_penalty")
  check("8: autoFix выровнял пеню", fixed.financials.penalty.landlordPerDay === fixed.financials.penalty.tenantPerDay)
}

// 9. commrent.kz в уведомлениях
{
  check("9: commrent.kz в уведомлениях", renderContractText(base()).includes("commrent.kz"))
}

// 16. Снэпшот стабилен относительно ID (детерминированность рендера)
{
  const s = base()
  check("16: рендер детерминирован", renderContractText(s) === renderContractText(clone(s)))
}

// ── ДС (§9–10) ──
function amd(type: AmendmentType, payload: Record<string, unknown>, dsNumber = 1): Amendment {
  return { dsNumber, dsDate: "2026-07-01", effectiveDate: "2026-07-01", type, payload }
}

// 11. set_operating_costs на пресете A → добавляет пункт; гейты переключаются
{
  const s = base()
  check("11: set_operating_costs доступен (расходов нет)", availableAmendmentTypes(s, "active").includes("set_operating_costs"))
  check("11: change_operating_costs пока недоступен", !availableAmendmentTypes(s, "active").includes("change_operating_costs"))
  const doc = renderAmendment(s, [], amd("set_operating_costs", { method: "fixed_per_sqm", scope: "common_area", fixed: { winterRate: 500, summerRate: 300 } }))
  check("11: после ДС метод включён", doc.effective.financials.operatingCosts.method === "fixed_per_sqm")
  check("11: ДС добавляет пункт", doc.ops.some((o) => o.kind === "add"))
  check("11: гейт set закрыт, change открыт", !availableAmendmentTypes(doc.effective, "active").includes("set_operating_costs") && availableAmendmentTypes(doc.effective, "active").includes("change_operating_costs"))
}

// 12. indexation → плата ×(1+%), ограничена cap; restate пункта аренды
{
  const s = base()
  s.financials.monthlyRent = 300_000
  s.financials.indexation = { enabled: true, capPercent: 10 }
  const doc = renderAmendment(s, [], amd("indexation", { inflationPercent: 8 }))
  check("12: индексация +8% = 324 000", doc.effective.financials.monthlyRent === 324_000)
  check("12: индексация ограничена cap (15→10%)", effectiveState(s, [amd("indexation", { inflationPercent: 15 })]).financials.monthlyRent === 330_000)
  check("12: ДС restate пункта", doc.ops.some((o) => o.kind === "restate"))
}

// 13. extend_term → endDate меняется; restate срока
{
  const s = base()
  const doc = renderAmendment(s, [], amd("extend_term", { newEndDate: "2028-05-31" }))
  check("13: продление меняет endDate", doc.effective.term.endDate === "2028-05-31")
  check("13: ДС restate срока", doc.ops.some((o) => o.kind === "restate"))
}

// 15. rent_change → новая плата; депозит без recalc не меняется
{
  const s = base()
  s.financials.monthlyRent = 300_000
  s.financials.deposit.amount = 300_000
  const noRecalc = effectiveState(s, [amd("rent_change", { newRent: 400_000 })])
  check("15: rent_change меняет плату", noRecalc.financials.monthlyRent === 400_000)
  check("15: депозит без recalc не меняется", noRecalc.financials.deposit.amount === 300_000)
  const recalc = effectiveState(s, [amd("rent_change", { newRent: 400_000, recalcDeposit: true })])
  check("15: recalcDeposit → депозит = новой плате", recalc.financials.deposit.amount === 400_000)
}

// Жизненный цикл и гейты
{
  check("ДС: в draft недоступны", availableAmendmentTypes(base(), "draft").length === 0)
  check("ДС: terminate доступен в active", availableAmendmentTypes(base(), "active").includes("terminate"))
  check("ДС: переход active→extended допустим", canTransition("active", "extended"))
  check("ДС: переход terminated→active запрещён", !canTransition("terminated", "active"))
  const term = renderAmendment(base(), [], amd("terminate", { terminationDate: "2026-09-01" }))
  check("ДС: расторжение → соглашение о расторжении", term.text.includes("СОГЛАШЕНИЕ О РАСТОРЖЕНИИ"))
}

console.log(`\n[test-contract-engine] passed=${passed}, failed=${failed}`)
if (failed > 0) process.exit(1)
