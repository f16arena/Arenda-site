-- Значения состояний и видов — только из списка. Раньше это были просто
-- строки, а допустимые значения жили в комментариях: опечатка в коде или
-- импорт «мимо» списка тихо ломали фильтры и отчёты.
-- Проверки NOT VALID: текущие данные не перепроверяются (они корректны,
-- сверено 20.09.2026), но новые записи обязаны соблюдать список.

ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_type_allowed";
ALTER TABLE "charges" ADD CONSTRAINT "charges_type_allowed" CHECK ("type" IN (
  'RENT','DEPOSIT','DEPOSIT_REFUND','SERVICE_FEE','SERVICE_FEE_INDEXED','ELECTRICITY','WATER','HEATING',
  'GARBAGE','SECURITY','INTERNET','GAS','CLEANING','PENALTY','SERVICE_DELIVERED','OTHER'
)) NOT VALID;

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_status_allowed";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_status_allowed" CHECK ("status" IN (
  'DRAFT','SENT','VIEWED','SIGNED_BY_TENANT','SIGNED','REJECTED','EXPIRED','ARCHIVED'
)) NOT VALID;

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_type_allowed";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_type_allowed" CHECK ("type" IN (
  'STANDARD','ADDENDUM','EXTERNAL'
)) NOT VALID;

ALTER TABLE "spaces" DROP CONSTRAINT IF EXISTS "spaces_status_allowed";
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_status_allowed" CHECK ("status" IN (
  'VACANT','OCCUPIED','MAINTENANCE'
)) NOT VALID;

ALTER TABLE "spaces" DROP CONSTRAINT IF EXISTS "spaces_kind_allowed";
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_kind_allowed" CHECK ("kind" IN (
  'RENTABLE','COMMON','OBJECT'
)) NOT VALID;

ALTER TABLE "floors" DROP CONSTRAINT IF EXISTS "floors_kind_allowed";
ALTER TABLE "floors" ADD CONSTRAINT "floors_kind_allowed" CHECK ("kind" IN (
  'FLOOR','ROOF','TERRITORY'
)) NOT VALID;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_allowed";
ALTER TABLE "users" ADD CONSTRAINT "users_role_allowed" CHECK (
  "role" IN ('OWNER','ADMIN','ACCOUNTANT','FACILITY_MANAGER','EMPLOYEE','TENANT')
  -- свои должности организации: org:<id>:<название>
  OR "role" LIKE 'org:%'
) NOT VALID;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_method_allowed";
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_allowed" CHECK ("method" IN (
  'TRANSFER','CASH','KASPI','CARD'
)) NOT VALID;

ALTER TABLE "generated_documents" DROP CONSTRAINT IF EXISTS "generated_documents_type_allowed";
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_type_allowed" CHECK ("document_type" IN (
  'ACT','INVOICE','RECONCILIATION','CONTRACT','HANDOVER'
)) NOT VALID;

ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "stored_files_visibility_allowed";
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_visibility_allowed" CHECK ("visibility" IN (
  'ADMIN_ONLY','TENANT_VISIBLE'
)) NOT VALID;
