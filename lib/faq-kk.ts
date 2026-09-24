import type { FaqItem } from "@/lib/faq-types"
import { faqKkOwner } from "@/lib/faq-kk-owner"
import { faqKkAdmin } from "@/lib/faq-kk-admin"
import { faqKkTenant } from "@/lib/faq-kk-tenant"

/**
 * Казахская заготовка справки. Разбита по аудиториям по той же причине, что и
 * русская: один файл не должен перерастать бюджет размера (перф-гейт).
 *
 * Массив может быть короче русского — перевод идёт постепенно. Статью, которой
 * здесь нет, читатель увидит по-русски: см. pickByLocale в lib/faq-db.ts.
 */
export const faqItemsKk: FaqItem[] = [...faqKkOwner, ...faqKkAdmin, ...faqKkTenant]
