/**
 * Единая палитра «тонов» для всего админ-интерфейса. Меняешь цвет здесь —
 * меняется везде (заголовки, карточки метрик, бейджи). Не дублируй классы
 * по страницам — бери TONE_* отсюда.
 */
export type Tone = "blue" | "emerald" | "teal" | "amber" | "red" | "violet" | "slate"

/** Цветная плашка под иконку (заголовок страницы, карточка метрики). */
export const TONE_CHIP: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

/** Цвет значения/текста (крупные числа метрик). */
export const TONE_TEXT: Record<Tone, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  teal: "text-teal-600 dark:text-teal-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  violet: "text-violet-600 dark:text-violet-400",
  slate: "text-slate-900 dark:text-slate-100",
}

/** Бейдж-пилюля (статусы). */
export const TONE_BADGE: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}
