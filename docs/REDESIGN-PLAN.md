# Полный рефакторинг и редизайн commrent — мастер-план

> Статус-документ программы. Обновляется по мере выполнения. Начат 22.07.2026.
> Решения владельца: база UI — shadcn/ui; охват — весь продукт (111 страниц), равномерно;
> главная боль — дублирование одной логики на нескольких страницах («теряемся»).

## Цель

Продукт, который выглядит и ощущается как продаваемый SaaS: одна задача — одно место,
единый визуальный язык, ни одного самодельного разнобойного элемента.

## Незыблемое (не трогаем логику)

БД/миграции, биллинг и начисления, ЭЦП/подписание (contract.content — подпись привязана
к тексту!), ЭСФ, конструкторы документов (движки lib/*-engine), cron. Меняем только UI-слой,
маршруты (с редиректами) и композицию страниц.

## Этап 0. Фундамент — дизайн-система ✅/⬜

- [ ] shadcn/ui init (Tailwind v4, @theme в globals.css), токены: primary, радиусы, светлая+тёмная
- [ ] Примитивы: Button (замена своего), Input, Textarea, Select, Card, Badge, Dialog, Table,
      Tabs, DropdownMenu, Tooltip, Checkbox, Switch, Label
- [ ] Удалить «linear-style» POC из globals.css (перекрашивает часть страниц)
- [ ] Свести акценты: один primary; emerald — только деньги/успех; убрать 6 stray indigo
- [ ] Витрина: 2–3 страницы переведены как образец, утверждение стиля владельцем

## Этап 1. Структура: одна логика — одно место ⬜

| Дубль | Действие | Статус |
|---|---|---|
| /admin/ops дублирует /admin | удалить, redirect на /admin | ⬜ |
| staff ↔ users ↔ roles | одна «Команда»: вкладки Люди / Доступы / Роли | ⬜ |
| dashboard/owner + reports + analytics | «Аналитика и отчёты» с вкладками (+фин.дашборд) | ⬜ |
| documents ↔ contracts | один раздел «Документы»: вкладки Договоры/Счета/АВР/Прочее | ⬜ |
| onboarding ↔ data-quality ↔ system-health | одна «Здоровье платформы» с вкладками | ⬜ |
| import (хаб+3) ↔ finances/import | один хаб «Импорт» | ⬜ |
| documents/templates (конструкторы) vs settings/document-templates (шаблоны) | развести нейминг, вход «Создать документ» | ⬜ |
| Сироты: api-keys (0 ссылок!), contracts, import, builder, data-quality, system-health | в меню или удалить | ⬜ |

- [ ] Новое меню админки: 7 групп / ~22 пункта (целевое дерево — в аудите навигации)
- [ ] Суперадмин-меню: 3 группы вместо плоских 14 пунктов
- [ ] Все старые URL — redirect'ы (закладки пользователей живут)

## Этап 2. Машинная зачистка копипаста (весь код) ⬜

Замена ad-hoc вёрстки на примитивы этапа 0, зона за зоной. Исходные цифры аудита:

- 610 самодельных `<button>` (176 файлов) → Button
- 525 самодельных `<input>` (111 файлов; 53 повтора одного className) → Input
- 62 самодельных `<table>` (48 файлов) → Table/DataTable
- 48 самодельных модалок `fixed inset-0` (39 файлов) → Dialog
- 114 карточек-контейнеров (65 файлов) → Card
- 184 pill/badge (92 файла) → Badge

Порядок зон: admin core (Обзор, Финансы, Арендаторы, Документы) → admin остальное →
cabinet → superadmin → публичные/auth. После каждой зоны: tsc + perf-gate + смоук руками.

## Этап 3. Редизайн экранов ⬜

На новой базе: плотность и иерархия, пустые состояния, единые списки/фильтры, мобильная
вёрстка. Все 111 страниц, равномерно по зонам (решение владельца), чек-лист — приложение А.

## Приложение А. Чек-лист страниц (111)

Отмечаем: С — структура (этап 1), К — компоненты (этап 2), Р — редизайн (этап 3).

### /admin (65)
page, calendar, onboarding, data-quality, system-health, ops(удалить), dashboard/owner,
analytics, reports, buildings, buildings/[id]/3d, buildings/[id]/service-fee, spaces,
floors/[id], floors/[id]/visualization, builder, builder/projects, meters, tenants,
tenants/new, tenants/[id], contracts, contracts/[id], finances, finances/balance,
finances/deposits, finances/installments, finances/recurring, finances/import,
finances/receipt/[paymentId], service-fee, documents, documents/new/{act,invoice,contract,
reconciliation}, documents/templates/{act,invoice,reconciliation,rental},
settings/document-templates, storage, import, import/{tenants,contracts,charges}, requests,
requests/[id], tasks, messages, complaints, emergency, staff, staff/[id], users, roles,
leads, listings, settings, subscription, profile, faq, audit, email-logs, api-keys

### /superadmin (16)
page, orgs, orgs/new, orgs/[id], plans, subscriptions, addons, services, founders, users,
errors, performance, system-health, audit, site-images, profile

### /cabinet (11)
page, finances, documents, documents/print/{invoice,reconciliation,requisites}, requests,
meters, messages, faq, profile

### Публичные/auth (19)
лендинг, blog, blog/[slug], demo, offer, privacy, terms, sla, booking/[orgSlug],
showcase/[token], sign/[token], verify/[id], verify-email, login, signup, forgot-password,
reset-password, change-password, delete-account

## Ход работ

- 22.07.2026 — аудит завершён (страницы/дубли, UI-консистентность, навигация), план утверждён,
  старт этапа 0.
