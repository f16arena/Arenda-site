# Mobile app plan for Commrent.kz

Цель: сделать быстрое мобильное приложение для Android, iPhone и iPad без нативной macOS-версии. На Mac пользователь работает через браузерную версию сайта.

## Платформы

- MVP: iOS, iPadOS, Android.
- Стек: Expo / React Native, Expo Router, EAS Build.
- Mac: только браузер/PWA. Отдельное macOS-приложение не входит в MVP.

## Разделение нагрузки

Мобильное приложение показывает только то, что нужно в ежедневной работе:

- сегодня: KPI, долги, заявки, срочные события;
- здания и краткие показатели;
- заявки, задачи, сообщения;
- оплаты и подтверждение чеков;
- показания счетчиков;
- документы к просмотру и подписи;
- push-уведомления;
- профиль и настройки уведомлений.

Только сайт:

- superadmin, организации, тарифы, роли, API-ключи;
- массовые импорты Excel/банк/1C;
- шаблоны DOCX/XLSX;
- графический редактор этажей;
- глубокая аналитика, audit, system health, data quality;
- публичная главная, SEO, блог, оферта, политики.

## Роли и меню

Арендатор:

- Главная
- Оплата
- Заявки
- Документы
- Еще

Владелец / администратор / бухгалтер:

- Сегодня
- Объекты
- Финансы
- Заявки
- Еще

На iPad: двухколоночный интерфейс. На iPhone/Android: нижние вкладки и stack-навигация.

## Push-уведомления

Сценарии:

- отключение света;
- отключение горячей/холодной воды;
- ремонтные работы;
- безопасность;
- новая заявка;
- изменение статуса заявки;
- документ на подпись;
- оплата подтверждена/отклонена;
- срок договора истекает;
- долг/напоминание об оплате.

Backend-основа:

- `push_devices` хранит Expo push tokens по пользователю и организации;
- `building_notices` хранит объявления по зданию;
- `/api/mobile/push-devices` регистрирует/отвязывает устройство;
- `/api/mobile/building-notices` создает и возвращает объявления по доступным зданиям;
- `notifyUser()` теперь умеет отправлять push вместе с in-app/email/Telegram/SMS.

## Документы и подпись

MVP просмотра:

- договор;
- доп. соглашение;
- акт выполненных работ;
- счет на оплату;
- акт сверки;
- акт приема-передачи.

Подписание:

- текущий web-flow `/sign/[token]` остается рабочим для договоров;
- для мобильного приложения добавлен draft-контур `document_signature_requests`;
- `NCA_LAYER` предусмотрен как метод ЭЦП;
- `SMS_OTP_DRAFT` зарезервирован как будущий способ подписи через SMS;
- юридическую валидацию SMS-подписи надо включать отдельным этапом после выбора SMS-провайдера и текста согласия.

Mobile API:

- `GET /api/mobile/document-signature-requests`
- `POST /api/mobile/document-signature-requests`
- `GET /api/mobile/document-signature-requests/:id`
- `PATCH /api/mobile/document-signature-requests/:id`
- `POST /api/mobile/document-signature-requests/:id/sign`

## MVP-этапы

1. Backend mobile foundation: auth/session, bootstrap, push devices, building notices, document signature draft.
2. Expo app shell: tabs, auth, secure token/session handling, role-aware menu.
3. Tenant MVP: оплата, заявки, документы, счетчики, сообщения.
4. Admin MVP: сегодня, заявки, задачи, арендаторы, подтверждение оплат, объявления по зданию.
5. Owner MVP: KPI, здания, долги, истекающие договоры, push-сводки.
6. Document viewer: DOCX/PDF preview, download, sign request screen.
7. Push polish: categories, deep links, quiet hours, notification preferences.
8. Beta: TestFlight, Google Play internal testing, crash/error monitoring.

## Что уже подготовлено в backend

- Prisma models: `PushDevice`, `MobileSession`, `BuildingNotice`, `DocumentSignatureRequest`.
- SQL migration: `migrations/013_mobile_foundation.sql`.
- Mobile bootstrap: `/api/mobile/bootstrap`.
- Push registration: `/api/mobile/push-devices`.
- Building notices: `/api/mobile/building-notices`.
- Document signature draft API: `/api/mobile/document-signature-requests`.
- Tenant MVP API:
  - `GET /api/mobile/tenant/overview`
  - `GET/POST /api/mobile/tenant/finances`
  - `GET/POST /api/mobile/tenant/requests`
  - `GET/POST /api/mobile/tenant/meters`
  - `GET /api/mobile/tenant/documents`
  - `GET /api/mobile/tenant/documents/generated/:id`
  - `GET /api/mobile/tenant/documents/storage/:id`
  - `GET/POST /api/mobile/tenant/messages`
- Mobile token auth:
  - `POST /api/mobile/auth/login`
  - `POST /api/mobile/auth/refresh`
  - `POST /api/mobile/auth/logout`
  - `GET /api/mobile/auth/me`
- Mobile API now accepts `Authorization: Bearer <accessToken>` and still falls back to the web session for browser testing.

## Что уже подготовлено в mobile

- Expo app shell: `mobile/`.
- SDK: Expo 54.
- Router: Expo Router.
- Push dependencies: `expo-notifications`, `expo-device`.
- Secure storage dependency: `expo-secure-store`.
- Fast login dependency: `expo-local-authentication`.
- API client: `mobile/lib/api.ts`.
- SecureStore token storage and refresh flow.
- Fast login: after the first password login the app can unlock the saved session through Face ID, fingerprint, or the device passcode. The app does not store the user's password.
- Offline cache: the last successful mobile dashboard payload is stored on-device and shown when the API is unavailable after device unlock.
- First screen: login, role-aware dashboard, bottom navigation, push registration button, buildings, announcements and document counters.
- Admin/owner/facility-manager notice composer for building events.
- Notifications screen: in-app notification history, unread counter, mark-all-read action, and building notice history.
- Push settings: active devices, enable/disable push for the current device, local quiet hours, and event-type muting.
- Tenant sections on the main mobile screen:
  - debt/rent/placement summary;
  - requisites and "I paid" payment report draft;
  - request creation;
  - meter readings;
  - recent documents and signature links;
  - recent tenant requests.
- Beta role shell:
  - tenant tabs: home, payments, requests, documents, more;
  - owner tabs: KPI, today, requests, payments, more;
  - admin/staff tabs: today, requests, payments, buildings, more.
- Tenant file upload:
  - payment receipt upload through `POST /api/mobile/tenant/finances`;
  - request attachment upload through `POST /api/mobile/tenant/requests`.
- Tenant document screen:
  - pending signature requests;
  - web signing links for contracts;
  - SMS/EDS draft actions for the future legal signing flow;
  - generated invoices/acts and tenant document archive.
- Admin mobile API:
  - `GET /api/mobile/admin/today`
  - `GET/PATCH /api/mobile/admin/requests`
  - `GET/PATCH /api/mobile/admin/payment-reports`
  - `GET /api/mobile/admin/buildings`
- Owner mobile API:
  - `GET /api/mobile/owner/overview`

For local API testing:

```bash
cd mobile
$env:EXPO_PUBLIC_API_BASE_URL="http://localhost:3000"
npm start
```
