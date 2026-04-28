# Migrations — ArendaPro / Supabase

## Порядок выполнения

Зайти в **Supabase → SQL Editor** и запустить файлы по порядку:

| Файл | Что делает |
|------|-----------|
| `001_create_schema.sql` | Создаёт все 20 таблиц, индексы и триггеры |
| `002_seed_building.sql` | Вставляет начальные данные (здание, этажи, admin) |
| `003_rls_policies.sql` | Отключает RLS (т.к. авторизация через NextAuth) |

## Подключение к проекту

1. Скопировать из Supabase → **Settings → Database → Connection string (URI)**
2. Добавить в `.env`:

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
```

3. Обновить `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

4. Пересинхронизировать Prisma с существующими таблицами:

```bash
npx prisma db pull    # подтянуть схему из БД
npx prisma generate   # перегенерировать клиент
```

## Таблицы

| Таблица | Описание |
|---------|----------|
| `buildings` | Здание |
| `floors` | Этажи |
| `spaces` | Помещения |
| `emergency_contacts` | Экстренные контакты |
| `users` | Все пользователи |
| `tenants` | Профили арендаторов |
| `staff` | Профили сотрудников |
| `salary_payments` | Зарплатные выплаты |
| `charges` | Начисления (аренда, коммуналка, пени) |
| `payments` | Оплаты от арендаторов |
| `expenses` | Расходы здания |
| `meters` | Счётчики |
| `meter_readings` | Показания счётчиков |
| `contracts` | Договора аренды |
| `tenant_documents` | Файлы документов |
| `requests` | Заявки арендаторов |
| `request_comments` | Комментарии к заявкам |
| `tasks` | Внутренние задачи |
| `messages` | Внутренние сообщения |
| `complaints` | Жалобы и предложения |
