// Имя арендатора для подписи на плане.
//
// В карточке и в документах имя нужно полное — «ТОО "Ювелир Trend"».
// На плане форма собственности съедает половину ширины помещения и не несёт
// ничего: человек ищет глазами «Ювелир», а не «ТОО». Поэтому на карте
// показываем название, а полное имя остаётся в карточке помещения.

const LEGAL_PREFIXES = [
  "тоо",
  "ип",
  "ао",
  "жшс",
  "жк",
  "ооо",
  "оао",
  "зао",
  "пк",
  "кх",
  "тд",
  "нао",
  "рго",
  "гу",
  "кгу",
  "кгп",
  "чп",
]

/** Убрать форму собственности и обрамляющие кавычки. */
export function shortTenantName(name: string | null | undefined): string {
  if (!name) return ""
  let result = name.trim()

  // приставка в начале: «ТОО Ромашка», «ИП "Алма"», «ТОО. Ромашка»
  const firstWord = result.split(/[\s."«]+/, 1)[0]?.toLowerCase() ?? ""
  if (LEGAL_PREFIXES.includes(firstWord)) {
    result = result.slice(firstWord.length).replace(/^[\s.]+/, "")
  }

  // кавычки вокруг остатка
  result = result.replace(/^["«'`]+/, "").replace(/["»'`]+$/, "")

  return result.trim() || name.trim()
}
