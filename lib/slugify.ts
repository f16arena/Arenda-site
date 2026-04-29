// Транслитерация и slugify для генерации поддоменов из названия организации.
// Поддерживает русский и казахский алфавиты.

const TRANSLIT: Record<string, string> = {
  // Русский
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Казахские специфичные
  ә: "a",  // или "ae"
  ғ: "g",
  қ: "q",
  ң: "n",
  ө: "o",
  ұ: "u",
  ү: "u",
  һ: "h",
  і: "i",
}

/**
 * Преобразует произвольную строку в slug:
 * - lowercase
 * - кириллица/казахские → латиница
 * - всё кроме [a-z0-9-] → дефис
 * - сжимает несколько дефисов в один
 * - убирает дефисы по краям
 */
export function slugify(input: string): string {
  if (!input) return ""
  return input
    .toLowerCase()
    .replace(/[а-яёәғқңəҗһөұүһі]/g, (c) => TRANSLIT[c] ?? c)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Подгоняет slug к минимальной длине, добавляя случайный суффикс.
 * Использует только латиницу и цифры. Годится для предложений.
 */
export function padSlug(slug: string, minLen = 5): string {
  if (slug.length >= minLen) return slug
  const need = minLen - slug.length
  const chars = "0123456789"
  let suffix = ""
  for (let i = 0; i < need; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return slug + suffix
}

/**
 * Генерирует варианты slug если базовый занят.
 * Возвращает 3 предложения: с цифрой, с pro, с kz.
 */
export function suggestSlugs(base: string): string[] {
  const cleaned = slugify(base)
  const variants = [
    `${cleaned}-2`,
    `${cleaned}-pro`,
    `${cleaned}-kz`,
    `${cleaned}-bc`,
    `${cleaned}${Math.floor(Math.random() * 90) + 10}`,
  ]
  return variants.filter((v) => v.length >= 5 && v.length <= 20).slice(0, 3)
}
