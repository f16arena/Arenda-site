-- Загрузка .p12 из кабинета: ключ (base64, шифр) + имя файла в OrgEsfConfig.
ALTER TABLE "org_esf_configs" ADD COLUMN IF NOT EXISTS "cert_data_enc" TEXT;
ALTER TABLE "org_esf_configs" ADD COLUMN IF NOT EXISTS "cert_file_name" TEXT;
