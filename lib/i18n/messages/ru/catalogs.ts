// Подписи справочников, которые живут отдельными модулями в lib/*.ts.
//
// Такой модуль — чистая функция: он не знает языка пользователя (а часть из них
// уезжает в браузер, где словаря целиком нет). Поэтому модуль отдаёт ключ, а
// подпись собирается здесь — тот же приём, что у lib/kz-validators.ts
// (common.requisiteChecks) и lib/kz-iin.ts (common.iinChecks).
//
// Раздел отдельный, а не внутри common: common уезжает в браузер на каждой
// странице, и справочникам там места нет (см. scripts/performance-audit.mjs).

export const catalogs = {
  // lib/contact-validation.ts. Название поля подставляет вызывающая сторона
  // («Email владельца»), поэтому в шаблоне две формы: {field} с заглавной для
  // начала фразы и {fieldLower} для середины.
  contact: {
    fields: {
      email: "Email",
      phone: "Телефон",
      ownerEmail: "Email владельца",
      ownerPhone: "Телефон владельца",
    },
    required: "Введите {fieldLower}",
    emailInvalid: "{field}: введите корректный email",
    emailNoDomain: "{field}: укажите домен после @",
    emailDomainUnknown: "{field}: домен {domain} не найден или не принимает почту",
    phoneInvalid: "{field}: введите номер Казахстана в формате +7 7XX XXX XX XX",
  },

  // lib/schemas.ts. Сообщения zod записываются при загрузке модуля — раньше,
  // чем известен язык запроса. Поэтому в схеме стоит ключ, а подпись
  // подставляет firstZodError.
  validation: {
    fallback: "Ошибка валидации",
    phoneRequired: "Введите телефон",
    phoneFormat: "Некорректный формат телефона",
    email: "Некорректный email",
    period: "Период должен быть в формате YYYY-MM",
    amount: "Некорректная сумма",
    amountNegative: "Сумма не может быть отрицательной",
    amountZero: "Сумма должна быть больше нуля",
    taxId: "БИН/ИИН должен содержать 12 цифр",
    iik: "ИИК должен начинаться с KZ и содержать 20 символов",
    bik: "БИК — это 8-11 латинских символов",
    nameShort: "Имя минимум 2 символа",
    passwordShort: "Пароль минимум 6 символов",
    contactRequired: "Укажите email или телефон",
    currentPassword: "Введите текущий пароль",
    newPasswordShort: "Новый пароль минимум 8 символов",
    passwordsMismatch: "Пароли не совпадают",
    newPasswordSame: "Новый пароль должен отличаться от текущего",
    titleShort: "Заголовок минимум 3 символа",
    describeProblem: "Опишите проблему",
    nameRequired: "Название обязательно",
  },

  // Предмет договора (lib/contract-placement-types.ts) — короткая метка для
  // бейджа в списке договоров. Полное название предмета остаётся в модуле: те
  // же слова стоят в подзаголовке договора и Акта, их переводит юрист.
  contractTypes: {
    PREMISES: "Помещение",
    ROOF: "Крыша/фасад",
    TERRITORY: "Территория",
    WAREHOUSE: "Склад",
    ADVERTISING: "Реклама/щит",
    EQUIPMENT: "Оборудование",
    PARKING: "Парковка",
  },

  // Сводка по рынку (lib/market.ts): вид помещения в объявлении krisha.
  marketTypes: {
    OFFICE: "Офисы",
    FREE: "Свободное назначение",
    RETAIL: "Магазины/торговые",
    WAREHOUSE: "Склады",
    OTHER: "Прочее",
  },
  market: {
    wholeCity: "Весь город ({city})",
  },
  // Города, по которым собирается рынок. Казахские названия официальные
  // (Өскемен, Орал, Петропавл), а не транслитерация русских.
  cities: {
    ustKamenogorsk: "Усть-Каменогорск",
    almaty: "Алматы",
    astana: "Астана",
    shymkent: "Шымкент",
    karaganda: "Караганда",
    aktobe: "Актобе",
    taraz: "Тараз",
    pavlodar: "Павлодар",
    semey: "Семей",
    kostanay: "Костанай",
    kyzylorda: "Кызылорда",
    atyrau: "Атырау",
    uralsk: "Уральск",
    petropavlovsk: "Петропавловск",
  },

  // Виды уведомлений в мобильном приложении (lib/notification-preferences.ts).
  // Список уходит в приложение готовыми подписями, поэтому переводится на
  // сервере по языку получателя.
  notificationTypes: {
    BUILDING_NOTICE: "Объявления по зданию",
    DOCUMENT_SIGNATURE_REQUEST: "Документы на подпись",
    PAYMENT_CONFIRMED: "Оплаты подтверждены",
    PAYMENT_DISPUTED: "Оплаты требуют уточнения",
    PAYMENT_REJECTED: "Оплаты отклонены",
    PAYMENT_REPORTED: "Новые отчёты об оплате",
    NEW_REQUEST: "Новые заявки",
    REQUEST_STATUS_CHANGED: "Статусы заявок",
    MESSAGE: "Сообщения",
    MESSAGE_RECEIVED: "Входящие сообщения",
    CONTRACT_EXPIRING: "Сроки договоров",
    PAYMENT_DUE: "Напоминания об оплате",
    ADDON_REQUEST: "Заявки на аддоны (только супер-админ)",
    ADDON_ACTIVATED: "Аддон активирован",
    ADDON_REJECTED: "Заявка на аддон отклонена",
    ADDON_DEACTIVATED: "Аддон выключен",
    SERVICE_REQUEST: "Заявки на разовые услуги (только супер-админ)",
    SERVICE_PAID: "Услуга оплачена",
    SERVICE_DELIVERED: "Услуга выполнена",
    SERVICE_CANCELLED: "Услуга отменена",
  },

  // Шаблоны планов (lib/layout-templates.ts): название шаблона в списке и
  // подписи помещений, которые генератор кладёт в план.
  layoutTemplates: {
    corridor: {
      name: "Коридорная планировка",
      description: "Центральный коридор, офисы по обе стороны",
    },
    openspace: {
      name: "Опенспейс",
      description: "Один большой зал + санузел и кухня",
    },
    retail: {
      name: "Ритейл / магазин",
      description: "Большой торговый зал + подсобка и санузел",
    },
    perimeter: {
      name: "Кабинеты по периметру",
      description: "Ядро (лифт/лестница/санузел) в центре, кабинеты вокруг",
    },
    roofClean: {
      name: "Кровля (контур)",
      description: "Чистая кровля — площадка под объекты (антенны, оборудование)",
    },
    roofEquipment: {
      name: "Кровля с оборудованием",
      description: "Контур + технические зоны под HVAC и мачты",
    },
    parkingRows: {
      name: "Парковка рядами",
      description: "Сетка парковочных мест с проездами",
    },
    yardGreen: {
      name: "Двор с озеленением",
      description: "Зелёная зона, дорожки и несколько парковочных мест",
    },
  },
  // Подписи на самом плане. Короткие: они рисуются внутри прямоугольника.
  layoutLabels: {
    corridor: "Коридор",
    office: "Офис {n}",
    cabinet: "Каб. {n}",
    cabinetLeft: "Каб. A",
    cabinetRight: "Каб. B",
    openspace: "Опенспейс",
    retailHall: "Торговый зал",
    storeroom: "Подсобка",
    stairs: "Лестница",
    elevator: "Лифт",
    toilet: "Санузел",
    kitchen: "Кухня",
    roof: "Кровля",
    techZoneHvac: "Тех. зона (HVAC)",
    techZone: "Тех. зона",
    lawn: "Газон",
    path: "Дорожка",
    parkingSpot: "P{n}",
  },
}
