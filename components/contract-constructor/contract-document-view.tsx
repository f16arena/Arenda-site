// Презентационный рендер договора в аккуратный HTML (для страницы подписи и
// детальной страницы). Строится из ContractState через движок (assemble +
// deriveContext), а не из плоского текста — поэтому заголовки/таблицы/абзацы
// выглядят как нормальный документ. Чистый серверный компонент (без "use client").
//
// ВАЖНО: документ — это «лист бумаги», поэтому цвета ФИКСИРОВАННО СВЕТЛЫЕ
// (белый фон, тёмный текст), без dark:-вариантов. Иначе на странице подписи
// (она всегда светлая) при системной тёмной теме текст становился невидимым.

import { assemble, type ContractState } from "@/lib/contract-engine"
import { deriveContext } from "@/lib/contract-engine/derive"
import { partyIntro, partyRequisites } from "@/lib/contract-engine/parties"
import { money, dateLong } from "@/lib/contract-engine/numerals"

type Redact = (s: string) => string
const identity: Redact = (s) => s

function fill(v: string | undefined | null, blank = "____________________") {
  return v && v.trim() ? v.trim() : blank
}

export function ContractDocumentView({
  state,
  redact = identity,
}: {
  state: ContractState
  redact?: Redact
}) {
  const a = assemble(state)
  const c = deriveContext(state)
  const r = redact

  return (
    <article className="mx-auto max-w-[760px] rounded-lg bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200">
      {/* Шапка */}
      <header className="text-center mb-6">
        <h2 className="text-base font-bold tracking-wide text-slate-900">ДОГОВОР № {state.meta.contractNumber || "____"}</h2>
        <p className="text-sm">аренды нежилого помещения</p>
        <div className="mt-3 flex justify-between text-xs text-slate-500">
          <span>{state.meta.city}</span>
          <span>{dateLong(state.meta.contractDate)}</span>
        </div>
      </header>

      {/* Преамбула */}
      <p className="mb-5 text-justify">
        {r(partyIntro(state.landlord, "Арендодатель"))}, с одной стороны, и {r(partyIntro(state.tenant, "Арендатор"))},
        с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:
      </p>

      {/* Разделы */}
      {a.sections.map((sec) => (
        <section key={sec.num} className="mb-4">
          <h3 className="font-semibold text-slate-900 mb-1.5">{sec.num}. {sec.title}</h3>
          <div className="space-y-1.5">
            {sec.items.map((it) => (
              <div key={it.id}>
                <p className="text-justify">
                  <span className="font-medium">{it.num}.</span> {it.sub ? <span className="font-medium">{r(it.sub)} </span> : null}{r(it.html)}
                </p>
                {it.children.length > 0 && (
                  <div className="ml-5 mt-1 space-y-1">
                    {it.children.map((k) => (
                      <p key={k.id} className="text-justify text-slate-600">
                        <span className="font-medium">{k.num}.</span> {r(k.html)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Реквизиты сторон */}
      <section className="mb-2">
        <h3 className="font-semibold text-slate-900 mb-2">{a.requisitesNum}. Реквизиты и подписи Сторон</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="font-semibold mb-1">АРЕНДОДАТЕЛЬ:</p>
            <p className="whitespace-pre-line text-slate-600">{r(partyRequisites(state.landlord))}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">АРЕНДАТОР:</p>
            <p className="whitespace-pre-line text-slate-600">{r(partyRequisites(state.tenant))}</p>
          </div>
        </div>
      </section>

      {/* ── Приложения ── */}
      {c.annexes.act && <AnnexAct state={state} no={c.annexNumbers.act} />}
      {c.annexes.services && <AnnexServices state={state} no={c.annexNumbers.services} />}
      {c.annexes.operatingCosts && <AnnexOperatingCosts state={state} no={c.annexNumbers.operatingCosts} covers={c.covers} />}
    </article>
  )
}

function AnnexHeader({ no, state, title, subtitle }: { no: number; state: ContractState; title: string; subtitle: string }) {
  return (
    <div className="mt-8 pt-6 border-t border-dashed border-slate-300">
      <p className="text-right text-xs italic text-slate-500 mb-3">
        Приложение № {no} к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}
      </p>
      <h3 className="text-center text-base font-bold text-slate-900">{title}</h3>
      <p className="text-center text-sm mb-4">{subtitle}</p>
    </div>
  )
}

function AnnexAct({ state, no }: { state: ContractState; no: number }) {
  const p = state.premises
  const h = state.handoverAct
  const conditions: [string, string][] = [
    ["Стены", h?.conditionWalls ?? ""], ["Пол", h?.conditionFloor ?? ""], ["Потолок", h?.conditionCeiling ?? ""],
    ["Окна, двери", h?.conditionWindowsDoors ?? ""], ["Электропроводка, освещение", h?.conditionElectrical ?? ""],
    ["Сантехника, отопление", h?.conditionPlumbing ?? ""], ["Иное", h?.conditionOther ?? ""],
  ]
  return (
    <section>
      <AnnexHeader no={no} state={state} title="АКТ" subtitle="приёма-передачи нежилого помещения" />
      <p className="mb-2">{state.landlord.name || "Арендодатель"} (Арендодатель) и {state.tenant.name || "Арендатор"} (Арендатор) составили настоящий Акт о нижеследующем:</p>
      <p className="mb-2">1. Арендодатель передал, а Арендатор принял нежилое помещение по адресу: {p.buildingAddress || "________"}{p.placement ? ", " + p.placement : ""}, общей площадью {p.spaceAreaSqm || "____"} кв. м.</p>
      <p className="mb-1 font-medium">2. Состояние Помещения на момент передачи:</p>
      <table className="w-full border-collapse text-xs mb-2">
        <tbody>
          {conditions.map(([label, val]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="py-1 pr-3 text-slate-500 align-top w-1/2">{label}</td>
              <td className="py-1">{fill(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-1">3. Показания счётчиков: электроэнергия {fill(h?.meterElectricity, "______")} кВт·ч; холодная вода {fill(h?.meterColdWater, "______")} куб. м; горячая вода {fill(h?.meterHotWater, "______")} куб. м.</p>
      <p className="mb-1">4. Передаваемые ключи: {fill(h?.keysCount, "____")} комплектов.</p>
      <p>5. Помещение соответствует условиям Договора, претензий по состоянию у Арендатора нет.</p>
    </section>
  )
}

function AnnexServices({ state, no }: { state: ContractState; no: number }) {
  const sv = state.financials.additionalServices
  const rows: [string, boolean, string][] = [
    ["Уборка внутри Помещения", sv.premisesCleaning.ordered, sv.premisesCleaning.monthly ? money(sv.premisesCleaning.monthly) + "/мес" : sv.premisesCleaning.ratePerSqm ? money(sv.premisesCleaning.ratePerSqm) + " за 1 кв. м/мес" : "—"],
    ["Стационарная телефонная линия", sv.phone.ordered, sv.phone.monthly ? money(sv.phone.monthly) + "/мес" : "по тарифам оператора"],
    ["Доступ в интернет (Wi-Fi)", sv.internet.ordered, sv.internet.monthly ? money(sv.internet.monthly) + "/мес" : "—"],
    ["Охрана помещения (тревожная кнопка / пульт)", sv.premisesSecurity.ordered, sv.premisesSecurity.monthly ? money(sv.premisesSecurity.monthly) + "/мес" : "—"],
  ]
  return (
    <section>
      <AnnexHeader no={no} state={state} title="ЗАЯВЛЕНИЕ" subtitle="на дополнительные услуги" />
      <p className="mb-2">Арендатор: {state.tenant.name || "________"}. Помещение: {state.premises.buildingAddress || "________"}, {state.premises.spaceAreaSqm || "____"} кв. м.</p>
      <p className="mb-2">Арендатор поручает Арендодателю оказание следующих услуг:</p>
      <table className="w-full border border-slate-200 border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="border border-slate-200 px-2 py-1 text-left">Услуга</th>
            <th className="border border-slate-200 px-2 py-1 text-left">Тариф / стоимость</th>
            <th className="border border-slate-200 px-2 py-1 text-center w-16">Заказ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              <td className="border border-slate-200 px-2 py-1">{row[0]}</td>
              <td className="border border-slate-200 px-2 py-1">{row[2]}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">{row[1] ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-justify">Стоимость услуг оплачивается ежемесячно одновременно с арендной платой отдельной строкой счёта. Состав услуг может быть изменён уведомлением за 15 календарных дней.</p>
    </section>
  )
}

function AnnexOperatingCosts({ state, no, covers }: { state: ContractState; no: number; covers: string[] }) {
  const op = state.financials.operatingCosts
  const area = state.premises.spaceAreaSqm || 0
  const kv: [string, string][] = op.method === "fixed_per_sqm"
    ? [
        ["Площадь Помещения", `${state.premises.spaceAreaSqm || "____"} кв. м`],
        ["Тариф (окт–апр)", `${money(op.fixed?.winterRate ?? 0)} за 1 кв. м/мес`],
        ["Тариф (май–сен)", `${money(op.fixed?.summerRate ?? 0)} за 1 кв. м/мес`],
        ["Расходы в месяц (окт–апр)", money((op.fixed?.winterRate ?? 0) * area)],
        ["Расходы в месяц (май–сен)", money((op.fixed?.summerRate ?? 0) * area)],
      ]
    : [
        ["Общая арендуемая площадь здания", `${state.building.totalRentableAreaSqm || "____"} кв. м`],
        ["Площадь Помещения", `${state.premises.spaceAreaSqm || "____"} кв. м`],
        ["Авансовая ставка", op.pooled?.estimatedRatePerSqm ? `${money(op.pooled.estimatedRatePerSqm)} за 1 кв. м/мес` : "—"],
      ]
  return (
    <section>
      <AnnexHeader no={no} state={state} title="РАСЧЁТ" subtitle="эксплуатационных расходов" />
      {op.method === "pooled_prorata" && (
        <p className="mb-2 text-justify"><span className="font-medium">Формула долевого расчёта:</span> ЭР = (Сумма фактических расходов здания за расчётный период ÷ Общая арендуемая площадь здания) × Площадь Помещения.</p>
      )}
      <table className="w-full border-collapse text-xs mb-2">
        <tbody>
          {kv.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="py-1 pr-3 text-slate-500 align-top w-2/3">{k}</td>
              <td className="py-1 font-medium">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {op.method === "pooled_prorata" && (
        <p className="mb-2 text-justify">Перерасчёт по фактическим расходам производится в порядке и сроки, установленные Договором; разница подлежит доплате/возврату.</p>
      )}
      {covers.length > 0 && (
        <p className="text-justify">Эксплуатационные расходы покрывают: {covers.join("; ")}.</p>
      )}
    </section>
  )
}
