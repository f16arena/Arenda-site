import type { cabinet as ru } from "../ru/cabinet"

// Перевод по смыслу, термины — docs/i18n-glossary.md.

export const cabinet: typeof ru = {
  nav: {
    home: "Басты бет",
    sectionMine: "Жеке кабинет",
    // На странице — что начислено, что оплачено и сколько осталось. Для
    // жалға алушы это «төлемдер», как раздел в Kaspi; «қаржы» звучит как
    // отчётность бухгалтера.
    finances: "Төлемдер",
    meters: "Есептегіштер",
    documents: "Құжаттар",
    sectionSupport: "Қолдау",
    requests: "Өтінімдер",
    messages: "Хабарламалар",
    profile: "Профиль",
    faq: "Сұрақ-жауап",
  },
  shell: {
    cabinetTitle: "Жеке кабинет",
    tenantRole: "Жалға алушы",
    openMenu: "Мәзірді ашу",
    closeMenu: "Мәзірді жабу",
    openProfile: "Профильді ашу",
  },
}
