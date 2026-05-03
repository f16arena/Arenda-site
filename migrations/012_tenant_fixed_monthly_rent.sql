-- Migration 012: individual fixed monthly rent per tenant

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fixed_monthly_rent DOUBLE PRECISION;
