-- Ручная отмена пени: флаг на начислении-источнике. Cron check-deadlines не
-- начисляет пеню по начислениям с penalty_waived = true (см. waivePenalty).
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "penalty_waived" BOOLEAN NOT NULL DEFAULT false;
