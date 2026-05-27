-- Миграция 2026-05-27: дата фактического заселения арендатора
-- Применять в Supabase SQL Editor. Идемпотентно.

-- moveInDate — может отличаться от contractStart (договор подписан раньше,
-- заехал позже). Если NULL — используется contractStart.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS move_in_date TIMESTAMP(3);
