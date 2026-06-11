-- Фото помещений (JSON-массив data-URL) для карточки/плана/витрины
ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "photos" TEXT;
