// Деньги. Суммы хранятся числом с плавающей точкой (Float), поэтому любое
// сложение/умножение округляем до копеек в одном месте — иначе в расчётах
// накапливаются «хвосты» вида 0,004 ₸ и долг никогда не закрывается.
//
// Правило: любая сумма, которая уходит в базу или показывается человеку,
// проходит через эти функции. В базе стоит ограничение: нельзя записать
// сумму с более чем двумя знаками (миграция 20260920180000_money_precision).

/** Округление до копеек (банковское «половина вверх» по модулю). */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Сумма списка с округлением на каждом шаге. */
export function sumMoney(values: Iterable<number>): number {
  let total = 0
  for (const v of values) total = money(total + money(v))
  return total
}

export const addMoney = (a: number, b: number): number => money(money(a) + money(b))
export const subMoney = (a: number, b: number): number => money(money(a) - money(b))

/** Сумма × количество (или ставка × площадь). */
export const mulMoney = (amount: number, factor: number): number =>
  Number.isFinite(factor) ? money(money(amount) * factor) : 0

/** Доля от суммы в процентах: пеня, НДС, индексация. */
export const percentOf = (amount: number, percent: number): number =>
  Number.isFinite(percent) ? money(money(amount) * (percent / 100)) : 0

/** Суммы равны с точностью до копейки (сравнивать Float напрямую нельзя). */
export const sameMoney = (a: number, b: number): boolean => Math.abs(money(a) - money(b)) < 0.005
