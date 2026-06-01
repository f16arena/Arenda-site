-- Миграция 2026-06-02: рыночная статистика аренды ₸/м² (платформенная таблица).
-- Наполняется сборщиком на VPS (krisha+OLX). Идемпотентно.

CREATE TABLE IF NOT EXISTS market_rent_stats (
  id             TEXT PRIMARY KEY,
  city           TEXT NOT NULL,
  district       TEXT,
  property_type  TEXT NOT NULL,
  source         TEXT NOT NULL,
  per_sqm_median DOUBLE PRECISION NOT NULL,
  per_sqm_avg    DOUBLE PRECISION,
  per_sqm_min    DOUBLE PRECISION,
  per_sqm_max    DOUBLE PRECISION,
  sample_count   INTEGER NOT NULL,
  collected_at   TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_rent_stats_city_district_type_idx
  ON market_rent_stats(city, district, property_type, collected_at);
CREATE INDEX IF NOT EXISTS market_rent_stats_collected_at_idx
  ON market_rent_stats(collected_at);
