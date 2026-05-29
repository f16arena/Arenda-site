// Серверный разбор CMS-подписи (PKCS#7 SignedData) от NCALayer / НУЦ РК.
//
// NCALayer (метод createCMSSignatureFromBase64) возвращает base64 от DER-кодированного
// ContentInfo → SignedData. Внутри лежат:
//   - сертификат(ы) подписанта (X.509) — из них достаём ФИО, ИИН, БИН, организацию, срок;
//   - encapContentInfo.eContent — подписанные данные (для attached-подписи), по ним
//     проверяем, что подпись относится именно к нашему документу.
//
// ВАЖНО про границы проверки: здесь мы НЕ верифицируем математику ГОСТ-подписи
// (для этого нужен Kalkan SDK от НУЦ РК — Java/PHP/C, см. lib/ncalayer-cms.verify.md).
// Pure-JS проверка покрывает: корректность ASN.1, срок действия сертификата,
// принадлежность издателя НУЦ РК, привязку подписи к тексту документа (по eContent).

import { AsnConvert } from "@peculiar/asn1-schema"
import { ContentInfo, SignedData } from "@peculiar/asn1-cms"
import { Certificate, Name } from "@peculiar/asn1-x509"

// OID атрибутов Distinguished Name
const OID = {
  CN: "2.5.4.3",
  SURNAME: "2.5.4.4",
  SERIAL_NUMBER: "2.5.4.5", // обычно "IIN…" или "BIN…"
  O: "2.5.4.10",
  OU: "2.5.4.11",
  GIVEN_NAME: "2.5.4.42",
  ORG_IDENTIFIER: "2.5.4.97", // обычно "BIN…"
} as const

export interface ParsedSigner {
  commonName?: string
  surname?: string
  givenName?: string
  iin?: string
  bin?: string
  organization?: string
  validFrom?: Date
  validTo?: Date
  issuerCommonName?: string
  /** base64(DER) сертификата подписанта — для хранения */
  certDerB64?: string
}

export interface ParsedCms {
  ok: boolean
  error?: string
  signer?: ParsedSigner
  /** base64 от подписанных данных (encapContentInfo.eContent), если подпись attached */
  encapsulatedContentB64?: string
  /** Сколько подписей (signerInfos) внутри */
  signerCount: number
}

function stripToDer(input: string): Uint8Array | null {
  if (!input) return null
  let b64 = input.trim()
  // Уберём PEM-обёртку, если есть
  if (b64.includes("-----BEGIN")) {
    b64 = b64.replace(/-----BEGIN[^-]+-----/g, "").replace(/-----END[^-]+-----/g, "")
  }
  b64 = b64.replace(/\s+/g, "")
  try {
    return new Uint8Array(Buffer.from(b64, "base64"))
  } catch {
    return null
  }
}

/** Достаёт строковые значения всех атрибутов с данным OID из Name (RDNSequence). */
function readDnValues(name: Name, oid: string): string[] {
  const out: string[] = []
  for (const rdn of name) {
    for (const atv of rdn) {
      if (atv.type === oid) {
        const v = atv.value
        // AttributeValue — это CHOICE строковых типов; toString() возвращает значение
        const s = typeof v?.toString === "function" ? v.toString() : ""
        if (s && s !== "[object Object]") out.push(s)
      }
    }
  }
  return out
}

function firstDn(name: Name, oid: string): string | undefined {
  return readDnValues(name, oid)[0]
}

function timeToDate(t: { utcTime?: Date; generalTime?: Date } | undefined): Date | undefined {
  if (!t) return undefined
  return t.utcTime ?? t.generalTime ?? undefined
}

/** Извлекает 12-значный ИИН/БИН из строки вида "IIN041007551290" / "BIN…" / "…041007551290". */
function digits12(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = value.match(/\d{12}/)
  return m ? m[0] : undefined
}

function parseCertificate(cert: Certificate): ParsedSigner {
  const subject = cert.tbsCertificate.subject
  const issuer = cert.tbsCertificate.issuer

  const serialNumberAttr = firstDn(subject, OID.SERIAL_NUMBER)
  const orgIdentifier = firstDn(subject, OID.ORG_IDENTIFIER)
  // В сертификатах НУЦ РК БИН исторически кладётся в OU как "BIN123456789012".
  const ouBin = readDnValues(subject, OID.OU).find((v) => v.startsWith("BIN"))

  // ИИН: serialNumber начинается с "IIN" (физлицо).
  // БИН (юрлицо/ИП): organizationIdentifier (2.5.4.97) ИЛИ OU "BIN…" ИЛИ serialNumber "BIN".
  const iin = serialNumberAttr?.startsWith("IIN") ? digits12(serialNumberAttr) : undefined
  const bin =
    (orgIdentifier?.startsWith("BIN") ? digits12(orgIdentifier) : undefined) ??
    digits12(ouBin) ??
    (serialNumberAttr?.startsWith("BIN") ? digits12(serialNumberAttr) : undefined)

  return {
    commonName: firstDn(subject, OID.CN),
    surname: firstDn(subject, OID.SURNAME),
    givenName: firstDn(subject, OID.GIVEN_NAME),
    iin,
    bin,
    organization: firstDn(subject, OID.O),
    validFrom: timeToDate(cert.tbsCertificate.validity.notBefore),
    validTo: timeToDate(cert.tbsCertificate.validity.notAfter),
    issuerCommonName: firstDn(issuer, OID.CN),
    certDerB64: Buffer.from(AsnConvert.serialize(cert)).toString("base64"),
  }
}

/**
 * Разбирает base64-CMS от NCALayer. Возвращает данные подписанта и (для attached)
 * подписанные данные. Бросать не будет — при ошибке вернёт { ok: false }.
 */
export function parseCmsSignature(cmsB64: string): ParsedCms {
  const der = stripToDer(cmsB64)
  if (!der || der.length === 0) {
    return { ok: false, error: "Пустая или некорректная подпись", signerCount: 0 }
  }

  let signedData: SignedData
  try {
    const ci = AsnConvert.parse(der, ContentInfo)
    signedData = AsnConvert.parse(ci.content, SignedData)
  } catch (e) {
    return {
      ok: false,
      error: "Не удалось разобрать CMS: " + (e instanceof Error ? e.message : String(e)),
      signerCount: 0,
    }
  }

  const signerCount = signedData.signerInfos?.length ?? 0

  // Выбираем сертификат подписанта: предпочитаем тот, у кого есть ИИН/БИН
  // (конечный сертификат), иначе берём первый.
  const certs: Certificate[] = []
  for (const choice of signedData.certificates ?? []) {
    if (choice.certificate) certs.push(choice.certificate)
  }

  let signer: ParsedSigner | undefined
  if (certs.length > 0) {
    const parsed = certs.map(parseCertificate)
    signer = parsed.find((p) => p.iin || p.bin) ?? parsed[0]
  }

  // encapContentInfo.eContent — подписанные данные (attached).
  // EncapsulatedContent: { single?: OctetString, any?: ArrayBuffer }
  let encapsulatedContentB64: string | undefined
  const eContent = signedData.encapContentInfo?.eContent
  if (eContent) {
    try {
      let buf: Uint8Array | undefined
      if (eContent.single) {
        buf = new Uint8Array(eContent.single.buffer)
      } else if (eContent.any) {
        buf = new Uint8Array(eContent.any)
      }
      if (buf) encapsulatedContentB64 = Buffer.from(buf).toString("base64")
    } catch {
      /* контент detached или нестандартный — пропускаем */
    }
  }

  return { ok: true, signer, encapsulatedContentB64, signerCount }
}

/**
 * Проверка пригодности сертификата на момент подписания:
 *  - срок действия не истёк;
 *  - издатель похож на НУЦ РК.
 * Возвращает список предупреждений (пустой = всё хорошо). Не блокирует жёстко —
 * политику применения решает вызывающая сторона.
 */
export function validateSigner(signer: ParsedSigner | undefined, at: Date = new Date()): string[] {
  const warnings: string[] = []
  if (!signer) {
    warnings.push("Не удалось извлечь сертификат подписанта")
    return warnings
  }
  if (signer.validFrom && at < signer.validFrom) {
    warnings.push("Сертификат ещё не вступил в силу")
  }
  if (signer.validTo && at > signer.validTo) {
    warnings.push("Срок действия сертификата истёк")
  }
  const issuer = signer.issuerCommonName?.toUpperCase() ?? ""
  const looksNuc =
    issuer.includes("ҰЛТТЫҚ КУӘЛАНДЫРУШЫ") ||
    issuer.includes("НАЦИОНАЛЬНЫЙ УДОСТОВЕРЯЮЩИЙ") ||
    issuer.includes("NATIONAL CERTIFICATION") ||
    issuer.includes("NCA") ||
    issuer.includes("ҰКО") ||
    issuer.includes("GOST")
  if (issuer && !looksNuc) {
    warnings.push("Издатель сертификата не распознан как НУЦ РК")
  }
  return warnings
}

/** Человекочитаемое ФИО подписанта из разобранного сертификата. */
export function signerDisplayName(signer: ParsedSigner | undefined): string | undefined {
  if (!signer) return undefined
  if (signer.commonName) return signer.commonName
  const parts = [signer.surname, signer.givenName].filter(Boolean)
  return parts.length ? parts.join(" ") : signer.organization
}
