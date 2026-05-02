"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { headers } from "next/headers"
import crypto from "crypto"

/**
 * Отправить договор арендатору на подпись.
 * Генерирует уникальный токен → tenant получает email со ссылкой → может
 * прочитать договор и подписать (галочка + ФИО) либо отклонить с причиной.
 */
export async function sendContractForSignature(
  contractId: string,
): Promise<{ ok: true; signUrl: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      id: true,
      number: true,
      status: true,
      signToken: true,
      tenant: {
        select: {
          companyName: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден или нет доступа" }

  if (contract.status === "SIGNED") {
    return { ok: false, error: "Договор уже подписан обеими сторонами" }
  }

  // Регенерируем токен на каждой отправке (старая ссылка протухает)
  const token = crypto.randomBytes(24).toString("hex")
  await db.contract.update({
    where: { id: contractId },
    data: {
      signToken: token,
      sentAt: new Date(),
      status: contract.status === "DRAFT" ? "SENT" : contract.status,
    },
  })

  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const signUrl = `${proto}://${ROOT_HOST}/sign/${token}`

  // Отправляем email арендатору если есть адрес
  const tenantEmail = contract.tenant.user.email
  if (tenantEmail) {
    try {
      const html = basicEmailTemplate({
        title: `Договор № ${contract.number} на подпись`,
        body: `<p>Здравствуйте, ${htmlEscape(contract.tenant.user.name)}!</p>
<p>Вам направлен договор аренды <b>№ ${htmlEscape(contract.number)}</b> для компании <b>${htmlEscape(contract.tenant.companyName)}</b>.</p>
<p>Откройте ссылку, прочитайте текст и нажмите «Подписать», если согласны с условиями. Если есть вопросы — отклоните договор с пояснением, и мы свяжемся.</p>
<p>Ссылка действительна до момента следующей повторной отправки.</p>`,
        buttonText: "Открыть договор",
        buttonUrl: signUrl,
        footer: "Это автоматическое письмо. Если вы не ожидали договор — проигнорируйте письмо.",
      })
      await sendEmail({
        to: tenantEmail,
        subject: `Договор № ${contract.number} — подпишите онлайн`,
        html,
        text: `Договор ${contract.number} — откройте ссылку ${signUrl}`,
      })
    } catch (e) {
      console.warn("[contract email] failed:", e instanceof Error ? e.message : e)
    }
  }

  revalidatePath(`/admin/tenants/${session.user.id}`)
  revalidatePath("/admin/documents")
  return { ok: true, signUrl }
}

/**
 * Отметить договор подписанным со стороны арендодателя (после ЭЦП через
 * NCALayer или ручного подтверждения).
 */
export async function markContractSignedByLandlord(
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId } = await requireOrgAccess()
  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: { id: true, status: true, signedByTenantAt: true },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }

  const now = new Date()
  // Если арендатор уже подписал — обе стороны → SIGNED
  const newStatus = contract.signedByTenantAt ? "SIGNED" : "SENT"
  await db.contract.update({
    where: { id: contractId },
    data: {
      signedByLandlordAt: now,
      status: newStatus,
      ...(newStatus === "SIGNED" ? { signedAt: now } : {}),
    },
  })

  revalidatePath("/admin/documents")
  return { ok: true }
}

// ─── Публичные действия со ссылкой ────────────────────────────────

/**
 * Получить договор по токену (для публичной страницы /sign/[token]).
 * Помечает viewedAt при первом открытии.
 */
export async function getContractByToken(token: string) {
  if (!token || typeof token !== "string" || token.length < 20) return null

  const contract = await db.contract.findUnique({
    where: { signToken: token },
    select: {
      id: true,
      number: true,
      type: true,
      content: true,
      status: true,
      startDate: true,
      endDate: true,
      sentAt: true,
      viewedAt: true,
      signedByTenantAt: true,
      signedByTenantName: true,
      signedByLandlordAt: true,
      rejectedAt: true,
      rejectionReason: true,
      tenant: {
        select: {
          companyName: true,
          legalType: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  })
  if (!contract) return null

  // Отмечаем первое открытие
  if (!contract.viewedAt) {
    await db.contract.update({
      where: { id: contract.id },
      data: { viewedAt: new Date(), status: contract.status === "SENT" ? "VIEWED" : contract.status },
    })
  }
  return contract
}

/**
 * Арендатор подписывает договор.
 */
export async function signContractByTenant(
  token: string,
  signerName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length < 20) return { ok: false, error: "Неверная ссылка" }
  const name = signerName.trim().slice(0, 200)
  if (name.length < 3) return { ok: false, error: "Введите ФИО подписанта (минимум 3 символа)" }

  const contract = await db.contract.findUnique({
    where: { signToken: token },
    select: { id: true, status: true, signedByLandlordAt: true },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return { ok: false, error: "Договор уже завершён" }
  }

  const now = new Date()
  const newStatus = contract.signedByLandlordAt ? "SIGNED" : "SIGNED_BY_TENANT"
  await db.contract.update({
    where: { id: contract.id },
    data: {
      signedByTenantAt: now,
      signedByTenantName: name,
      status: newStatus,
      ...(newStatus === "SIGNED" ? { signedAt: now } : {}),
    },
  })

  revalidatePath("/admin/documents")
  return { ok: true }
}

/**
 * Арендатор отклоняет договор с причиной.
 */
export async function rejectContractByTenant(
  token: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length < 20) return { ok: false, error: "Неверная ссылка" }
  const r = reason.trim().slice(0, 1000)
  if (r.length < 5) return { ok: false, error: "Опишите причину отказа (минимум 5 символов)" }

  const contract = await db.contract.findUnique({
    where: { signToken: token },
    select: { id: true, status: true },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return { ok: false, error: "Договор уже завершён" }
  }

  await db.contract.update({
    where: { id: contract.id },
    data: {
      rejectedAt: new Date(),
      rejectionReason: r,
      status: "REJECTED",
    },
  })

  revalidatePath("/admin/documents")
  return { ok: true }
}
