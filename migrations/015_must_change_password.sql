-- Migration 015 — принудительная смена пароля при первом входе
--
-- Добавляет два поля в users:
--   must_change_password — true, если пользователь обязан сменить пароль
--   password_changed_at  — когда пароль был последний раз изменён

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Раньше здесь был UPDATE «всем с пустым password_changed_at — must_change_password = TRUE».
-- Задумывался разовым, но scripts/deploy-migrations.mjs прогоняет этот патч при КАЖДОМ деплое,
-- и он раз за разом заставлял менять пароль всех, кто ни разу его не менял: самостоятельно
-- зарегистрированных владельцев, демо-аккаунт после ночного сброса. Убран (22.10.2026):
-- флаг ставит только код, создающий пользователя с выданным паролем.
