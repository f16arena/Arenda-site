-- Язык интерфейса пользователя: русский или казахский. Хранится в профиле,
-- чтобы выбор сохранялся между устройствами (на каждом запросе язык берётся
-- из cookie, а при входе cookie ставится отсюда).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ru';

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_locale_allowed";
ALTER TABLE "users" ADD CONSTRAINT "users_locale_allowed" CHECK ("locale" IN ('ru', 'kk'));
