export type RequiredDoc = {
  type: string
  label: string
  description?: string
}

const COMMON_DOCS: RequiredDoc[] = [
  { type: "BANK_DETAILS",  label: "Реквизиты банка", description: "Справка о наличии счёта или договор обслуживания" },
]

const DOCS_BY_LEGAL_TYPE: Record<string, RequiredDoc[]> = {
  IP: [
    { type: "IP_CERTIFICATE",  label: "Талон ИП / Уведомление о регистрации", description: "Документ из УГД (Управление государственных доходов)" },
    { type: "ID_CARD",         label: "Удостоверение личности руководителя", description: "Скан или фото обеих сторон" },
    ...COMMON_DOCS,
  ],
  CHSI: [
    { type: "CHSI_LICENSE",             label: "Лицензия частного судебного исполнителя", description: "Документ, подтверждающий право заниматься деятельностью ЧСИ" },
    { type: "CHSI_CERTIFICATE",         label: "Удостоверение / подтверждение статуса ЧСИ", description: "Удостоверение или иной документ, подтверждающий статус частного судебного исполнителя" },
    { type: "CHSI_CHAMBER_MEMBERSHIP",  label: "Подтверждение членства в палате ЧСИ", description: "Документ или сведения о членстве в Республиканской/региональной палате частных судебных исполнителей" },
    { type: "ID_CARD",                  label: "Удостоверение личности ЧСИ", description: "Скан или фото обеих сторон" },
    ...COMMON_DOCS,
  ],
  TOO: [
    { type: "CHARTER",          label: "Устав", description: "Действующая редакция, прошитая и пронумерованная" },
    { type: "ORDER",            label: "Приказ о назначении директора", description: "Подписанный учредителем" },
    { type: "DECISION",         label: "Решение учредителя / протокол собрания", description: "О создании/изменениях" },
    { type: "BIN_CERTIFICATE",  label: "Справка о государственной регистрации (БИН)", description: "Из e-license.kz или УГД" },
    { type: "ID_CARD",          label: "Удостоверение личности директора" },
    ...COMMON_DOCS,
  ],
  AO: [
    { type: "CHARTER",          label: "Устав АО" },
    { type: "ORDER",            label: "Приказ о назначении руководителя" },
    { type: "DECISION",         label: "Решение совета директоров / общего собрания акционеров" },
    { type: "BIN_CERTIFICATE",  label: "Справка о государственной регистрации (БИН)" },
    { type: "ID_CARD",          label: "Удостоверение личности руководителя" },
    ...COMMON_DOCS,
  ],
  PHYSICAL: [
    { type: "ID_CARD",  label: "Удостоверение личности" },
    ...COMMON_DOCS,
  ],
}

export function getRequiredDocs(legalType: string): RequiredDoc[] {
  return DOCS_BY_LEGAL_TYPE[legalType] ?? COMMON_DOCS
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  IP_CERTIFICATE:  "Талон ИП",
  CHSI_LICENSE:    "Лицензия ЧСИ",
  CHSI_CERTIFICATE: "Удостоверение ЧСИ",
  CHSI_CHAMBER_MEMBERSHIP: "Членство в палате ЧСИ",
  CHARTER:         "Устав",
  ORDER:           "Приказ",
  DECISION:        "Решение",
  BIN_CERTIFICATE: "Свидетельство БИН",
  ID_CARD:         "Удостоверение личности",
  BANK_DETAILS:    "Реквизиты банка",
  CONTRACT:        "Договор аренды",
  ACT:             "Акт",
  INVOICE:         "Счёт-фактура",
  OTHER:           "Прочее",
}
