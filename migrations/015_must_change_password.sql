-- Migration 015 — принудительная смена пароля при первом входе
--
-- Добавляет два поля в users:
--   must_change_password — true, если пользователь обязан сменить пароль
--   password_changed_at  — когда пароль был последний раз изменён

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Помечаем всех существующих пользователей как требующих смены пароля при первом
-- входе, ЕСЛИ password_changed_at пуст. Это безопасный default для существующих
-- инсталляций — пароли будут сменены в течение нескольких следующих логинов.
UPDATE users
   SET must_change_password = TRUE
 WHERE password_changed_at IS NULL
   AND must_change_password = FALSE;
