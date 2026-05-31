-- Миграция 2026-05-31: «крышные» арендаторы (без помещения) + внешние PDF-договоры.
-- Применять в Supabase SQL Editor. Идемпотентно.
--
-- Контекст: на крыше здания есть арендаторы (вышки Beeline/Altel, камеры Сергек),
-- которые платят аренду, но не занимают помещение (space) и имеют СВОЙ договор —
-- не принимают нашу редакцию. Нужно: (1) привязать такого арендатора к зданию
-- напрямую + описать размещение; (2) хранить загруженный PDF их договора.

-- 1. Прямая привязка арендатора к зданию (для тех, у кого нет space) + размещение.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS building_id   TEXT,
  ADD COLUMN IF NOT EXISTS placement_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenants_building_id_fkey'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_building_id_fkey
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenants_building_id_idx ON tenants(building_id);

-- 2. Внешний договор: ссылка на загруженный PDF (stored_files). 1-1 → unique.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS attachment_file_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_attachment_file_id_key
  ON contracts(attachment_file_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contracts_attachment_file_id_fkey'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_attachment_file_id_fkey
      FOREIGN KEY (attachment_file_id) REFERENCES stored_files(id) ON DELETE SET NULL;
  END IF;
END $$;
