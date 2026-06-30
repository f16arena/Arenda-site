# Доступы, capability и тарифы — текущее состояние (baseline)

> Снимок «как сейчас в коде» на 2026-06-30. Нужен как точка отсчёта перед ТЗ по
> странице доступа (`/admin/roles`). Источники: `lib/acl.ts`, `lib/capabilities.ts`,
> `lib/role-capabilities.ts`, `lib/plan-capabilities.ts`.

## 1. Как устроен доступ — 3 уровня

1. **Разделы (страницы)** — роль может *видеть* (`canView`) и/или *редактировать*
   (`canEdit`) раздел. Хранится в таблице `RolePermission`. **OWNER = всегда всё.**
2. **Действия (capability)** — конкретные кнопки/операции внутри разделов
   (напр. «Импорт банка» = `finance.importBank`). Проверяются в server-actions через
   `requireCapability(...)` и скрываются в UI, если права нет.
3. **Фичи тарифа (plan features)** — флаги плана организации (`Plan.features` JSON).
   Если у capability есть `requiredFeature`, и эта фича **выключена в тарифе**, то
   действие **заблокировано (locked) даже у владельца**.

**Итог для владельца:** OWNER имеет ВСЕ действия, КРОМЕ тех, чья `requiredFeature`
выключена в его тарифе. То есть доступ владельца = (все capability) − (заблокированные тарифом).

Где задаются тарифы: суперадмин → **Планы** (`/superadmin/plans`). Сами наборы
фич per-тариф лежат в БД, а не в коде (редактируются без передеплоя).

---

## 2. Разделы (страницы) — 18

`canView` по умолчанию (если в БД не настроено). OWNER — всё. TENANT — только `profile`.
Колонка «фича тарифа» = раздел целиком гейтится этой фичей (`SECTION_REQUIRED_FEATURE`).

| Раздел | Название | Фича тарифа | ADMIN | ACCOUNTANT | FACILITY_MANAGER |
|---|---|---|---|---|---|
| dashboard | Дашборд | — | 👁 | 👁 | 👁 |
| buildings | Здания | — | ✏️ | 👁 | 👁 |
| spaces | Помещения | — | ✏️ | 👁 | 👁 |
| tenants | Арендаторы | — | ✏️ | 👁 | — |
| finances | Финансы | `invoices` | ✏️ | ✏️ | — |
| meters | Счётчики | `meters` | ✏️ | 👁 | ✏️ |
| contracts | Договоры | `contractTemplates` | ✏️ | 👁 | — |
| documents | Документы | `documentTemplates` | ✏️ | ✏️ | — |
| requests | Заявки | `requests` | ✏️ | — | ✏️ |
| tasks | Задачи | `tasks` | ✏️ | — | ✏️ |
| staff | Сотрудники | — | ✏️ | 👁 | — |
| complaints | Жалобы | — | ✏️ | — | ✏️ |
| messages | Сообщения | — | ✏️ | ✏️ | ✏️ |
| analytics | Аналитика | `ownerReports` | ✏️ | 👁 | — |
| settings | Настройки | — | ✏️ | — | — |
| roles | Роли и доступ | `roleBuilder` | ✏️ | — | — |
| users | Все пользователи | — | (супер-админ) | — | — |
| profile | Мой профиль | — | ✏️ | ✏️ | ✏️ |

(👁 = просмотр, ✏️ = редактирование, — = нет доступа по умолчанию)

---

## 3. Действия (capability) — каталог всех кнопок

Каждая строка = отдельная кнопка/операция. **Уровень**: view/edit/sensitive.
**Риск**: normal/business/sensitive. **Фича** = что должно быть включено в тарифе,
иначе действие заблокировано (в т.ч. у владельца).

### Пользователи и доступ
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| users.invite | Приглашать пользователей | Создание нового пользователя | users | edit | normal | roleBuilder |
| users.edit | Редактировать пользователей | Контакты, роль, привязка к зданиям | users | edit | normal | roleBuilder |
| users.resetPassword | Сбрасывать пароль | Выдача нового пароля сотруднику | users | sensitive | sensitive | roleBuilder |
| users.deactivate | Отключать пользователей | Блок/повторная активация | users | sensitive | sensitive | roleBuilder |
| users.delete | Удалять пользователей | Удаление профиля | users | sensitive | sensitive | roleBuilder |
| roles.create | Создавать должности | Новая должность владельцем | roles | sensitive | business | roleBuilder |
| roles.editSections | Менять доступ к разделам | Страницы + права редактирования | roles | sensitive | business | roleBuilder |
| roles.editActions | Менять точные действия | Отдельные кнопки/действия | roles | sensitive | business | roleBuilder |
| roles.delete | Удалять должности | Если никому не назначена | roles | sensitive | business | roleBuilder |

### Здания и помещения
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| buildings.create | Создавать здания | Новый объект | buildings | sensitive | business | multiBuilding |
| buildings.edit | Редактировать здания | Адрес, контакты, префиксы | buildings | edit | normal | — |
| buildings.toggle | Вкл/выкл здания | Деактивация без удаления | buildings | sensitive | business | multiBuilding |
| buildings.delete | Удалять здания | Пустое здание | buildings | sensitive | sensitive | multiBuilding |
| floors.create | Создавать этажи | Этаж + базовая ставка | buildings | edit | normal | — |
| floors.delete | Удалять этажи | С защитой от занятых | buildings | sensitive | sensitive | — |
| spaces.edit | Редактировать помещения | Номер, площадь, статус | spaces | edit | normal | — |
| spaces.assignTenant | Назначать арендатора | Связь помещение↔арендатор | spaces | sensitive | business | — |
| spaces.delete | Удалять помещения | Свободные помещения | spaces | sensitive | sensitive | — |
| leads.manage | Вести лиды | Заявки потенциальных арендаторов | tenants | edit | normal | leadsPipeline |
| leads.bookSpace | Бронировать по лиду | Временное удержание помещения | spaces | edit | normal | leadsPipeline |

### Арендаторы
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| tenants.create | Создавать арендаторов | Новый арендатор | tenants | edit | normal | — |
| tenants.editContacts | Менять контакты | ФИО, телефон, email, доступ | tenants | edit | normal | — |
| tenants.editCompany | Менять данные компании | Форма, ИИН/БИН, реквизиты | tenants | edit | normal | — |
| tenants.editRentalTerms | Менять условия аренды | Ставка, НДС, день оплаты, пеня | tenants | sensitive | business | — |
| tenants.assignSpaces | Привязывать помещения/этажи | Несколько помещений, этаж целиком | tenants | sensitive | business | — |
| tenants.blacklist | В чёрный список | Пометка проблемного | tenants | sensitive | business | — |
| tenants.delete | Удалять арендаторов | Проверка долгов/документов | tenants | sensitive | sensitive | — |

### Финансы
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| finance.createInvoice | Создавать счета/начисления | Ручные + ежемесячные | finances | edit | normal | invoices |
| finance.recordPayment | Вносить оплату | Ручное внесение, закрытие | finances | sensitive | business | invoices |
| finance.confirmPayment | Подтверждать чеки | Провести заявленную оплату | finances | sensitive | business | paymentReports |
| finance.disputePayment | Отправлять в спор | Пометка спорной | finances | sensitive | business | paymentReports |
| finance.rejectPayment | Отклонять оплату | Отклонение чека | finances | sensitive | business | paymentReports |
| finance.cashPayment | Подтверждать наличные | Наличная оплата | finances | sensitive | business | cashPayments |
| finance.manageCashAccounts | Управлять кассой/счетами | Банк, касса, переводы | finances | sensitive | business | cashAccounting |
| finance.manageExpenses | Вносить расходы | Расходы здания, списание | finances | edit | business | cashAccounting |
| finance.importBank | **Импорт банка** | Загрузка выписки + матчинг | finances | edit | normal | bankImport |
| finance.manageTariffs | Менять коммунальные тарифы | Свет, вода, уборка | finances | edit | normal | meters |
| finance.deleteRecords | Удалять фин. записи | Начисления, оплаты, расходы | finances | sensitive | sensitive | — |
| finance.export | Выгружать финансы | Excel/PDF, отчёты владельца | analytics | view | normal | ownerReports |

### Документы
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| documents.create | Создавать документы | Договоры, счета, АВР, сверка | documents | edit | normal | documentTemplates |
| documents.deleteUnsigned | Удалять неподписанные | Черновик/без подписи | documents | edit | normal | — |
| documents.deleteSigned | Удалять подписанные | Только владелец | documents | sensitive | sensitive | — |
| documents.uploadTemplate | Загружать шаблоны | DOCX/XLSX/PDF организации | documents | sensitive | business | documentTemplates |
| documents.generateBulk | Массово формировать | Пакетное создание | documents | edit | normal | bulkDocuments |
| documents.sign | Подписывать (NCALayer) | Запуск/контроль подписей | contracts | sensitive | business | ncalayerSigning |
| documents.addendum | Создавать доп. соглашения | Изменение только документом | contracts | sensitive | business | addendums |
| storage.upload | Загружать файлы | Файлы орг/арендаторов/чеки | documents | edit | normal | storage |
| storage.delete | Удалять файлы | С проверкой связей | documents | sensitive | sensitive | storage |

### Операционная работа
| key | Кнопка/действие | Что делает | Раздел | Уровень | Риск | Фича |
|---|---|---|---|---|---|---|
| requests.manage | Обрабатывать заявки | Статусы, комментарии | requests | edit | normal | requests |
| tasks.manage | Управлять задачами | Создание/назначение/закрытие | tasks | edit | normal | tasks |
| meters.manage | Управлять счётчиками | Показания, тарифы, удаление | meters | edit | normal | meters |
| messages.send | Писать сообщения | Коммуникация с арендаторами | messages | edit | normal | — |
| complaints.manage | Разбирать жалобы | Статусы и ответы | complaints | edit | normal | — |
| staff.manageSalary | Начислять зарплаты | Начисление/выплаты | staff | sensitive | sensitive | — |
| faq.manage | Редактировать FAQ | База инструкций | settings | edit | normal | — |
| settings.updateOrganization | Менять настройки орг. | Название, НДС, реквизиты | settings | sensitive | business | — |
| settings.updateBankDetails | Менять банк. реквизиты | Счета, БИК, ИИК | settings | sensitive | business | — |
| systemHealth.view | Видеть проверку системы | Health, ошибки, качество | analytics | view | normal | supportMode |

---

## 4. Фичи тарифа (plan features) — каталог

Флаги `Plan.features`. «🕐» = запланировано (ещё не работает).

### Ядро платформы (core)
| key | Название | Что включает | Реком. |
|---|---|---|---|
| multiBuilding | Несколько зданий | Несколько объектов + общая картина | ✅ |
| tenantCabinet | Кабинет арендатора | Долг, документы, заявки, оплата | ✅ |
| cmdkSearch | Глобальный поиск Ctrl+K | Поиск по всему | |
| addressAutocomplete | Подсказки адресов РК | Автоподбор адреса | |
| roleBuilder | Конструктор должностей | Настройка должностей/прав (бизнес) | |

### Объекты и помещения (objects)
| key | Название | Что включает | Реком. |
|---|---|---|---|
| floorEditor | Графический редактор плана | Помещения на плане этажа | ✅ |
| publicBooking | Публичная витрина | Страница заявок | |
| leadsPipeline | Лиды и бронирование | Воронка + бронь + перевод в арендатора | |
| dataQuality | Центр качества данных | Поиск проблем в данных | ✅ |

### Документы и подписи (documents)
| key | Название | Что включает | Реком. |
|---|---|---|---|
| contractTemplates | Шаблоны договоров | DOCX/XLSX/PDF с подстановкой | ✅ |
| documentTemplates | Свои шаблоны документов | Шаблоны счетов/АВР/сверки | ✅ |
| addendums | Доп. соглашения | Черновик→подпись→применение | |
| ncalayerSigning | Подписание NCALayer | ЭЦП арендатором/арендодателем | |
| storage | DB-хранилище файлов | Договоры, чеки, вложения | ✅ |
| bulkDocuments | Массовые документы | Пакетное создание/скачивание | |

### Финансы (finance)
| key | Название | Что включает | Реком. |
|---|---|---|---|
| invoices | Счета и начисления | Счета, начисления, закрытие | ✅ |
| paymentReports | Чеки арендатора | Чек→подтверждение/отклонение | ✅ |
| cashPayments | Наличная оплата | Приём наличных с подтверждением | |
| cashAccounting | Касса и счета | Учёт денег, транзакции (бизнес) | |
| bankImport | Импорт выписки | Загрузка выписок для сверки | |
| excelExport | Excel-экспорт | Выгрузка таблиц | |
| ownerReports | Отчёты владельца | P&L, долги, доходность | ✅ |
| export1c | Экспорт 1С | Данные для бухучёта | |

### Операционная работа (operations)
| key | Название | Что включает | Реком. |
|---|---|---|---|
| requests | Заявки арендаторов | Обращения + статусы + файлы | ✅ |
| tasks | Задачи команды | Назначение задач | |
| meters | Счётчики и коммуналка | Показания, тарифы, начисления | |
| autoReminders | Автонапоминания | Долги, сроки, договоры | ✅ |
| emailNotifications | Email-уведомления | Письма | |
| telegramBot | Telegram-бот | Оповещения/действия | |

### Расширения и поддержка (platform)
| key | Название | Что включает | Статус |
|---|---|---|---|
| api | Public API | Интеграции (бизнес) | |
| customDomain | Свой домен | Клиентский домен | |
| whiteLabel | White label | Брендинг клиента | 🕐 Q4 2026 |
| whatsappBusiness | WhatsApp Business | Уведомления WhatsApp | 🕐 Q3 2026 |
| onPremise | On-premise | Установка у клиента | 🕐 Q4 2026 |
| webVitals | Core Web Vitals | Метрики скорости | |
| supportMode | Support Mode | Расширенная диагностика (sensitive) | |
| aiAssistant | AI-ассистент | AI для документов/анализа | |
| prioritySupport | Приоритетная поддержка | Быстрые ответы | |

### Аналитика (analytics)
| key | Название | Что включает |
|---|---|---|
| analyticsBasic | Базовая аналитика | Дашборд, cashflow 6 мес, топ должников |
| analyticsAdvanced | Расширенная аналитика | P&L по объектам, cohort, heatmap, cashflow 12 мес |
| analyticsCustomReports | Кастомные отчёты | Шаблоны, Power BI/Tableau, авто-отчёты |

---

## 5. Лимиты тарифа (числовые)

| key | Лимит | Ед. | Что значит |
|---|---|---|---|
| storageGb | Хранилище | ГБ | Объём файлов организации |
| documentsPerMonth | Документы в месяц | шт | Сколько документов в месяц |
| apiRequestsPerMonth | API-запросы в месяц | запр | Лимит обращений к API |
| supportSlaHours | SLA поддержки | час | Время первой реакции |

---

## 6. Доступ владельца по тарифу — как читать таблицы

- В разделе 3 у каждой кнопки есть колонка **Фича**. Владелец видит/может нажать
  кнопку **только если эта фича включена в его тарифе** (или фичи нет = всегда).
- Пример: «Импорт банка» (`finance.importBank`) требует фичу `bankImport`. Если в
  тарифе владельца `bankImport=false` — кнопка заблокирована (locked), хотя он OWNER.
- Действия БЕЗ фичи (колонка «—») доступны владельцу всегда.

**Что нужно для документа «доступ владельца в КОНКРЕТНОМ тарифе»:** взять набор фич
этого тарифа (суперадмин → Планы) и вычеркнуть из раздела 3 все строки, чья фича
выключена. Остаток = что владелец реально может в этом тарифе.

> ⚠️ Точные наборы фич per-тариф (Free/Pro/Business/…) хранятся в БД и здесь НЕ
> зафиксированы — пришли список тарифов с флагами (или дай доступ к `/superadmin/plans`),
> и я достроlю матрицу «тариф × доступ владельца».
