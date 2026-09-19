// Приложения договора на размещение (Акт с перечнем оборудования, Схема) —
// HTML-вид той же модели, что уходит в текст подписи и DOCX
// (lib/contract-engine/placement.ts → placementAnnexes). Без хуков: годится и для
// серверной карточки договора, и для превью в конструкторе.

import { placementAnnexes } from "@/lib/contract-engine/placement"
import { dateLong } from "@/lib/contract-engine/numerals"
import type { ContractState } from "@/lib/contract-engine"

export function PlacementAnnexesView({ state, paper = false }: { state: ContractState; paper?: boolean }) {
  // paper — «лист бумаги» (страница подписи): фиксированно светлые цвета.
  const muted = paper ? "text-slate-500" : "text-slate-400 dark:text-slate-500"
  const strong = paper ? "text-slate-900" : "text-slate-900 dark:text-slate-100"
  const border = paper ? "border-slate-300" : "border-slate-200 dark:border-slate-700"
  return (
    <>
      {placementAnnexes(state).map((a) => (
        <section key={a.no} className={`mt-8 border-t border-dashed pt-6 first:mt-0 first:border-t-0 first:pt-0 ${border}`}>
          <p className={`mb-3 text-right text-xs italic ${muted}`}>
            Приложение № {a.no} к Договору № {state.meta.contractNumber || "____"} от {dateLong(state.meta.contractDate)}
          </p>
          <h3 className={`text-center text-base font-bold ${strong}`}>{a.title}</h3>
          <p className="mb-4 text-center text-sm">{a.subtitle}</p>
          <div className="space-y-2">
            {a.parts.map((part, i) => {
              if (part.kind === "p") return <p key={i} className="text-justify">{part.text}</p>
              if (part.kind === "item") return <p key={i} className="ml-4">— {part.text}</p>
              if (part.kind === "table") {
                return (
                  <div key={i} className="overflow-x-auto">
                    <table className={`w-full border-collapse text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left ${paper ? "[&_td]:border-slate-300 [&_th]:border-slate-300" : "[&_td]:border-slate-200 [&_th]:border-slate-200 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700"}`}>
                      <thead><tr>{part.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{part.rows.map((r, j) => <tr key={j}>{r.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )
              }
              return (
                <div key={i} className={`flex h-48 items-start rounded border p-2 text-xs italic ${border} ${muted}`}>{part.caption}</div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
