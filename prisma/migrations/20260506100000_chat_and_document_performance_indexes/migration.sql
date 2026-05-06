CREATE INDEX IF NOT EXISTS "tenant_documents_tenant_id_created_at_idx"
  ON "tenant_documents"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "messages_from_id_to_id_created_at_idx"
  ON "messages"("from_id", "to_id", "created_at");

CREATE INDEX IF NOT EXISTS "messages_to_id_from_id_is_read_created_at_idx"
  ON "messages"("to_id", "from_id", "is_read", "created_at");
