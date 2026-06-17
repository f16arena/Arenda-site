-- Признак «выставлять ЭСФ в КГД» у арендатора (физлицам обычно выкл). Идемпотентно.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS esf_enabled boolean NOT NULL DEFAULT true;
