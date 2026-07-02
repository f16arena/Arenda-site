-- Льготный период (дней после срока оплаты), пока пеня не начисляется. По умолчанию 1.
-- Крон check-deadlines использует это как PENALTY_GRACE_DAYS на уровне организации.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS penalty_grace_days integer NOT NULL DEFAULT 1;
