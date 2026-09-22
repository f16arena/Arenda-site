import type { common as ru } from "../ru/common"

export const common: typeof ru = {
  actions: {
    save: "Сақтау",
    saving: "Сақталуда…",
    cancel: "Болдырмау",
    close: "Жабу",
    open: "Ашу",
    download: "Жүктеп алу",
    send: "Жіберу",
    sending: "Жіберілуде…",
    delete: "Жою",
    edit: "Өзгерту",
    add: "Қосу",
    back: "Артқа",
    search: "Іздеу",
    retry: "Қайталау",
    logout: "Шығу",
    more: "Тағы",
    all: "Барлығы",
  },
  deleteDialog: {
    entity: "элемент",
    title: "{entity} жойылсын ба?",
    ariaLabel: "{entity} жою",
    description: "Бұл әрекетті кері қайтару мүмкін емес.",
    success: "Жойылды",
    failed: "Жою мүмкін болмады",
  },
  state: {
    loading: "Жүктелуде…",
    empty: "Әзірге бос",
    error: "Қате орын алды",
    saved: "Сақталды",
    noData: "Деректер жоқ",
  },
  language: {
    label: "Тіл",
    changed: "Тіл өзгертілді",
  },
  // «Тақырып» — это «тема разговора», для оформления так не говорят.
  // Kaspi и Telegram: «жарық режим» / «түнгі режим».
  theme: {
    light: "Жарық режим",
    dark: "Түнгі режим",
  },
  money: {
    perMonth: "/ай",
    tenge: "₸",
  },
}
