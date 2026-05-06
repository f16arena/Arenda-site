"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"

export interface Result {
  ok: boolean
  error?: string
}

async function assertAccountInOrg(accountId: string, orgId: string) {
  const acc = await db.cashAccount.findUnique({
    where: { id: accountId },
    select: { organizationId: true },
  })
  if (!acc || acc.organizationId !== orgId) {
    throw new Error("Счёт не найден или вы не имеете к нему доступа")
  }
}

/**
 * Создать новый денежный счёт.
 */
export async function createCashAccount(formData: FormData): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const name = String(formData.get("name") ?? "").trim()
  const type = String(formData.get("type") ?? "BANK")
  const balanceStr = String(formData.get("balance") ?? "0").replace(",", ".")
  const balance = parseFloat(balanceStr) || 0
  const notes = String(formData.get("notes") ?? "").trim() || null

  if (!name) return { ok: false, error: "Введите название счёта" }
  if (!["BANK", "CASH", "CARD"].includes(type)) return { ok: false, error: "Неверный тип счёта" }

  const account = await db.cashAccount.create({
    data: { organizationId: orgId, name, type, balance, notes },
  })

  // Если указан начальный баланс — записываем как initial-транзакцию
  if (balance !== 0) {
    await db.cashTransaction.create({
      data: {
        accountId: account.id,
        amount: balance,
        type: "ADJUSTMENT",
        description: "Начальный баланс",
        createdById: session.user.id,
      },
    })
  }

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}

/**
 * Внести деньги (DEPOSIT).
 */
export async function depositToAccount(formData: FormData): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const accountId = String(formData.get("accountId") ?? "")
  const amountStr = String(formData.get("amount") ?? "0").replace(",", ".")
  const amount = parseFloat(amountStr)
  const description = String(formData.get("description") ?? "").trim() || "Пополнение"

  if (!accountId) return { ok: false, error: "Не указан счёт" }
  if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Сумма должна быть больше нуля" }
  await assertAccountInOrg(accountId, orgId)

  await db.$transaction([
    db.cashTransaction.create({
      data: {
        accountId,
        amount,
        type: "DEPOSIT",
        description,
        createdById: session.user.id,
      },
    }),
    db.cashAccount.update({
      where: { id: accountId },
      data: { balance: { increment: amount } },
    }),
  ])

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}

/**
 * Снять деньги (WITHDRAW).
 */
export async function withdrawFromAccount(formData: FormData): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const accountId = String(formData.get("accountId") ?? "")
  const amountStr = String(formData.get("amount") ?? "0").replace(",", ".")
  const amount = parseFloat(amountStr)
  const description = String(formData.get("description") ?? "").trim() || "Списание"

  if (!accountId) return { ok: false, error: "Не указан счёт" }
  if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Сумма должна быть больше нуля" }
  await assertAccountInOrg(accountId, orgId)

  await db.$transaction([
    db.cashTransaction.create({
      data: {
        accountId,
        amount: -amount,
        type: "WITHDRAW",
        description,
        createdById: session.user.id,
      },
    }),
    db.cashAccount.update({
      where: { id: accountId },
      data: { balance: { decrement: amount } },
    }),
  ])

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}

/**
 * Перевод между счетами организации.
 */
export async function transferBetweenAccounts(formData: FormData): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const fromId = String(formData.get("fromId") ?? "")
  const toId = String(formData.get("toId") ?? "")
  const amountStr = String(formData.get("amount") ?? "0").replace(",", ".")
  const amount = parseFloat(amountStr)
  const description = String(formData.get("description") ?? "").trim() || "Перевод между счетами"

  if (!fromId || !toId) return { ok: false, error: "Укажите оба счёта" }
  if (fromId === toId) return { ok: false, error: "Счета должны быть разные" }
  if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Сумма должна быть больше нуля" }
  await assertAccountInOrg(fromId, orgId)
  await assertAccountInOrg(toId, orgId)

  await db.$transaction([
    db.cashTransaction.create({
      data: {
        accountId: fromId,
        amount: -amount,
        type: "TRANSFER_OUT",
        description,
        createdById: session.user.id,
      },
    }),
    db.cashAccount.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    }),
    db.cashTransaction.create({
      data: {
        accountId: toId,
        amount,
        type: "TRANSFER_IN",
        description,
        createdById: session.user.id,
      },
    }),
    db.cashAccount.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    }),
  ])

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}

/**
 * Корректировка баланса (на случай расхождения с реальностью).
 */
export async function adjustAccountBalance(formData: FormData): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const accountId = String(formData.get("accountId") ?? "")
  const newBalanceStr = String(formData.get("newBalance") ?? "0").replace(",", ".")
  const newBalance = parseFloat(newBalanceStr)
  const description = String(formData.get("description") ?? "").trim() || "Корректировка баланса"

  if (!accountId) return { ok: false, error: "Не указан счёт" }
  if (!isFinite(newBalance)) return { ok: false, error: "Неверная сумма" }
  await assertAccountInOrg(accountId, orgId)

  const acc = await db.cashAccount.findUnique({ where: { id: accountId }, select: { balance: true } })
  if (!acc) return { ok: false, error: "Счёт не найден" }

  const delta = newBalance - acc.balance
  if (delta === 0) return { ok: true } // нечего менять

  await db.$transaction([
    db.cashTransaction.create({
      data: {
        accountId,
        amount: delta,
        type: "ADJUSTMENT",
        description,
        createdById: session.user.id,
      },
    }),
    db.cashAccount.update({
      where: { id: accountId },
      data: { balance: newBalance },
    }),
  ])

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}

/**
 * Удалить счёт (soft delete — isActive=false).
 * Транзакции остаются для истории.
 */
export async function deactivateAccount(accountId: string): Promise<Result> {
  await requireCapabilityAndFeature("finance.manageCashAccounts")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()
  await assertAccountInOrg(accountId, orgId)

  await db.cashAccount.update({
    where: { id: accountId },
    data: { isActive: false },
  })

  revalidatePath("/admin/finances/balance")
  return { ok: true }
}
