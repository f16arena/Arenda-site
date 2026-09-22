// Общие слова интерфейса: кнопки, состояния, переключатель языка.

export const common = {
  actions: {
    save: "Сохранить",
    saving: "Сохранение…",
    cancel: "Отмена",
    close: "Закрыть",
    open: "Открыть",
    download: "Скачать",
    send: "Отправить",
    sending: "Отправка…",
    delete: "Удалить",
    edit: "Изменить",
    add: "Добавить",
    back: "Назад",
    search: "Поиск",
    retry: "Повторить",
    logout: "Выйти",
    more: "Ещё",
    all: "Все",
  },
  deleteDialog: {
    entity: "элемент",
    title: "Удалить {entity}?",
    ariaLabel: "Удалить {entity}",
    description: "Это действие нельзя отменить.",
    success: "Удалено",
    failed: "Не удалось удалить",
  },
  state: {
    loading: "Загрузка…",
    empty: "Пока пусто",
    error: "Что-то пошло не так",
    saved: "Сохранено",
    noData: "Нет данных",
  },
  language: {
    label: "Язык",
    changed: "Язык изменён",
  },
  theme: {
    light: "Светлая тема",
    dark: "Тёмная тема",
  },
  money: {
    perMonth: "/мес",
    tenge: "₸",
  },
}
