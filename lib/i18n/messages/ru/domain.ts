// Предметные названия: виды начислений, виды документов, реквизиты.
// Нужны и арендатору, и владельцу — поэтому отдельным разделом.

export const domain = {
  chargeTypes: {
    RENT: "Аренда",
    DEPOSIT: "Гарантийный депозит",
    DEPOSIT_REFUND: "Возврат депозита",
    SERVICE_FEE: "Эксплуатационный сбор",
    SERVICE_FEE_INDEXED: "Эксплуатационный сбор (с индексацией)",
    ELECTRICITY: "Электричество",
    WATER: "Вода",
    HEATING: "Отопление",
    GARBAGE: "Вывоз мусора",
    SECURITY: "Охрана",
    INTERNET: "Интернет",
    GAS: "Газ",
    CLEANING: "Уборка",
    PARKING: "Парковка",
    PENALTY: "Штраф/пеня",
    SERVICE_DELIVERED: "Оказанная услуга",
    OTHER: "Прочее",
  },
  // Роли: значения Users.role целиком (OWNER | ADMIN | ACCOUNTANT |
  // FACILITY_MANAGER | EMPLOYEE | TENANT). Роли организации приходят с
  // приставкой ORG_ и подпись берут из своей записи в базе.
  roles: {
    OWNER: "Владелец",
    ADMIN: "Администратор",
    ACCOUNTANT: "Бухгалтер",
    FACILITY_MANAGER: "Завхоз",
    EMPLOYEE: "Сотрудник",
    TENANT: "Арендатор",
  },
  // Статусы. Один список на заявки, задачи, договоры, помещения и платежи:
  // подпись ищут по значению поля (`domain.statuses.${status}`), и одно и то же
  // значение не должно переводиться в двух местах по-разному.
  statuses: {
    NEW: "Новая",
    OPEN: "Открыта",
    IN_PROGRESS: "В работе",
    DONE: "Выполнена",
    CLOSED: "Закрыта",
    CANCELLED: "Отменена",
    POSTPONED: "Отложена",
    DRAFT: "Черновик",
    SENT: "Отправлен",
    VIEWED: "Просмотрен",
    SIGNED_BY_TENANT: "Подписан арендатором",
    SIGNED: "Подписан",
    REJECTED: "Отклонён",
    EXPIRED: "Истёк",
    ARCHIVED: "Архив",
    VACANT: "Свободно",
    OCCUPIED: "Занято",
    MAINTENANCE: "Обслуживание",
    PENDING: "Ожидает",
    PAID: "Оплачено",
  },
  paymentMethods: {
    TRANSFER: "Банковский перевод",
    KASPI: "Kaspi",
    CASH: "Наличные",
    CARD: "Карта",
  },
  docTypes: {
    INVOICE: "Счёт на оплату",
    ACT: "Акт услуг",
    RECONCILIATION: "Акт сверки",
    HANDOVER: "Акт приёма-передачи",
    CONTRACT: "Договор",
    ADDENDUM: "Дополнительное соглашение",
  },
  requisites: {
    recipient: "Получатель",
    taxId: "ИИН/БИН",
    bank: "Банк",
    bik: "БИК",
    iik: "ИИК",
    amount: "Сумма",
    purpose: "Назначение платежа",
  },
}
