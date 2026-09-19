import { redirect } from "next/navigation"

// Старый генератор «АВР» убран 19.09.2026: документ создаётся в конструкторе
// на странице «Документы» (одна система вместо двух). Загруженные DOCX-шаблоны
// этим генератором не использовались ни разу. Старый адрес — в конструктор.
export default async function LegacyDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>
}) {
  const { tenantId } = await searchParams
  redirect(`/admin/documents?create=avr${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ""}`)
}
