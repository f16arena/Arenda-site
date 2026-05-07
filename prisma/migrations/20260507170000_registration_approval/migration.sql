ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "approval_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "approval_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

UPDATE "users"
SET "approval_status" = 'APPROVED'
WHERE "approval_status" IS NULL;

UPDATE "organizations"
SET "approval_status" = 'APPROVED'
WHERE "approval_status" IS NULL;

CREATE INDEX IF NOT EXISTS "users_organization_id_approval_status_role_idx"
  ON "users"("organization_id", "approval_status", "role");

CREATE INDEX IF NOT EXISTS "users_approval_status_created_at_idx"
  ON "users"("approval_status", "created_at");

CREATE INDEX IF NOT EXISTS "organizations_approval_status_created_at_idx"
  ON "organizations"("approval_status", "created_at");

CREATE INDEX IF NOT EXISTS "organizations_is_active_approval_status_idx"
  ON "organizations"("is_active", "approval_status");
