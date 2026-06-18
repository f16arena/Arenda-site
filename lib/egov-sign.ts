import "server-only"

import { db } from "@/lib/db"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { contractPayloadBase64 } from "@/lib/contract-signing-payload"

/**
 * Подписание договора через eGov Mobile (QR/Кросс) по официальному протоколу NITEC.
 * Телефон сам ходит на два наших публичных эндпоинта (API №1 и API №2) — ШЭП в
 * потоке подписи не участвует. Ключ сессии = `signToken` договора (тот же секрет,
 * что и у ссылки на подпись), он же одноразовый Bearer для API №2.
 *
 * Протокол: docs/egov-qr-signing.md. Подпись приходит как CMS_WITH_DATA (тот же
 * формат, что от NCALayer) → переиспользуем signContractByTenantEcp (разбор CMS,
 * сверка ИИН/БИН, NCANode-криптопроверка, привязка к каноническому тексту).
 */

export const EGOV_DEEPLINK_PREFIX = "mobileSign:"

/** Публичная база URL для эндпоинтов (домен должен быть «доверенным» у eGov Mobile). */
export function egovBaseFromEnv(): string | null {
  const raw = process.env.EGOV_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
  return raw ? raw.replace(/\/+$/, "") : null
}

/** Сегмент `mgovSign` в URL обязателен по требованию протокола. */
export function egovApi1Url(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/egov-sign/${token}/mgovSign`
}

export function egovApi2Url(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/egov-sign/${token}/doc`
}

/** Содержимое QR-кода (пробелы исключаются). */
export function egovQrContent(api1Url: string): string {
  return `${EGOV_DEEPLINK_PREFIX}${api1Url}`
}

/** Диплинк для того же устройства (Firebase Dynamic Link eGov Mobile). */
export function egovDeeplink(api1Url: string, platform: "ios" | "android"): string {
  const link = encodeURIComponent(api1Url)
  return platform === "ios"
    ? `https://mgovsign.page.link/?link=${link}&isi=1476128386&ibi=kz.egov.mobile`
    : `https://mgovsign.page.link/?link=${link}&apn=kz.mobile.mgov`
}

export type EgovSignContract = {
  id: string
  number: string
  type: string | null
  content: string
  startDate: Date | null
  endDate: Date | null
  status: string
  signedByTenantAt: Date | null
  tenant: {
    companyName: string
    user: { name: string; organizationId: string | null }
  }
}

/** Договор по signToken (тот же токен, что у публичной ссылки на подпись). */
export async function loadContractForEgov(token: string): Promise<EgovSignContract | null> {
  if (!token || token.length < 20) return null
  return db.contract.findFirst({
    where: { signToken: token, deletedAt: null },
    select: {
      id: true,
      number: true,
      type: true,
      content: true,
      startDate: true,
      endDate: true,
      status: true,
      signedByTenantAt: true,
      tenant: {
        select: {
          companyName: true,
          user: { select: { name: true, organizationId: true } },
        },
      },
    },
  })
}

function isoExpiry(hours = 1): string {
  // Дата истечения подписания (ISO 8601). Без Date.now() в воркфлоу — здесь это
  // обычный route handler, Date доступен.
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

/** Ответ API №1 — метаданные + ссылка на API №2. */
export async function buildApi1(origin: string, token: string, c: EgovSignContract) {
  const org = c.tenant.user.organizationId
    ? await getOrganizationRequisites(c.tenant.user.organizationId).catch(() => null)
    : null
  const orgName = org?.fullName?.trim() || "Организация"
  const docTitle = c.type === "ADDENDUM" ? "Подписание доп. соглашения" : "Подписание договора"
  return {
    description: `${docTitle} № ${c.number}`,
    expiry_date: isoExpiry(1),
    organisation: {
      nameRu: orgName,
      nameKz: orgName,
      nameEn: orgName,
      bin: org?.taxId ?? "",
    },
    document: {
      uri: egovApi2Url(origin, token),
      auth_type: "Token",
      auth_token: token,
    },
  }
}

/** Ответ API №2 (GET) — документ(ы) на подпись. Подписываем тот же канонический
 *  текст, что и NCALayer, методом CMS_WITH_DATA (mime text/plain → eGov покажет текст). */
export function buildApi2Documents(c: EgovSignContract) {
  const dataB64 = contractPayloadBase64({
    number: c.number,
    type: c.type,
    content: c.content,
    startDate: c.startDate,
    endDate: c.endDate,
    tenantCompany: c.tenant.companyName,
  })
  const title = c.type === "ADDENDUM" ? `Доп. соглашение № ${c.number}` : `Договор аренды № ${c.number}`
  return {
    signMethod: "CMS_WITH_DATA",
    version: 1,
    documentsToSign: [
      {
        id: 1,
        nameRu: title,
        nameKz: title,
        nameEn: c.type === "ADDENDUM" ? `Addendum No ${c.number}` : `Lease agreement No ${c.number}`,
        meta: [{ name: "Арендатор", value: c.tenant.companyName }],
        document: { file: { mime: "text/plain", data: dataB64 } },
      },
    ],
  }
}

/** Извлечь base64 CMS из присланного PUT-ом (мутированного) JSON. */
export function extractSignedCms(body: unknown): string | null {
  const docs = (body as { documentsToSign?: Array<{ document?: { file?: { data?: unknown } } }> })?.documentsToSign
  const data = Array.isArray(docs) ? docs[0]?.document?.file?.data : undefined
  return typeof data === "string" && data.length > 100 ? data : null
}

/** Проверка одноразового Bearer-токена API №2 (auth_type=Token). */
export function checkEgovBearer(req: Request, token: string): boolean {
  const auth = req.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return !!m && m[1] === token
}
