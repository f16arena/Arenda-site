/**
 * Словари по разделам. Русский задаёт форму, казахский обязан её повторить
 * (каждый kk-файл типизирован через typeof русского) — пропущенная строка
 * ловится компилятором, а не пользователем.
 *
 * Термины — по docs/i18n-glossary.md: перевод по смыслу, как в Kaspi и eGov.
 */

import type { Locale } from "../config"
import { common as ruCommon } from "./ru/common"
import { common as kkCommon } from "./kk/common"
import { cabinet as ruCabinet } from "./ru/cabinet"
import { cabinet as kkCabinet } from "./kk/cabinet"
import { cabinetHome as ruCabinetHome } from "./ru/cabinetHome"
import { cabinetHome as kkCabinetHome } from "./kk/cabinetHome"
import { domain as ruDomain } from "./ru/domain"
import { domain as kkDomain } from "./kk/domain"

export const ru = {
  common: ruCommon,
  domain: ruDomain,
  cabinet: ruCabinet,
  cabinetHome: ruCabinetHome,
}

export type Messages = typeof ru
export type Namespace = keyof Messages

export const kk: Messages = {
  common: kkCommon,
  domain: kkDomain,
  cabinet: kkCabinet,
  cabinetHome: kkCabinetHome,
}

export const dictionaries: Record<Locale, Messages> = { ru, kk }

/** Только нужные разделы — чтобы в браузер не уезжал словарь всей админки. */
export function pickNamespaces<N extends Namespace>(messages: Messages, namespaces: readonly N[]): Pick<Messages, N> {
  const out = {} as Pick<Messages, N>
  for (const ns of namespaces) out[ns] = messages[ns]
  return out
}
