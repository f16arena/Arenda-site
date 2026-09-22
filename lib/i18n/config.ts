/**
 * Языки интерфейса.
 *
 * Язык — настройка пользователя (cookie + users.locale), а не часть адреса:
 * у панели десятки страниц, и префикс /kk/… сломал бы ссылки в письмах, в
 * мобильном приложении и в закладках. Адрес с языком получает только лендинг
 * — там он нужен поиску.
 *
 * Файл общий для сервера и клиента: здесь нет ничего, кроме констант.
 */

// Порядок — как в переключателе: государственный язык первым.
export const LOCALES = ["kk", "ru"] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Казахский — основной язык продукта: интерфейс и публичные страницы по
 * умолчанию на государственном языке, русский доступен одним нажатием.
 */
export const DEFAULT_LOCALE: Locale = "kk"

/** Cookie с выбранным языком. Год — чтобы не сбрасывался между визитами. */
export const LOCALE_COOKIE = "locale"
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/** Значение для <html lang> и заголовка Content-Language. */
export const HTML_LANG: Record<Locale, string> = {
  ru: "ru",
  kk: "kk",
}

/** Локаль для Intl: даты, числа, деньги. */
export const INTL_LOCALE: Record<Locale, string> = {
  ru: "ru-RU",
  kk: "kk-KZ",
}

/** Как язык называет сам себя — для переключателя. */
export const LOCALE_NAMES: Record<Locale, string> = {
  kk: "Қазақша",
  ru: "Русский",
}

/** Короткая подпись на кнопке переключателя. */
export const LOCALE_SHORT: Record<Locale, string> = {
  kk: "ҚАЗ",
  ru: "RU",
}

/**
 * Ставит <html lang> по cookie до отрисовки. Корневой layout остаётся
 * статическим (чтение cookie на сервере сделало бы динамической каждую
 * страницу, включая лендинг), а экранные дикторы и переводчик браузера
 * всё равно видят верный язык.
 */
export const localeInitScript = `
(function() {
  try {
    var m = document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=(ru|kk)(?:;|$)/);
    if (m) document.documentElement.lang = m[1];
  } catch (e) {}
})();
`
