"use server"

import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { audit } from "@/lib/audit"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { getT } from "@/lib/i18n/server"

export type ParsedRow = {
  date: string
  amount: number
  description: string
  // Прогноз — куда матчится
  matchedTenantId?: string
  matchedTenantName?: string
  matchType?: "BIN" | "IIN" | "IIK" | "NAME" | "MANUAL" | null
}

// Парсит CSV из Kaspi Business / Halyk Online
// Ожидает колонки: Дата, Сумма, Описание (или эквиваленты)
export async function parseBankCsv(csv: string): Promise<{ rows: ParsedRow[]; errors: string[] }> {
  await requireCapabilityAndFeature("finance.importBank")
  const { t } = await getT()
  const errors: string[] = []
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: [t("actions.bankImport.csvEmpty")] }

  // Определим разделитель (запятая или ; или табулятор)
  const sample = lines[0]
  const sep = sample.includes(";") ? ";" : sample.includes("\t") ? "\t" : ","

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""))

  // Угадываем колонки по началу слова в шапке выписки.
  //
  // Основы двуязычные, и это не перевод, а условие работы: банк отдаёт выписку
  // на языке кабинета, и в казахской шапке стоят «Күні», «Сомасы», «Төлем
  // тағайындалуы». Русские основы обязаны остаться — выписки приходят и на
  // русском. Ищем без «ё» и без учёта регистра (headers уже в нижнем).
  const dateIdx = headers.findIndex((h) =>
    h.includes("дат") || h.includes("date") || h.includes("период") ||
    h.includes("күн") || h.includes("кезең"))
  const amountIdx = headers.findIndex((h) =>
    h.includes("сумм") || h.includes("amount") || h.includes("приход") || h.includes("кредит") ||
    h.includes("сома") || h.includes("түсім") || h.includes("кіріс"))
  const descIdx = headers.findIndex((h) =>
    h.includes("назначен") || h.includes("описан") || h.includes("description") || h.includes("комментар") ||
    h.includes("тағайынд") || h.includes("сипат") || h.includes("мақсат") || h.includes("ескертпе"))

  if (dateIdx === -1 || amountIdx === -1) {
    errors.push(t("actions.bankImport.columnsNotFound"))
    return { rows: [], errors }
  }

  // Получим всех тенантов с реквизитами для матчинга — только в текущей организации
  const { orgId } = await requireOrgAccess()
  const tenants = await db.tenant.findMany({
    where: tenantScope(orgId),
    select: { id: true, companyName: true, bin: true, iin: true, iik: true },
  })

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 2) continue

    const date = cells[dateIdx]
    const amountStr = cells[amountIdx].replace(/\s/g, "").replace(",", ".")
    const amount = parseFloat(amountStr)
    if (Number.isNaN(amount) || amount === 0) continue

    const desc = descIdx >= 0 ? cells[descIdx] : ""

    // Матчинг арендатора по БИН/ИИН (12 цифр), ИИК (KZ + 18 символов) или имени
    let matched: { id: string; companyName: string; type: "BIN" | "IIN" | "IIK" | "NAME" } | null = null
    const ids = desc.match(/\b\d{12}\b/g) ?? []
    for (const id of ids) {
      const byBin = tenants.find((row) => row.bin === id)
      if (byBin) { matched = { id: byBin.id, companyName: byBin.companyName, type: "BIN" }; break }
      const byIin = tenants.find((row) => row.iin === id)
      if (byIin) { matched = { id: byIin.id, companyName: byIin.companyName, type: "IIN" }; break }
    }
    if (!matched) {
      // Поиск по ИИК (KZxx + 18 алфанумерических)
      const iikMatches = desc.toUpperCase().match(/\bKZ\d{2}[A-Z0-9]{16}\b/g) ?? []
      for (const iik of iikMatches) {
        const byIik = tenants.find((row) => row.iik === iik)
        if (byIik) { matched = { id: byIik.id, companyName: byIik.companyName, type: "IIK" }; break }
      }
    }
    if (!matched) {
      // Поиск по названию (substring case-insensitive)
      const upDesc = desc.toUpperCase()
      for (const row of tenants) {
        if (upDesc.includes(row.companyName.toUpperCase())) {
          matched = { id: row.id, companyName: row.companyName, type: "NAME" }
          break
        }
      }
    }

    rows.push({
      date,
      amount: Math.abs(amount),
      description: desc,
      matchedTenantId: matched?.id,
      matchedTenantName: matched?.companyName,
      matchType: matched?.type ?? null,
    })
  }

  return { rows, errors }
}

export async function applyBankImport(
  rows: { date: string; amount: number; tenantId: string; description: string }[],
) {
  await requireCapabilityAndFeature("finance.importBank")
  const { orgId } = await requireOrgAccess()

  let created = 0
  let chargesPaid = 0
  for (const r of rows) {
    if (!r.tenantId) continue
    try {
      await assertTenantInOrg(r.tenantId, orgId)
    } catch {
      continue
    }
    try {
      const paymentDate = parseDate(r.date) ?? new Date()
      // Идемпотентность импорта: детерминированный externalRef из полей строки
      // выписки. Повторная загрузка того же файла даёт тот же externalRef →
      // unique-конфликт → строка пропускается в catch ниже (раньше дублировались
      // платежи, см. AUDIT_2026-05-29, пункт C). Выписки обычно содержат
      // уникальную ссылку/№ документа в description, поэтому коллизия двух РАЗНЫХ
      // платежей маловероятна; при появлении нативного bank-txn-id — использовать его.
      const externalRef = `bankimport:${createHash("sha1")
        .update(`${r.tenantId}|${r.amount}|${r.date}|${r.description}`)
        .digest("hex")}`
      // Платёж + погашение charges — одна транзакция. Иначе при ошибке
      // посередине часть charges помечается isPaid=true, а Payment остаётся
      // без них или наоборот — рассинхрон денег (см. AUDIT_2026-05-26.md, #6).
      const paidInTx = await db.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            tenantId: r.tenantId!,
            amount: r.amount,
            paymentDate,
            method: "TRANSFER",
            // note попадает в акт сверки (app/actions/reconciliation-builder.ts)
            // и в выгрузку для 1С — это текст документа, а не интерфейс, поэтому
            // остаётся русским независимо от языка того, кто грузил выписку
            // (docs/i18n-documents-plan.md).
            note: `Импорт из выписки: ${r.description.slice(0, 100)}`,
            externalRef,
          },
        })
        const unpaid = await tx.charge.findMany({
          where: { tenantId: r.tenantId!, isPaid: false, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, amount: true },
        })
        const exact = unpaid.find((c) => Math.abs(c.amount - r.amount) < 0.01)
        if (exact) {
          await tx.charge.update({ where: { id: exact.id }, data: { isPaid: true } })
          return 1
        }
        // greedy: закрываем самые старые charges пока сумма позволяет
        let remaining = r.amount
        let paid = 0
        for (const c of unpaid) {
          if (remaining + 0.01 < c.amount) break
          await tx.charge.update({ where: { id: c.id }, data: { isPaid: true } })
          paid++
          remaining -= c.amount
          if (remaining < 0.01) break
        }
        return paid
      })
      created++
      chargesPaid += paidInTx

      await audit({
        action: "CREATE",
        entity: "payment",
        entityId: r.tenantId,
        details: { amount: r.amount, source: "bank-import" },
      })
    } catch {
      // Skip — не валим весь импорт. Транзакция откатилась, Payment не создан.
    }
  }

  revalidatePath("/admin/finances")
  return { created, chargesPaid }
}

function parseDate(s: string): Date | null {
  // Пробуем разные форматы: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/)
  if (ddmmyyyy) return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`)
  const isoStyle = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoStyle) return new Date(`${isoStyle[1]}-${isoStyle[2]}-${isoStyle[3]}`)
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
