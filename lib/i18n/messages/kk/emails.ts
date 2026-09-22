import type { emails as ru } from "../ru/emails"

export const emails: typeof ru = {
  common: {
    openCabinet: "Жеке кабинетті ашу",
    footer: "Бұл — жалдауды басқару жүйесінің автоматты хаты. Сұрақтарыңыз болса, әкімшілікке хабарласыңыз.",
  },
  reminder: {
    subject: "Төлем туралы еске салу ({when})",
    title: "Төлем мерзімі — {when}",
    greeting: "Сәлеметсіз бе!",
    lead: "Төлем мерзімі {when} екенін еске саламыз:",
    period: "Кезең",
    type: "Есептеу",
    amount: "Сома",
    due: "Төлеу мерзімі",
    footer: "Егер төлеп қойған болсаңыз, бұл хатқа назар аудармаңыз.",
    text: "Төлем мерзімі — {when}. Сома: {amount}. Кезең: {period}.",
    when: {
      in3days: "3 күннен кейін",
      tomorrow: "ертең",
      today: "бүгін",
    },
  },
}
