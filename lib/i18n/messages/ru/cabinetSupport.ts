import { plural } from "../../translate"

// Кабинет арендатора → Заявки, Сообщения, FAQ, страница ошибки.

export const cabinetSupport = {
  requests: {
    title: "Мои заявки",
    tabs: {
      active: "Активные",
      closed: "Закрытые",
      pending: "Ожидают принятия",
    },
    empty: "Заявок нет",
    emptyHint: "Создайте заявку на замену лампочки, подключение интернета или любой другой вопрос",
    count: plural({ one: "{count} заявка", few: "{count} заявки", many: "{count} заявок", other: "{count} заявки" }),
    comments: plural({ one: "{count} комментарий", few: "{count} комментария", many: "{count} комментариев", other: "{count} комментария" }),
    photo: "Фото",
    file: "Файл",
    dialog: {
      title: "Новая заявка",
      subject: "Тема обращения",
      subjectPlaceholder: "Кратко опишите проблему",
      description: "Описание",
      descriptionPlaceholder: "Подробности…",
      attach: "Фото или файл к заявке",
      attachHint: "JPG, PNG, WebP или PDF до 5 МБ. Проблему можно просто сфотографировать на телефон.",
      type: "Тип",
      priority: "Приоритет",
      submit: "Отправить",
      submitting: "Отправка…",
      sent: "Заявка отправлена администратору",
    },
    types: {
      TECHNICAL: "Техническая",
      CLEANING: "Уборка",
      INTERNET: "Интернет",
      QUESTION: "Вопрос",
      OTHER: "Прочее",
    },
    priorities: {
      LOW: "Низкий",
      MEDIUM: "Средний",
      HIGH: "Высокий",
      URGENT: "Срочный",
    },
  },
  messages: {
    title: "Сообщения",
    subtitle: "Связь с администрацией здания",
  },
  faq: {
    title: "Частые вопросы",
    subtitle: "Вход, финансы, документы, подписание, заявки, счётчики и связь с администратором.",
  },
  error: {
    title: "Что-то пошло не так",
    hint: "Мы записали ошибку. Сообщите администратору код ниже.",
    code: "Ошибка",
    retry: "Попробовать снова",
  },
}
