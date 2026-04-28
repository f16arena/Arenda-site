-- ============================================================
-- Migration 005: Уведомления, Telegram, дни оплаты, пени
-- ============================================================

-- Telegram chat id у пользователя для бесплатных уведомлений
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- День оплаты в месяце и процент пени у арендатора
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_due_day INTEGER NOT NULL DEFAULT 10;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS penalty_percent DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Таблица уведомлений (in-app, шторка-колокольчик)
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,           -- CONTRACT_EXPIRING | PAYMENT_DUE | NEW_REQUEST | NEW_COMPLAINT | INFO
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
