// Обязательные документы арендатора по виду юридического лица.
//
// Здесь только коды: они лежат в базе (TenantDocument.type) и переводу не
// подлежат. Подписи и пояснения — в словаре, в adminTenants.docs.types/hints
// (см. комментарий в lib/i18n/messages/ru/adminRefs.ts): единственное место,
// где чек-лист отрисовывается, — app/admin/tenants/[id]/documents-checklist.tsx.

export type RequiredDoc = {
  type: string
  /** Есть ли пояснение под названием (adminTenants.docs.hints.<type>). */
  hint?: boolean
}

const COMMON_DOCS: RequiredDoc[] = [
  { type: "BANK_DETAILS", hint: true },
]

const DOCS_BY_LEGAL_TYPE: Record<string, RequiredDoc[]> = {
  IP: [
    { type: "IP_CERTIFICATE", hint: true },
    { type: "ID_CARD", hint: true },
    ...COMMON_DOCS,
  ],
  CHSI: [
    { type: "CHSI_LICENSE", hint: true },
    { type: "CHSI_CERTIFICATE", hint: true },
    { type: "CHSI_CHAMBER_MEMBERSHIP", hint: true },
    { type: "ID_CARD", hint: true },
    ...COMMON_DOCS,
  ],
  TOO: [
    { type: "CHARTER", hint: true },
    { type: "ORDER", hint: true },
    { type: "DECISION", hint: true },
    { type: "BIN_CERTIFICATE", hint: true },
    { type: "ID_CARD" },
    ...COMMON_DOCS,
  ],
  AO: [
    { type: "CHARTER" },
    { type: "ORDER" },
    { type: "DECISION" },
    { type: "BIN_CERTIFICATE" },
    { type: "ID_CARD" },
    ...COMMON_DOCS,
  ],
  PHYSICAL: [
    { type: "ID_CARD" },
    ...COMMON_DOCS,
  ],
}

export function getRequiredDocs(legalType: string): RequiredDoc[] {
  return DOCS_BY_LEGAL_TYPE[legalType] ?? COMMON_DOCS
}
