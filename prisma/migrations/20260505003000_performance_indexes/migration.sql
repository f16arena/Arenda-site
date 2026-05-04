CREATE INDEX IF NOT EXISTS "users_organization_id_role_is_active_idx"
  ON "users"("organization_id", "role", "is_active");

CREATE INDEX IF NOT EXISTS "buildings_organization_id_is_active_idx"
  ON "buildings"("organization_id", "is_active");

CREATE INDEX IF NOT EXISTS "tariffs_building_id_is_active_idx"
  ON "tariffs"("building_id", "is_active");

CREATE INDEX IF NOT EXISTS "floors_building_id_number_idx"
  ON "floors"("building_id", "number");

CREATE INDEX IF NOT EXISTS "floors_full_floor_tenant_id_idx"
  ON "floors"("full_floor_tenant_id");

CREATE INDEX IF NOT EXISTS "spaces_floor_id_status_idx"
  ON "spaces"("floor_id", "status");

CREATE INDEX IF NOT EXISTS "spaces_floor_id_kind_idx"
  ON "spaces"("floor_id", "kind");

CREATE INDEX IF NOT EXISTS "contracts_tenant_id_status_created_at_idx"
  ON "contracts"("tenant_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "charges_tenant_id_is_paid_due_date_idx"
  ON "charges"("tenant_id", "is_paid", "due_date");

CREATE INDEX IF NOT EXISTS "charges_tenant_id_period_type_idx"
  ON "charges"("tenant_id", "period", "type");

CREATE INDEX IF NOT EXISTS "charges_due_date_idx"
  ON "charges"("due_date");

CREATE INDEX IF NOT EXISTS "payments_tenant_id_payment_date_idx"
  ON "payments"("tenant_id", "payment_date");

CREATE INDEX IF NOT EXISTS "meters_space_id_type_idx"
  ON "meters"("space_id", "type");

CREATE INDEX IF NOT EXISTS "meter_readings_meter_id_period_idx"
  ON "meter_readings"("meter_id", "period");

CREATE INDEX IF NOT EXISTS "meter_readings_period_created_at_idx"
  ON "meter_readings"("period", "created_at");

CREATE INDEX IF NOT EXISTS "requests_tenant_id_status_created_at_idx"
  ON "requests"("tenant_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "requests_user_id_status_created_at_idx"
  ON "requests"("user_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "requests_status_updated_at_idx"
  ON "requests"("status", "updated_at");

CREATE INDEX IF NOT EXISTS "tasks_building_id_status_due_date_idx"
  ON "tasks"("building_id", "status", "due_date");

CREATE INDEX IF NOT EXISTS "tasks_assigned_to_id_status_due_date_idx"
  ON "tasks"("assigned_to_id", "status", "due_date");

CREATE INDEX IF NOT EXISTS "tasks_created_by_id_created_at_idx"
  ON "tasks"("created_by_id", "created_at");

CREATE INDEX IF NOT EXISTS "expenses_building_id_period_date_idx"
  ON "expenses"("building_id", "period", "date");

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx"
  ON "audit_logs"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx"
  ON "audit_logs"("action", "created_at");

CREATE INDEX IF NOT EXISTS "leads_building_id_status_created_at_idx"
  ON "leads"("building_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "email_logs_status_sent_at_idx"
  ON "email_logs"("status", "sent_at");

CREATE INDEX IF NOT EXISTS "email_logs_type_sent_at_idx"
  ON "email_logs"("type", "sent_at");

CREATE INDEX IF NOT EXISTS "generated_documents_organization_id_document_type_generated_at_idx"
  ON "generated_documents"("organization_id", "document_type", "generated_at");

CREATE INDEX IF NOT EXISTS "generated_documents_organization_id_generated_at_idx"
  ON "generated_documents"("organization_id", "generated_at");

CREATE INDEX IF NOT EXISTS "generated_documents_tenant_id_generated_at_idx"
  ON "generated_documents"("tenant_id", "generated_at");
