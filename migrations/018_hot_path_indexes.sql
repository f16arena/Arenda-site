-- Migration 018 — горячие пути запросов
--
-- Charge: добавляем (tenantId, dueDate) для календаря и dashboard, где WHERE
-- содержит { tenantId, dueDate: { gte, lt } } без isPaid — существующий
-- [tenantId, isPaid, dueDate] теряет dueDate-селективность для таких запросов.
--
-- GeneratedDocument: composite (organizationId, tenantId) для mobile + cabinet,
-- где документы конкретного арендатора фильтруются по обеим колонкам.
--
-- Идемпотентно (IF NOT EXISTS): безопасно повторно прогнать на БД где индексы
-- уже существуют.

CREATE INDEX IF NOT EXISTS charges_tenant_due_date_idx
  ON charges (tenant_id, due_date);

CREATE INDEX IF NOT EXISTS generated_documents_org_tenant_idx
  ON generated_documents (organization_id, tenant_id);
