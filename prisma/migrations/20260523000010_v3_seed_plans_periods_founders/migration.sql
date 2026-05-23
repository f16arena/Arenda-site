-- v3 Seed: 5 тарифов (Free/Starter/Pro/Business/Enterprise) + 5 периодов биллинга + singleton Founders.
-- Идемпотентно: ON CONFLICT (code) DO UPDATE для тарифов/периодов; DO NOTHING для singleton.

-- ===== ПЛАНЫ =====
INSERT INTO "plans" (
  "id","code","name","description","price_monthly","price_yearly",
  "max_buildings","max_tenants","max_users","max_leads",
  "max_area_sqm","max_storage_gb","founders_discount_pct","discount_stack_cap_pct",
  "features","is_active","sort_order","created_at"
) VALUES
('plan_free','FREE','Free','Базовый тариф для пробы — всё вручную',0,0,
 1,10,2,5, 500,1, 40,50,
 '{"tenantCabinet":true,"cmdkSearch":true,"addressAutocomplete":true,"contractTemplates":true,"invoices":true,"paymentReports":true,"requests":true,"tasks":true,"storage":true,"limits":{"storageGb":1,"documentsPerMonth":30,"apiRequestsPerMonth":0,"supportSlaHours":72},"highlights":["Чтобы попробовать","1 здание, 10 арендаторов","Документы базовые","Без автоматизаций"]}',
 TRUE,0,NOW()),

('plan_starter','STARTER','Starter','Один БЦ с базовыми автоматизациями',9900,98600,
 2,30,4,20, 2000,10, 40,50,
 '{"multiBuilding":true,"tenantCabinet":true,"cmdkSearch":true,"addressAutocomplete":true,"contractTemplates":true,"documentTemplates":true,"addendums":true,"bulkDocuments":true,"storage":true,"invoices":true,"paymentReports":true,"requests":true,"tasks":true,"meters":true,"autoReminders":true,"emailNotifications":true,"automatedFees":true,"bulkNotifications":true,"actsReconciliation":true,"excelImportService":"paid","limits":{"storageGb":10,"documentsPerMonth":200,"apiRequestsPerMonth":0,"supportSlaHours":48},"highlights":["Для одного БЦ","Автопени и массовые рассылки","Акт сверки","До 2 зданий, 30 арендаторов","Email-уведомления"]}',
 TRUE,10,NOW()),

('plan_pro','PRO','Pro','Портфель 3-7 зданий с ЭЦП и аналитикой',24900,248000,
 7,100,12,100, 10000,50, 40,50,
 '{"multiBuilding":true,"tenantCabinet":true,"cmdkSearch":true,"addressAutocomplete":true,"roleBuilder":true,"floorEditor":true,"publicBooking":true,"leadsPipeline":true,"dataQuality":true,"contractTemplates":true,"documentTemplates":true,"addendums":true,"ncalayerSigning":true,"bulkDocuments":true,"storage":true,"invoices":true,"paymentReports":true,"cashPayments":true,"cashAccounting":true,"bankImport":true,"excelExport":true,"ownerReports":true,"requests":true,"tasks":true,"meters":true,"autoReminders":true,"emailNotifications":true,"telegramBot":true,"automatedFees":true,"bulkNotifications":true,"actsReconciliation":true,"autoInvoiceCron":true,"analyticsBasic":true,"excelImportService":"free","limits":{"storageGb":50,"documentsPerMonth":1000,"apiRequestsPerMonth":0,"supportSlaHours":24},"highlights":["Для портфеля 3-7 зданий","ЭЦП через NCALayer","Импорт банковской выписки","План этажа и CRM лидов","Авто-счета на оплату","Базовая аналитика"]}',
 TRUE,20,NOW()),

('plan_business','BUSINESS','Business','Для управляющих компаний с глубокой аналитикой',79900,796000,
 20,400,30,500, 30000,250, 40,50,
 '{"multiBuilding":true,"tenantCabinet":true,"cmdkSearch":true,"addressAutocomplete":true,"roleBuilder":true,"floorEditor":true,"publicBooking":true,"leadsPipeline":true,"dataQuality":true,"contractTemplates":true,"documentTemplates":true,"addendums":true,"ncalayerSigning":true,"bulkDocuments":true,"storage":true,"invoices":true,"paymentReports":true,"cashPayments":true,"cashAccounting":true,"bankImport":true,"excelExport":true,"ownerReports":true,"export1c":true,"requests":true,"tasks":true,"meters":true,"autoReminders":true,"emailNotifications":true,"telegramBot":true,"api":true,"customDomain":true,"automatedFees":true,"bulkNotifications":true,"actsReconciliation":true,"autoInvoiceCron":true,"whatsappBusiness":true,"analyticsBasic":true,"analyticsAdvanced":true,"analyticsCustomReports":true,"excelImportService":"free","limits":{"storageGb":250,"documentsPerMonth":5000,"apiRequestsPerMonth":100000,"supportSlaHours":8},"highlights":["Для управляющих компаний","P&L по объектам","Cohort арендаторов","Публичный API","Кастомные отчёты","1С экспорт","WhatsApp Business","До 20 зданий"]}',
 TRUE,30,NOW()),

('plan_enterprise','ENTERPRISE','Enterprise','Индивидуально: WhiteLabel, On-Premise, AI',199000,1990000,
 NULL,NULL,NULL,NULL, NULL,NULL, 40,50,
 '{"multiBuilding":true,"tenantCabinet":true,"cmdkSearch":true,"addressAutocomplete":true,"roleBuilder":true,"floorEditor":true,"publicBooking":true,"leadsPipeline":true,"dataQuality":true,"contractTemplates":true,"documentTemplates":true,"addendums":true,"ncalayerSigning":true,"bulkDocuments":true,"storage":true,"invoices":true,"paymentReports":true,"cashPayments":true,"cashAccounting":true,"bankImport":true,"excelExport":true,"ownerReports":true,"export1c":true,"requests":true,"tasks":true,"meters":true,"autoReminders":true,"emailNotifications":true,"telegramBot":true,"api":true,"customDomain":true,"whiteLabel":true,"webVitals":true,"supportMode":true,"aiAssistant":true,"prioritySupport":true,"automatedFees":true,"bulkNotifications":true,"actsReconciliation":true,"autoInvoiceCron":true,"whatsappBusiness":true,"onPremise":true,"analyticsBasic":true,"analyticsAdvanced":true,"analyticsCustomReports":true,"excelImportService":"free","limits":{"storageGb":null,"documentsPerMonth":null,"apiRequestsPerMonth":null,"supportSlaHours":2},"highlights":["Индивидуально","WhiteLabel","On-Premise","AI-ассистент","Приоритетная поддержка","Безлимиты"]}',
 TRUE,40,NOW())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "price_monthly" = EXCLUDED."price_monthly",
  "price_yearly" = EXCLUDED."price_yearly",
  "max_buildings" = EXCLUDED."max_buildings",
  "max_tenants" = EXCLUDED."max_tenants",
  "max_users" = EXCLUDED."max_users",
  "max_leads" = EXCLUDED."max_leads",
  "max_area_sqm" = EXCLUDED."max_area_sqm",
  "max_storage_gb" = EXCLUDED."max_storage_gb",
  "founders_discount_pct" = EXCLUDED."founders_discount_pct",
  "discount_stack_cap_pct" = EXCLUDED."discount_stack_cap_pct",
  "features" = EXCLUDED."features",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order";

-- ===== ПЕРИОДЫ БИЛЛИНГА =====
INSERT INTO "billing_periods" (
  "id","code","name","months_count","discount_pct","bonus_message","is_active","sort_order"
) VALUES
('bp_monthly','monthly','1 месяц',1,0,NULL,TRUE,0),
('bp_quarterly','quarterly','3 месяца',3,5,'−5%',TRUE,10),
('bp_half_year','half_year','6 месяцев',6,10,'−10%',TRUE,20),
('bp_yearly','yearly','12 месяцев',12,17,'2 месяца в подарок',TRUE,30),
('bp_biennial','biennial','24 месяца',24,25,'6 месяцев в подарок',TRUE,40)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "months_count" = EXCLUDED."months_count",
  "discount_pct" = EXCLUDED."discount_pct",
  "bonus_message" = EXCLUDED."bonus_message",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order";

-- ===== FOUNDERS SINGLETON =====
INSERT INTO "founders_program_state" (
  "id","total_slots","taken_slots","discount_pct","is_active","created_at","updated_at"
) VALUES ('singleton',15,0,40,TRUE,NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;
