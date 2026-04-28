-- ============================================================
-- ArendaPro — Migration 003: Row Level Security (RLS)
-- Опционально — если используете Supabase Auth напрямую.
-- Если авторизация идёт через Next.js (NextAuth) и запросы
-- только с сервера через service_role ключ — этот файл
-- можно пропустить.
-- ============================================================

-- Отключить RLS на всех таблицах (для server-side доступа)
-- Приложение использует NextAuth + Prisma с service_role,
-- поэтому RLS отключён — доступ контролируется на уровне кода.

ALTER TABLE buildings         DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE floors            DISABLE ROW LEVEL SECURITY;
ALTER TABLE spaces            DISABLE ROW LEVEL SECURITY;
ALTER TABLE users             DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenants           DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff             DISABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments   DISABLE ROW LEVEL SECURITY;
ALTER TABLE charges           DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments          DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          DISABLE ROW LEVEL SECURITY;
ALTER TABLE meters            DISABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings    DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts         DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_documents  DISABLE ROW LEVEL SECURITY;
ALTER TABLE requests          DISABLE ROW LEVEL SECURITY;
ALTER TABLE request_comments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages          DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints        DISABLE ROW LEVEL SECURITY;
