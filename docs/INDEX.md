# Commrent.kz — индекс документации

> Точка входа в Obsidian-vault проекта. Открой эту папку (корень репозитория) как vault в Obsidian → «Open folder as vault».

## 📋 Документация проекта

### Обязательное чтение
- [[../README]] — обзор проекта, стек, установка
- [[../CHANGELOG]] — история версий (1.3.x)
- [[../CLAUDE]] — инструкции для Claude Code (ссылается на AGENTS.md)
- [[../AGENTS]] — конвенции работы с агентами

### Гайды
- [[DEPLOYMENT]] — деплой на Vercel + конфиг env
- [[SECURITY]] — security policy и обработка инцидентов
- [[AUDIT_2026-05-26]] — комплексный аудит платформы с ответами владельца на 24 вопроса

## 🗄️ База данных и миграции

Schema живёт в `../prisma/schema.prisma`. Ручные SQL миграции (применяются в Supabase SQL Editor):
- `../prisma/manual-migrations/2026-05-26_contract_template_fixes.sql` — Organization.defaultPenaltyPercent, Building.documentAddress, Tenant.basisDocument
- `../prisma/manual-migrations/2026-05-27_rental_terms_extras.sql` — rentFreeMonths, depositAmount
- `../prisma/manual-migrations/2026-05-27_move_in_date.sql` — Tenant.moveInDate
- `../prisma/manual-migrations/2026-05-27_utilities_in_service_fee.sql` — Building.utilitiesInServiceFee

## 🏗️ Архитектура (краткая)

- **Frontend**: Next.js 16 App Router + React 19 + TypeScript + Tailwind
- **Backend**: Next.js API routes + server actions
- **ORM**: Prisma 7 с pg adapter
- **DB**: Supabase Postgres (Frankfurt EU)
- **Auth**: NextAuth v5 (JWT + Credentials + TOTP 2FA)
- **Хостинг**: Vercel (планируется переход на VPS — см. memory)
- **Multi-tenant**: wildcard subdomain `{slug}.commrent.kz` → middleware `proxy.ts` ставит `x-org-slug` header

## 🎨 UI

- **Дизайн-стиль (POC)**: Linear-style обёртка `.linear-style` в `../app/globals.css` применена к карточке арендатора
- **Skills для UI**: `frontend-design` (8 эстетических якорей) в `~/.claude/skills/`

## 📦 Что лежит вне vault'a

Эти папки имеет смысл **исключить** в `Settings → Files & Links → Excluded files`:

```
node_modules
.next
.git
.claude
out
build
coverage
playwright-report
test-results
app/generated
```

## 🔗 Полезные ссылки

- **Прод**: https://commrent.kz
- **Supabase**: app.supabase.com
- **GitHub**: https://github.com/f16arena/Arenda-site
- **Vercel**: dashboard.vercel.com

## 📝 Конвенции заметок

При создании новых заметок в этом vault:

- Названия — `kebab-case-with-date-YYYY-MM-DD.md` для отчётов/аудитов
- Ссылки между файлами через `[[название]]` (Obsidian-style)
- Если заметка касается конкретного коммита — указывай SHA-7 в начале: `**Commit `5b2514d`**`
- Чувствительные данные (пароли, токены) **не пишем** — они уходят в коммиты через git

---

*Создано 2026-05-27. Обновляй при добавлении новой документации.*
