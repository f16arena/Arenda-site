-- Человекочитаемый НДС-статус из КГД (плательщик/снят/не состоит). Идемпотентно.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vat_status text;
