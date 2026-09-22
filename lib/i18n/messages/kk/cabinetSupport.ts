import type { cabinetSupport as ru } from "../ru/cabinetSupport"
import { plural } from "../../translate"

export const cabinetSupport: typeof ru = {
  requests: {
    title: "Менің өтінімдерім",
    tabs: {
      active: "Ашық",
      closed: "Жабылған",
      pending: "Қабылдауды күтуде",
    },
    empty: "Өтінім жоқ",
    emptyHint: "Шам ауыстыру, интернет қосу немесе кез келген басқа сұрақ бойынша өтінім қалдырыңыз",
    count: plural({ one: "{count} өтінім", other: "{count} өтінім" }),
    comments: plural({ one: "{count} пікір", other: "{count} пікір" }),
    photo: "Фото",
    file: "Файл",
    dialog: {
      title: "Жаңа өтінім",
      subject: "Өтініш тақырыбы",
      subjectPlaceholder: "Мәселені қысқаша жазыңыз",
      description: "Сипаттама",
      descriptionPlaceholder: "Толығырақ…",
      attach: "Өтінімге фото немесе файл",
      attachHint: "JPG, PNG, WebP немесе PDF, 5 МБ дейін. Мәселені телефонмен түсіріп жіберсеңіз де болады.",
      type: "Түрі",
      priority: "Маңыздылығы",
      submit: "Жіберу",
      submitting: "Жіберілуде…",
      sent: "Өтінім әкімшіге жіберілді",
    },
    types: {
      TECHNICAL: "Техникалық",
      CLEANING: "Тазалау",
      INTERNET: "Интернет",
      QUESTION: "Сұрақ",
      OTHER: "Басқа",
    },
    priorities: {
      LOW: "Төмен",
      MEDIUM: "Орташа",
      HIGH: "Жоғары",
      URGENT: "Шұғыл",
    },
  },
  messages: {
    title: "Хабарламалар",
    subtitle: "Ғимарат әкімшілігімен байланыс",
  },
  faq: {
    title: "Жиі қойылатын сұрақтар",
    subtitle: "Кіру, төлемдер, құжаттар, қол қою, өтінімдер, есептегіштер және әкімшімен байланыс.",
  },
  error: {
    title: "Бірдеңе дұрыс болмады",
    hint: "Қатені жазып алдық. Төмендегі кодты әкімшіге айтыңыз.",
    code: "Қате",
    retry: "Қайталап көру",
  },
}
