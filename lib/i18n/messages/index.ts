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
import { cabinetFinances as ruCabinetFinances } from "./ru/cabinetFinances"
import { cabinetFinances as kkCabinetFinances } from "./kk/cabinetFinances"
import { cabinetPayment as ruCabinetPayment } from "./ru/cabinetPayment"
import { cabinetPayment as kkCabinetPayment } from "./kk/cabinetPayment"
import { cabinetDocs as ruCabinetDocs } from "./ru/cabinetDocs"
import { cabinetDocs as kkCabinetDocs } from "./kk/cabinetDocs"
import { cabinetSupport as ruCabinetSupport } from "./ru/cabinetSupport"
import { cabinetSupport as kkCabinetSupport } from "./kk/cabinetSupport"
import { cabinetCalendar as ruCabinetCalendar, cabinetProfile as ruCabinetProfile, cabinetPayDocs as ruCabinetPayDocs } from "./ru/cabinetCalendar"
import { cabinetCalendar as kkCabinetCalendar, cabinetProfile as kkCabinetProfile, cabinetPayDocs as kkCabinetPayDocs } from "./kk/cabinetCalendar"
import { auth as ruAuth } from "./ru/auth"
import { auth as kkAuth } from "./kk/auth"
import { emails as ruEmails } from "./ru/emails"
import { emails as kkEmails } from "./kk/emails"
import { adminShell as ruAdminShell } from "./ru/adminShell"
import { adminShell as kkAdminShell } from "./kk/adminShell"
import { adminBuilder as ruAdminBuilder } from "./ru/adminBuilder"
import { adminBuilderSheet as ruAdminBuilderSheet } from "./ru/adminBuilderSheet"
import { adminBuilderSheet as kkAdminBuilderSheet } from "./kk/adminBuilderSheet"
import { adminBuilder as kkAdminBuilder } from "./kk/adminBuilder"
import { adminObjects as ruAdminObjects } from "./ru/adminObjects"
import { adminObjects as kkAdminObjects } from "./kk/adminObjects"
import { adminTenants as ruAdminTenants } from "./ru/adminTenants"
import { adminTenants as kkAdminTenants } from "./kk/adminTenants"
import { adminFinance as ruAdminFinance } from "./ru/adminFinance"
import { adminFinance as kkAdminFinance } from "./kk/adminFinance"
import { adminDocs as ruAdminDocs } from "./ru/adminDocs"
import { adminDocs as kkAdminDocs } from "./kk/adminDocs"
import { adminService as ruAdminService } from "./ru/adminService"
import { adminService as kkAdminService } from "./kk/adminService"
import { adminSettings as ruAdminSettings } from "./ru/adminSettings"
import { adminSettings as kkAdminSettings } from "./kk/adminSettings"
import { landing as ruLanding } from "./ru/landing"
import { landing as kkLanding } from "./kk/landing"
import { domain as ruDomain } from "./ru/domain"
import { domain as kkDomain } from "./kk/domain"
import { actions as ruActions } from "./ru/actions"
import { actions as kkActions } from "./kk/actions"
import { adminChecks as ruAdminChecks } from "./ru/adminChecks"
import { adminChecks as kkAdminChecks } from "./kk/adminChecks"
import { adminRefs as ruAdminRefs } from "./ru/adminRefs"
import { adminRefs as kkAdminRefs } from "./kk/adminRefs"

export const ru = {
  common: ruCommon,
  domain: ruDomain,
  cabinet: ruCabinet,
  cabinetHome: ruCabinetHome,
  cabinetFinances: ruCabinetFinances,
  cabinetPayment: ruCabinetPayment,
  cabinetDocs: ruCabinetDocs,
  cabinetSupport: ruCabinetSupport,
  cabinetCalendar: ruCabinetCalendar,
  cabinetProfile: ruCabinetProfile,
  cabinetPayDocs: ruCabinetPayDocs,
  emails: ruEmails,
  auth: ruAuth,
  adminShell: ruAdminShell,
  adminObjects: ruAdminObjects,
  adminBuilder: ruAdminBuilder,
  adminBuilderSheet: ruAdminBuilderSheet,
  adminTenants: ruAdminTenants,
  adminFinance: ruAdminFinance,
  adminDocs: ruAdminDocs,
  adminService: ruAdminService,
  adminSettings: ruAdminSettings,
  landing: ruLanding,
  actions: ruActions,
  adminChecks: ruAdminChecks,
  adminRefs: ruAdminRefs,
}

export type Messages = typeof ru
export type Namespace = keyof Messages

export const kk: Messages = {
  common: kkCommon,
  domain: kkDomain,
  cabinet: kkCabinet,
  cabinetHome: kkCabinetHome,
  cabinetFinances: kkCabinetFinances,
  cabinetPayment: kkCabinetPayment,
  cabinetDocs: kkCabinetDocs,
  cabinetSupport: kkCabinetSupport,
  cabinetCalendar: kkCabinetCalendar,
  cabinetProfile: kkCabinetProfile,
  cabinetPayDocs: kkCabinetPayDocs,
  emails: kkEmails,
  auth: kkAuth,
  adminShell: kkAdminShell,
  adminObjects: kkAdminObjects,
  adminBuilder: kkAdminBuilder,
  adminBuilderSheet: kkAdminBuilderSheet,
  adminTenants: kkAdminTenants,
  adminFinance: kkAdminFinance,
  adminDocs: kkAdminDocs,
  adminService: kkAdminService,
  adminSettings: kkAdminSettings,
  landing: kkLanding,
  actions: kkActions,
  adminChecks: kkAdminChecks,
  adminRefs: kkAdminRefs,
}

export const dictionaries: Record<Locale, Messages> = { ru, kk }

/** Только нужные разделы — чтобы в браузер не уезжал словарь всей админки. */
export function pickNamespaces<N extends Namespace>(messages: Messages, namespaces: readonly N[]): Pick<Messages, N> {
  const out = {} as Pick<Messages, N>
  for (const ns of namespaces) out[ns] = messages[ns]
  return out
}
