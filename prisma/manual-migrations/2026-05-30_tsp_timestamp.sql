-- Миграция 2026-05-30: метка доверенного времени (TSP, RFC 3161) для подписей
-- Применять в Supabase SQL Editor. Идемпотентно.
--
-- tsp_gen_time — момент проставления TSA НУЦ РК (genTime из TSP-токена в CMS).
-- tsp_serial    — серийный номер TSP-токена (для аудита/проверки).
-- Заполняются при верификации CMS через NCANode, если NCALayer встроил TSP-метку.

ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS tsp_gen_time TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS tsp_serial   TEXT;
