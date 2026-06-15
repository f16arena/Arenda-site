-- Код ГСВС услуги для АВР (обязателен в форме AwpV1, work/gsvsCode).
ALTER TABLE "org_esf_configs" ADD COLUMN IF NOT EXISTS "esf_gsvs_code" TEXT;
