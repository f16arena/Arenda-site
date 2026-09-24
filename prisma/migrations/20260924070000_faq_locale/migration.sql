-- Справка на двух языках.
--
-- Статьи справки не статические: заготовка из lib/faq.ts копируется в эту
-- таблицу по организации, и дальше администратор правит их у себя. Строка была
-- одна на статью, то есть текст существовал ровно в одном языке.
--
-- Добавляем язык в ключ: на одну статью теперь приходится до двух строк.
-- Существующим строкам ставим 'ru' — они написаны по-русски, и молча объявить
-- их казахскими было бы неправдой.

ALTER TABLE "faq_articles"
  ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ru';

-- Уникальность теперь по тройке: одна и та же статья живёт в двух языках.
DROP INDEX IF EXISTS "faq_articles_organization_id_slug_key";

CREATE UNIQUE INDEX IF NOT EXISTS "faq_articles_organization_id_slug_locale_key"
  ON "faq_articles"("organization_id", "slug", "locale");

-- Чтение идёт по организации, языку, аудитории и порядку — индекс под него.
DROP INDEX IF EXISTS "faq_articles_organization_id_audience_is_active_sort_order_idx";

CREATE INDEX IF NOT EXISTS "faq_articles_org_locale_audience_active_sort_idx"
  ON "faq_articles"("organization_id", "locale", "audience", "is_active", "sort_order");
