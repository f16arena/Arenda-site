# Карточка арендатора

> Граф зависимостей модулей (импорты TypeScript/React) — автогенерация через `madge` + Mermaid.
> **Источник:** `app/admin/tenants/[id]`
> **Всего файлов:** 23
> **Обновить:** `node scripts/gen-code-graph.mjs "app/admin/tenants/[id]" docs/code-graphs/01-tenant-card.md "Карточка арендатора"`

## Легенда

- 🔵 **Синий** — `page.tsx` (точка входа страницы)
- 🟢 **Зелёный** — формы (`*-form.tsx`)
- 🟠 **Оранжевый** — lazy-секции (динамический импорт)
- ⚫ **Серый** — библиотеки (`lib/`, `.ts`)
- ⚪ **Бледный пунктир** — внешние зависимости (вне таргет-папки)

## Граф

```mermaid
graph LR
  ext_delete_tenant_button_tsx["📦 delete-tenant-button.tsx"]:::external
  ext_tenant_identity_fields_tsx["📦 tenant-identity-fields.tsx"]:::external
  blacklist_button_tsx["blacklist-button.tsx"]
  charges_by_contract_tsx["charges-by-contract.tsx"]
  client_section_loaders_tsx["client-section-loaders.tsx"]
  documents_actions_tsx["documents-actions.tsx"]
  client_section_loaders_tsx --> documents_actions_tsx
  documents_checklist_tsx["documents-checklist.tsx"]
  client_section_loaders_tsx --> documents_checklist_tsx
  email_log_tsx["email-log.tsx"]
  client_section_loaders_tsx --> email_log_tsx
  full_floor_assign_tsx["full-floor-assign.tsx"]
  client_section_loaders_tsx --> full_floor_assign_tsx
  rental_terms_form_tsx["rental-terms-form.tsx"]:::form
  client_section_loaders_tsx --> rental_terms_form_tsx
  requisites_form_tsx["requisites-form.tsx"]:::form
  client_section_loaders_tsx --> requisites_form_tsx
  service_charges_form_tsx["service-charges-form.tsx"]:::form
  client_section_loaders_tsx --> service_charges_form_tsx
  contract_actions_tsx["contract-actions.tsx"]
  contract_version_button_tsx["contract-version-button.tsx"]
  indexation_hint_tsx["indexation-hint.tsx"]
  page_tsx["page.tsx"]:::page
  page_tsx --> ext_delete_tenant_button_tsx
  page_tsx --> ext_tenant_identity_fields_tsx
  page_tsx --> blacklist_button_tsx
  page_tsx --> charges_by_contract_tsx
  page_tsx --> client_section_loaders_tsx
  page_tsx --> indexation_hint_tsx
  tenant_lazy_sections_tsx["tenant-lazy-sections.tsx"]:::lazy
  page_tsx --> tenant_lazy_sections_tsx
  tenant_documents_section_tsx["tenant-documents-section.tsx"]
  tenant_documents_section_tsx --> client_section_loaders_tsx
  tenant_email_log_section_tsx["tenant-email-log-section.tsx"]
  tenant_email_log_section_tsx --> client_section_loaders_tsx
  tenant_email_log_section_tsx --> email_log_tsx
  tenant_full_floor_section_tsx["tenant-full-floor-section.tsx"]
  tenant_full_floor_section_tsx --> client_section_loaders_tsx
  tenant_history_section_tsx["tenant-history-section.tsx"]
  tenant_lazy_sections_tsx --> client_section_loaders_tsx
  tenant_lazy_sections_tsx --> contract_actions_tsx
  tenant_service_charges_section_tsx["tenant-service-charges-section.tsx"]
  tenant_service_charges_section_tsx --> client_section_loaders_tsx
  tenant_sidebar_sections_tsx["tenant-sidebar-sections.tsx"]
  tenant_sidebar_sections_tsx --> contract_actions_tsx
  tenant_sidebar_sections_tsx --> contract_version_button_tsx

  classDef page    fill:#1e40af,color:#fff,stroke:#1e3a8a,stroke-width:2px
  classDef form    fill:#059669,color:#fff,stroke:#047857
  classDef lazy    fill:#d97706,color:#fff,stroke:#b45309
  classDef lib     fill:#6b7280,color:#fff,stroke:#4b5563
  classDef external fill:#e5e7eb,color:#374151,stroke:#9ca3af,stroke-dasharray:3 3
```

---

*Сгенерировано 2026-05-27. Если граф слишком плотный — открой в Obsidian и используй колесо мыши для zoom (правый клик → Zoom in / Zoom out).*
