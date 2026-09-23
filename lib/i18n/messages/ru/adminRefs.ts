// Раздел adminRefs: справочники прав, должностей, тарифных возможностей,
// аддонов, разовых услуг, вкладок-хабов и журнала действий.
//
// Принцип тот же, что у adminChecks: модуль-справочник (lib/capabilities.ts,
// lib/plan-capabilities.ts, lib/acl.ts, lib/role-capabilities.ts,
// lib/hub-tabs.ts, lib/addons-catalog.ts, lib/services-catalog.ts,
// lib/audit-humanize.ts) остаётся владельцем КОДА, а подпись живёт здесь и
// подставляется в месте отрисовки.
//
// Код права переводить нельзя: "finance.recordPayment" лежит в базе (таблица
// role_permissions), в ролях организаций и в проверках app/actions/**. Поэтому
// ключи словаря повторяют код один в один, а русский текст в самих модулях
// сохранён — им пользуется суперадмин (у него свой, служебный язык) и он же
// работает запасным, если право появится раньше перевода.
//
// Виды обязательных документов арендатора (lib/required-docs.ts) здесь
// намеренно не дублируются: они уже переведены в adminTenants.docs.types/hints
// — единственном месте, где отрисовываются.

export const adminRefs = {
  // Страницы админки (lib/acl.ts SECTION_LABELS). Подписи короткие: это
  // заголовки карточек в матрице «страница × функции», где ширина колонки
  // фиксирована.
  sections: {
    dashboard: "Обзор",
    buildings: "Здания",
    spaces: "Помещения",
    tenants: "Арендаторы",
    finances: "Финансы",
    meters: "Счётчики",
    contracts: "Договоры",
    requests: "Заявки",
    tasks: "Задачи",
    staff: "Сотрудники",
    complaints: "Жалобы",
    messages: "Сообщения",
    analytics: "Аналитика",
    settings: "Настройки",
    roles: "Роли и доступ",
    users: "Все пользователи (супер-админ)",
    documents: "Документы",
    profile: "Мой профиль",
  },

  // Группы страниц в матрице прав (lib/role-capabilities.ts).
  sectionGroups: {
    workspace: {
      label: "Рабочее пространство",
      description: "Главные страницы, здания, помещения и арендаторы.",
    },
    money: {
      label: "Деньги и документы",
      description: "Финансы, договоры, документы, шаблоны и аналитика.",
    },
    operations: {
      label: "Операционная работа",
      description: "Заявки, задачи, счётчики, сообщения, жалобы и сотрудники.",
    },
    control: {
      label: "Управление",
      description: "Настройки, должности, права и пользователи.",
    },
  },

  // Группы точных прав (lib/capabilities.ts ACTION_CAPABILITY_GROUPS).
  capabilityGroups: {
    access: {
      label: "Пользователи и доступ",
      description: "Кто может приглашать людей, менять должности и управлять правами.",
    },
    objects: {
      label: "Здания и помещения",
      description: "Создание объектов, этажей, помещений и привязка арендаторов.",
    },
    tenants: {
      label: "Арендаторы",
      description: "Карточки арендаторов, контакты, условия аренды и привязки.",
    },
    finance: {
      label: "Финансы",
      description: "Начисления, оплаты, касса, выписки и отчёты.",
    },
    documents: {
      label: "Документы",
      description: "Шаблоны, договоры, счета, акты, подписи и хранилище.",
    },
    operations: {
      label: "Операционная работа",
      description: "Заявки, задачи, счётчики, сообщения, помощь и здоровье системы.",
    },
  },

  // Точные права. Вложенность повторяет код: "finance.recordPayment" →
  // capabilities.finance.recordPayment. Ключи менять нельзя — это контракт с
  // базой и ролями.
  capabilities: {
    users: {
      invite: {
        label: "Приглашать пользователей",
        description: "Создание нового пользователя внутри организации.",
      },
      edit: {
        label: "Редактировать пользователей",
        description: "Изменение контактов, роли и привязки к зданиям.",
      },
      resetPassword: {
        label: "Сбрасывать пароль",
        description: "Выдача нового пароля сотруднику или администратору.",
      },
      deactivate: {
        label: "Отключать пользователей",
        description: "Блокировка или повторная активация доступа.",
      },
      delete: {
        label: "Удалять пользователей",
        description: "Удаление профиля или деактивация связанного пользователя.",
      },
    },
    roles: {
      create: {
        label: "Создавать должности",
        description: "Добавление новой должности владельцем.",
      },
      editSections: {
        label: "Менять доступ к разделам",
        description: "Включение страниц и права редактирования для должности.",
      },
      editActions: {
        label: "Менять точные действия",
        description: "Включение отдельных кнопок и серверных действий.",
      },
      delete: {
        label: "Удалять должности",
        description: "Удаление должности, если она никому не назначена.",
      },
    },
    buildings: {
      create: {
        label: "Создавать здания",
        description: "Добавление нового объекта в портфель.",
      },
      edit: {
        label: "Редактировать здания",
        description: "Изменение адреса, контактов, ответственного и префиксов.",
      },
      toggle: {
        label: "Включать и отключать здания",
        description: "Деактивация здания без удаления данных.",
      },
      delete: {
        label: "Удалять здания",
        description: "Удаление пустого здания без этажей и помещений.",
      },
    },
    floors: {
      create: {
        label: "Создавать этажи",
        description: "Добавление этажа и базовой ставки.",
      },
      edit: {
        label: "Редактировать этажи",
        description: "Изменение названия, ставки, площади и плана этажа.",
      },
      delete: {
        label: "Удалять этажи",
        description: "Удаление этажа с защитой от занятых помещений.",
      },
    },
    spaces: {
      edit: {
        label: "Редактировать помещения",
        description: "Номер, площадь, статус и описание помещения.",
      },
      assignTenant: {
        label: "Назначать арендатора в помещение",
        description: "Связь помещения с арендатором и статусом занятости.",
      },
      delete: {
        label: "Удалять помещения",
        description: "Удаление свободных помещений.",
      },
    },
    leads: {
      manage: {
        label: "Вести лиды",
        description: "Создание и изменение заявок потенциальных арендаторов.",
      },
      bookSpace: {
        label: "Бронировать помещение по лиду",
        description: "Временное удержание помещения под потенциального арендатора.",
      },
    },
    tenants: {
      create: {
        label: "Создавать арендаторов",
        description: "Добавление нового арендатора.",
      },
      editContacts: {
        label: "Менять контакты арендатора",
        description: "ФИО, телефон, email и доступ в кабинет.",
      },
      editCompany: {
        label: "Менять данные компании",
        description: "Правовая форма, ИИН/БИН, адреса, руководитель и реквизиты.",
      },
      editRentalTerms: {
        label: "Менять условия аренды",
        description: "Ставка, фиксированная сумма, НДС, день оплаты и пеня.",
      },
      assignSpaces: {
        label: "Привязывать помещения и этажи",
        description: "Несколько помещений, несколько этажей и аренда целого этажа.",
      },
      blacklist: {
        label: "Добавлять в чёрный список",
        description: "Пометка проблемного арендатора.",
      },
      delete: {
        label: "Удалять арендаторов",
        description: "Удаление карточки с проверкой долгов и документов.",
      },
    },
    finance: {
      createInvoice: {
        label: "Создавать счета и начисления",
        description: "Ручные начисления и ежемесячные счета.",
      },
      recordPayment: {
        label: "Вносить оплату",
        description: "Ручное внесение оплаты и закрытие начислений.",
      },
      confirmPayment: {
        label: "Подтверждать чеки",
        description: "Подтверждение оплаты, отправленной арендатором.",
      },
      disputePayment: {
        label: "Отправлять оплату в спор",
        description: "Пометка оплаты как спорной с причиной.",
      },
      rejectPayment: {
        label: "Отклонять оплату",
        description: "Отклонение чека или заявленной оплаты.",
      },
      cashPayment: {
        label: "Подтверждать наличные",
        description: "Наличная оплата с контролем администратора.",
      },
      manageCashAccounts: {
        label: "Управлять счетами и кассой",
        description: "Банк, касса, карта, переводы и корректировки.",
      },
      manageExpenses: {
        label: "Вносить расходы",
        description: "Создание расходов здания и списание с денежных счетов.",
      },
      importBank: {
        label: "Импортировать выписку банка",
        description: "Загрузка банковской выписки и авто-сверка платежей.",
      },
      manageTariffs: {
        label: "Менять коммунальные тарифы",
        description: "Ставки за свет, воду, уборку и другие услуги.",
      },
      deleteRecords: {
        label: "Удалять финансовые записи",
        description: "Удаление начислений, оплат и расходов.",
      },
      export: {
        label: "Выгружать финансы (Excel)",
        description: "Excel-выгрузка финансов и отчётов.",
      },
      export1c: {
        label: "Экспорт 1С",
        description: "Выгрузка данных в формате 1С-Enterprise.",
      },
      exportZip: {
        label: "Скачать ZIP документов",
        description: "Все счета и АВР за месяц одним архивом.",
      },
      installments: {
        label: "Рассрочка долга",
        description: "Реструктуризация задолженности арендатора в рассрочку.",
      },
      deposits: {
        label: "Гарантийные депозиты",
        description: "Раздел депозитов: начисление, возврат, контроль.",
      },
      viewBalance: {
        label: "Баланс счетов и кассы",
        description: "Просмотр баланса банковских счетов и кассы.",
      },
    },
    documents: {
      create: {
        label: "Создавать документы",
        description: "Договоры, счета, АВР и акты сверки.",
      },
      deleteUnsigned: {
        label: "Удалять неподписанные документы",
        description: "Удаление ошибочного черновика или документа без подписи.",
      },
      deleteSigned: {
        label: "Удалять подписанные документы",
        description: "Удаление подписанного документа только владельцем.",
      },
      uploadTemplate: {
        label: "Загружать шаблоны",
        description: "Загрузка DOCX/XLSX/PDF-шаблонов организации.",
      },
      generateBulk: {
        label: "Массово формировать документы",
        description: "Пакетное создание документов.",
      },
      sign: {
        label: "Подписывать документы",
        description: "Запуск и контроль подписей NCALayer.",
      },
      addendum: {
        label: "Создавать доп. соглашения",
        description: "Изменение условий только через документ-основание.",
      },
      esf: {
        label: "Отправлять в ЭСФ",
        description: "Выписка и отправка счёта-фактуры в ИС ЭСФ КГД.",
      },
    },
    storage: {
      upload: {
        label: "Загружать файлы",
        description: "Файлы организации, арендаторов, чеки и вложения.",
      },
      delete: {
        label: "Удалять файлы",
        description: "Удаление файла из хранилища с проверкой связей.",
      },
    },
    requests: {
      manage: {
        label: "Обрабатывать заявки",
        description: "Статусы, комментарии и работа с обращениями арендаторов.",
      },
    },
    tasks: {
      manage: {
        label: "Управлять задачами",
        description: "Создание, назначение и закрытие задач.",
      },
    },
    meters: {
      manage: {
        label: "Управлять счётчиками",
        description: "Создание, показания, тарифы и удаление счётчиков.",
      },
    },
    messages: {
      send: {
        label: "Писать сообщения",
        description: "Общение с арендаторами внутри системы.",
      },
    },
    complaints: {
      manage: {
        label: "Разбирать жалобы",
        description: "Статусы и ответы по жалобам.",
      },
    },
    staff: {
      manageSalary: {
        label: "Начислять зарплаты",
        description: "Начисление и отметка выплат сотрудникам.",
      },
    },
    faq: {
      manage: {
        label: "Редактировать помощь",
        description: "База инструкций для владельца, администратора и арендатора.",
      },
    },
    settings: {
      updateOrganization: {
        label: "Менять настройки организации",
        description: "Название, адрес, контакты, НДС и реквизиты.",
      },
      updateBankDetails: {
        label: "Менять банковские реквизиты",
        description: "Счета, БИК, ИИК и данные арендодателя.",
      },
    },
    systemHealth: {
      view: {
        label: "Видеть проверку системы",
        description: "Здоровье системы, защиты, ошибки и качество данных.",
      },
    },
  },

  // Ошибки прав: их видит пользователь в уведомлении, а не разработчик.
  errors: {
    noCapability: "Нет права: {capability}",
    demoBlocked: "В демо-версии это действие недоступно. Зарегистрируйтесь, чтобы пользоваться полностью.",
    featureLocked: "Функция недоступна в текущем тарифе: {feature}",
  },

  // Группы возможностей тарифа (lib/plan-capabilities.ts).
  planGroups: {
    core: {
      label: "Ядро платформы",
      description: "Базовая работа: здания, арендаторы, поиск и кабинет.",
    },
    objects: {
      label: "Объекты и помещения",
      description: "Планировки, помещения, лиды и контроль качества данных.",
    },
    documents: {
      label: "Документы и подписи",
      description: "Договоры, шаблоны, доп. соглашения, хранение и подпись.",
    },
    finance: {
      label: "Финансы",
      description: "Начисления, оплаты, отчёты, касса, банк и экспорт.",
    },
    operations: {
      label: "Операционная работа",
      description: "Заявки, задачи, счётчики, уведомления и напоминания.",
    },
    platform: {
      label: "Расширения и поддержка",
      description: "API, домены, white label, AI, мониторинг и приоритетная поддержка.",
    },
    analytics: {
      label: "Аналитика",
      description: "Три уровня аналитики: операционная, управленческая и на заказ.",
    },
  },

  // Возможности тарифа. Ключ — флаг в JSON тарифа, менять нельзя.
  planFeatures: {
    multiBuilding: {
      label: "Несколько зданий",
      description: "Организация может вести несколько объектов и смотреть общую картину.",
    },
    tenantCabinet: {
      label: "Кабинет арендатора",
      description: "Арендаторы видят долг, документы, заявки, оплату и историю.",
    },
    cmdkSearch: {
      label: "Глобальный поиск Ctrl+K",
      description: "Быстрый поиск по арендаторам, документам, зданиям и действиям.",
    },
    addressAutocomplete: {
      label: "Подсказки адресов РК",
      description: "Автоподбор адреса для зданий, организаций и арендаторов.",
    },
    roleBuilder: {
      label: "Конструктор должностей",
      description: "Владелец сможет сам настраивать должности и права команды.",
    },
    floorEditor: {
      label: "Графический редактор плана",
      description: "Визуальное создание и редактирование помещений на плане этажа.",
    },
    publicBooking: {
      label: "Витрина свободных помещений",
      description: "Страница для заявок от потенциальных арендаторов.",
    },
    leadsPipeline: {
      label: "Лиды и бронирование",
      description: "Воронка заявок, бронь помещения и перевод лида в арендатора.",
    },
    dataQuality: {
      label: "Центр качества данных",
      description: "Поиск проблем: нет реквизитов, нет помещения, двойные ставки, пустые контакты.",
    },
    contractTemplates: {
      label: "Шаблоны договоров",
      description: "DOCX/XLSX/PDF-шаблоны с подстановкой данных арендатора и владельца.",
    },
    documentTemplates: {
      label: "Свои шаблоны документов",
      description: "Отдельные шаблоны для договоров, счетов, АВР и актов сверки.",
    },
    addendums: {
      label: "Дополнительные соглашения",
      description: "Черновик из договора, подпись и применение изменений только после подписания.",
    },
    ncalayerSigning: {
      label: "Подписание NCALayer",
      description: "Электронная подпись документов арендатором и арендодателем.",
    },
    storage: {
      label: "Хранилище файлов",
      description: "Хранение договоров, чеков, вложений заявок и файлов организации.",
    },
    bulkDocuments: {
      label: "Массовые документы",
      description: "Пакетное создание или скачивание документов.",
    },
    invoices: {
      label: "Счета и начисления",
      description: "Создание счетов, начислений, долгов и закрытие оплатой.",
    },
    paymentReports: {
      label: "Чеки арендатора",
      description: "Арендатор отправляет чек, администратор подтверждает или отклоняет.",
    },
    cashPayments: {
      label: "Наличная оплата",
      description: "Приём наличных с обязательным подтверждением администратором.",
    },
    cashAccounting: {
      label: "Касса и счета организации",
      description: "Учёт денег по банковским счетам, кассе и внутренним переводам.",
    },
    bankImport: {
      label: "Импорт банковской выписки",
      description: "Загрузка выписок для сверки платежей.",
    },
    excelExport: {
      label: "Excel-экспорт",
      description: "Выгрузка таблиц и отчётов в Excel.",
    },
    ownerReports: {
      label: "Отчёты владельца PDF/Excel",
      description: "P&L, долги, доходность, заполняемость и сравнение зданий.",
    },
    export1c: {
      label: "Экспорт 1С",
      description: "Подготовка данных для бухгалтерского учёта.",
    },
    requests: {
      label: "Заявки арендаторов",
      description: "Обращения арендаторов с комментариями, статусами и файлами.",
    },
    tasks: {
      label: "Задачи команды",
      description: "Назначение задач администраторам, техникам и менеджерам.",
    },
    meters: {
      label: "Счётчики и коммунальные услуги",
      description: "Показания, расход, тарифы и начисления по коммунальным платежам.",
    },
    autoReminders: {
      label: "Автонапоминания",
      description: "Уведомления о долгах, сроках оплаты, договорах и заявках.",
    },
    emailNotifications: {
      label: "Email-уведомления",
      description: "Отправка писем арендаторам и пользователям организации.",
    },
    telegramBot: {
      label: "Telegram-бот",
      description: "Оповещения и действия через Telegram.",
    },
    api: {
      label: "Public API",
      description: "Интеграции с внешними системами через API-ключи.",
    },
    customDomain: {
      label: "Свой домен",
      description: "Подключение клиентского домена вместо стандартного поддомена.",
    },
    whiteLabel: {
      label: "White label",
      description: "Брендинг клиента без явного упоминания платформы.",
    },
    whatsappBusiness: {
      label: "WhatsApp Business",
      description: "Уведомления арендаторов через WhatsApp Business API. Себестоимость 50-150 ₸ за сообщение.",
    },
    onPremise: {
      label: "Установка на своих серверах",
      description: "Установка платформы на серверах клиента для Enterprise.",
    },
    webVitals: {
      label: "Core Web Vitals",
      description: "Сбор LCP, INP, CLS и маршрутов для анализа скорости.",
    },
    supportMode: {
      label: "Режим поддержки",
      description: "Расширенная диагностика организации для поддержки.",
    },
    aiAssistant: {
      label: "AI-ассистент",
      description: "AI-помощник для документов, проверок и анализа данных.",
    },
    prioritySupport: {
      label: "Приоритетная поддержка",
      description: "Быстрые ответы, помощь с настройкой и сопровождение.",
    },
    analyticsBasic: {
      label: "Базовая аналитика",
      description: "Дашборд, прогноз денег на 6 месяцев, топ должников, заполняемость.",
    },
    analyticsAdvanced: {
      label: "Расширенная аналитика",
      description: "P&L по объектам, когорты арендаторов, heatmap, сравнение зданий, прогноз на 12 месяцев, долги по возрасту.",
    },
    analyticsCustomReports: {
      label: "Отчёты на заказ",
      description: "Шаблоны отчётов под клиента, экспорт в Power BI и Tableau, регулярные авто-отчёты.",
    },
  },

  // Лимиты тарифа (lib/plan-capabilities.ts PLAN_USAGE_LIMITS).
  planLimits: {
    storageGb: {
      label: "Хранилище",
      unit: "ГБ",
      description: "Общий объём файлов организации: договоры, чеки, вложения и шаблоны.",
    },
    documentsPerMonth: {
      label: "Документы в месяц",
      unit: "шт.",
      description: "Сколько документов можно формировать за календарный месяц.",
    },
    apiRequestsPerMonth: {
      label: "API-запросы в месяц",
      unit: "запр.",
      description: "Лимит обращений к публичному API.",
    },
    supportSlaHours: {
      label: "SLA поддержки",
      unit: "час.",
      description: "Целевое время первой реакции поддержки.",
    },
  },

  // Аддоны (lib/addons-catalog.ts). Ключ — код аддона в базе.
  addons: {
    BUILDING_STARTER: {
      label: "+1 здание (Starter)",
      description: "Дополнительное здание сверх лимита тарифа Starter",
    },
    BUILDING_PRO: {
      label: "+1 здание (Pro)",
      description: "Дополнительное здание сверх лимита тарифа Pro",
    },
    BUILDING_BUSINESS: {
      label: "+1 здание (Business)",
      description: "Дополнительное здание сверх лимита тарифа Business",
    },
    TENANTS_25: {
      label: "+25 арендаторов",
      description: "Увеличивает лимит арендаторов на 25",
    },
    STORAGE_25GB: {
      label: "+25 ГБ хранилища",
      description: "Увеличивает квоту хранилища на 25 ГБ",
    },
    USER: {
      label: "+1 пользователь",
      description: "Дополнительный пользователь панели",
    },
    WHITELABEL_CABINET: {
      label: "Брендированный кабинет арендатора",
      description: "Логотип и фирменные цвета в кабинете арендатора (Business и выше).",
    },
  },

  // Разовые услуги (lib/services-catalog.ts). Ключ — код услуги в базе.
  services: {
    ONBOARDING_PRO: {
      label: "Запуск под ключ (Pro)",
      description: "Заводим арендаторов, договоры и помещения за вас. Один созвон и один рабочий день.",
    },
    ONBOARDING_ENTERPRISE: {
      label: "Запуск под ключ (Enterprise)",
      description: "Полный перенос нескольких объектов, обучение команды, настройка под вас.",
    },
    LEGAL_PACK_KZ: {
      label: "Юридический пакет «Договоры РК»",
      description: "15-20 готовых шаблонов: аренда, доп. соглашения, претензии, расторжение — по праву РК.",
    },
    ONE_C_INTEGRATION: {
      label: "Интеграция с 1С/BAS",
      description: "Двусторонний обмен начислениями и платежами с вашей конфигурацией 1С.",
    },
    EXCEL_MIGRATION_STARTER: {
      label: "Платный перенос из Excel (Starter)",
      description: "Перенесём ваш Excel за один день. Для Pro и выше это входит в тариф.",
    },
    ADMIN_TRAINING: {
      label: "Обучение администратора",
      description: "3 занятия по 60 минут: документы, финансы, кабинет арендатора.",
    },
  },

  // Вкладки хабов (lib/hub-tabs.ts). Подписи в одну строку и без переносов —
  // вкладки стоят в ряд, длинная подпись ломает ряд.
  tabs: {
    team: {
      staff: "Сотрудники",
      users: "Доступы и здания",
      roles: "Роли и права",
    },
    health: {
      onboarding: "Здоровье платформы",
      dataQuality: "Качество данных",
      systemHealth: "Проверка системы",
    },
    documents: {
      all: "Все документы",
      contracts: "Договоры",
    },
    importData: {
      tenants: "Арендаторы",
      contracts: "Договоры",
      charges: "Начисления",
      payments: "Платежи из банка",
    },
    history: {
      actions: "Действия",
      emails: "Письма",
    },
    service: {
      requests: "Заявки",
      complaints: "Жалобы и предложения",
    },
    finance: {
      month: "Месяц",
      deposits: "Депозиты",
      installments: "Рассрочки",
      recurring: "Постоянные расходы",
      balance: "Счета и касса",
    },
  },

  // Журнал действий (lib/audit-humanize.ts): одна запись — одна фраза.
  // Порядок слов у языков разный, поэтому шаблон фразы целиком лежит в
  // словаре, а не собирается в коде.
  audit: {
    system: "Система",
    login: "{who} вошёл в систему",
    logout: "{who} вышел из системы",
    security: "Событие безопасности: {who}",
    error: "Ошибка в работе системы",
    sentence: "{who} {verb} {what}",
    sentenceNamed: "{who} {verb} {what} «{name}»",
    verbs: {
      CREATE: "создал",
      UPDATE: "изменил",
      DELETE: "удалил",
    },
    // Винительный падеж — чтобы русская фраза читалась целиком.
    entities: {
      tenant: "арендатора",
      building: "здание",
      floor: "этаж",
      space: "помещение",
      charge: "начисление",
      payment: "платёж",
      expense: "расход",
      user: "пользователя",
      contract: "договор",
      document: "документ",
      lead: "лида",
      tariff: "тариф",
      meter: "счётчик",
      request: "заявку",
      task: "задачу",
      apiKey: "API-ключ",
      system: "систему",
    },
    documentTypes: {
      CONTRACT: "договор",
      ACT: "АВР",
      INVOICE: "счёт",
      RECONCILIATION: "акт сверки",
    },
    documentFallback: "документ",
    documentNumbered: "{label} № {number}",
    documentOfTenant: "{document} — {tenant}",
    numbered: "№ {number}",
    permissions: {
      sectionFallback: "раздел",
      section: "{who} настроил доступ к разделу «{section}»: {view}, {edit}",
      sees: "видит",
      notSees: "не видит",
      edits: "может менять",
      notEdits: "менять не может",
      rightFallback: "право",
      capabilityOn: "{who} включил право «{label}» для должности",
      capabilityOff: "{who} выключил право «{label}» для должности",
      targetFallback: "сотруднику",
      overrideAllow: "{who} разрешил лично «{label}» — {target}",
      overrideDeny: "{who} запретил лично «{label}» — {target}",
      overrideInherit: "{who} вернул по должности «{label}» — {target}",
      roleFallback: "должность",
      roleCreated: "{who} создал должность «{label}»",
      roleCopied: "{who} создал должность «{label}» (копия «{source}»)",
    },
    when: {
      today: "сегодня в {time}",
      yesterday: "вчера в {time}",
      onDate: "{date} в {time}",
    },
    trace: {
      ip: "IP {ip}",
      code: "код {code}",
    },
    // Должность в серой строке журнала — со строчной буквы, она идёт в ряду
    // «бухгалтер · IP 1.2.3.4 · код …».
    roles: {
      OWNER: "владелец",
      ADMIN: "администратор",
      MANAGER: "менеджер",
      ACCOUNTANT: "бухгалтер",
      TENANT: "арендатор",
      PLATFORM_OWNER: "платформа",
    },
  },
}
