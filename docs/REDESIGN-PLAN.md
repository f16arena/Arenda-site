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

## Этап 0. Фундамент — дизайн-система ✅ (22.07, коммит 7f89868)

- [x] shadcn/ui init (radix, Tailwind v4), токены slate+синий primary, светлая+тёмная
- [x] Примитивы: Button (CVA на токенах, старый API сохранён), Input, Textarea, Select, Card,
      Badge, Dialog, AlertDialog, Sheet, Table, Tabs, DropdownMenu, Tooltip, Checkbox, Switch,
      Separator, Popover, Label
- [x] Удалён «linear-style» POC (globals.css + карточка арендатора)
- [ ] Свести акценты по всему коду: убрать stray indigo (этап 2 попутно)
- [x] Прод-сборка зелёная, задеплоено на commrent.kz

## Этап 1. Структура: одна логика — одно место ✅ (22.07, коммиты f0e8ff7…db60dac)

Механизм: RouteTabs (ui/route-tabs) + наборы в lib/hub-tabs — страницы остаются
роутами со своими правами, но выглядят одним разделом со вкладками.

| Дубль | Действие | Статус |
|---|---|---|
| /admin/ops дублирует /admin | удалён, redirect на /admin | ✅ |
| staff ↔ users ↔ roles | хаб «Команда и доступы», 1 пункт меню | ✅ |
| dashboard/owner + reports + analytics | хаб «Аналитика и отчёты», 1 пункт | ✅ |
| documents ↔ contracts | хаб «Документы и договоры» (вкладки) | ✅ (глубокое слияние списков — этап 3) |
| onboarding ↔ data-quality ↔ system-health | хаб «Здоровье платформы» | ✅ |
| import (хаб+3) ↔ finances/import | вкладки на всех 5 страницах | ✅ |
| documents/templates vs settings/document-templates | развести нейминг | ⬜ (этап 3, вместе с редизайном документов) |
| Сироты contracts/import/api-keys/data-quality/system-health | в меню/вкладках | ✅ |

- [x] Меню админки: 7 групп / 20 видимых пунктов (было 9/30)
- [x] Суперадмин-меню: блоки Клиенты / Биллинг / Платформа
- [x] Старые URL работают (роуты сохранены, ops — redirect)

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
