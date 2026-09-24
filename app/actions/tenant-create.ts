"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { unstable_rethrow } from "next/navigation"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingInOrg, assertSpaceInOrg } from "@/lib/scope-guards"
import { assertBuildingAccess } from "@/lib/building-access"
import { assertSpaceAssignable } from "@/lib/full-floor-guards"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { normalizeTenantLegalType, normalizeTenantTaxIds, taxIdMessage } from "@/lib/tenant-identity"
import { parseTenantSpaceIds } from "@/lib/tenant-spaces"
import { DEFAULT_KZ_VAT_RATE, normalizeKzVatRate } from "@/lib/kz-vat"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"

export type CreateTenantResult = { success: true; tenantId: string } | { success: false; error: string }

// Проверки ниже бросают Error с текстом для пользователя («телефон уже занят»,
// «кабинет занят»…). В продакшене Next прячет текст брошенной ошибки — форма
// получала «An error occurred in the Server Components render». Поэтому наши
// сообщения возвращаем явно, а чужие ошибки (Prisma, redirect) пробрасываем.
export async function createTenant(formData: FormData): Promise<CreateTenantResult> {
  try {
    return await createTenantUnchecked(formData)
  } catch (e) {
    unstable_rethrow(e)
    if (e instanceof Error && e.constructor === Error && e.message) return { success: false, error: e.message }
    throw e
  }
}

async function createTenantUnchecked(formData: FormData): Promise<CreateTenantResult> {
  const { t, locale } = await getT()
  await requireCapabilityAndFeature("tenants.create")
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "tenants")

  const name = String(formData.get("name") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"), { required: true })
  const email = await normalizeEmailWithDns(formData.get("email"), { t })
  const password = String(formData.get("password") ?? "")
  const companyName = String(formData.get("companyName") ?? "").trim()
  const legalType = normalizeTenantLegalType(formData.get("legalType"))
  const taxIds = normalizeTenantTaxIds({
    legalType,
    bin: formData.get("bin"),
    iin: formData.get("iin"),
    labels: {
      bin: t("common.settings.identity.binLabel"),
      iin: t("common.settings.identity.iinLabel"),
    },
    translate: taxIdMessage(t),
  })
  const bin = taxIds.bin
  const iin = taxIds.iin
  const category = String(formData.get("category") ?? "").trim()
  const legalAddress = String(formData.get("legalAddress") ?? "").trim()
  const actualAddress = String(formData.get("actualAddress") ?? "").trim()
  const isVatPayer = formData.get("isVatPayer") === "on"
  const vatRate = normalizeKzVatRate(
    formData.get("vatRate"),
    DEFAULT_KZ_VAT_RATE,
    t("actions.organizationSettings.badVatRate"),
  )
  // НДС-статус из КГД (человекочитаемый). Пустая строка → null (не определён).
  const vatStatus = String(formData.get("vatStatus") ?? "").trim() || null
  const spaceIds = parseTenantSpaceIds(formData)
  const spaceId = spaceIds[0] ?? ""
  const buildingId = String(formData.get("buildingId") ?? "").trim()
  // «Крышные» арендаторы без помещения: размещение + фикс. аренда.
  const placementNote = String(formData.get("placementNote") ?? "").trim()
  const fixedRentRaw = String(formData.get("fixedMonthlyRent") ?? "").trim()
  const fixedMonthlyRent = fixedRentRaw ? Number(fixedRentRaw.replace(/\s/g, "")) : null
  const contractStart = String(formData.get("contractStart") ?? "")
  const contractEnd = String(formData.get("contractEnd") ?? "")
  // Если флажок включён — отправить welcome-письмо с логином/паролем на email
  const sendWelcome = formData.get("sendWelcome") === "on"

  if (!name) throw new Error(t("actions.tenantCreate.contactNameRequired"))
  if (!companyName) throw new Error(t("actions.tenantCreate.companyNameRequired"))
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  if (spaceIds.length > 20) throw new Error(t("actions.tenantCreate.tooManySpaces"))

  if (spaceIds.length > 0) {
    for (const id of spaceIds) {
      await assertSpaceInOrg(id, orgId)
      await assertSpaceAssignable(id)
    }

    const existingSpaces = await db.space.findMany({
      where: { id: { in: spaceIds } },
      select: {
        id: true,
        number: true,
        tenant: { select: { id: true, companyName: true, contractEnd: true } },
        tenantSpaces: {
          select: {
            tenant: { select: { id: true, companyName: true, contractEnd: true } },
          },
        },
        floor: {
          select: {
            buildingId: true,
            building: { select: { name: true } },
          },
        },
      },
    })

    if (existingSpaces.length !== spaceIds.length) {
      throw new Error(t("actions.tenantCreate.spacesNotFound"))
    }

    for (const existing of existingSpaces) {
      if (buildingId && existing.floor.buildingId !== buildingId) {
        throw new Error(
          t("actions.tenantCreate.spaceOtherBuilding", {
            number: existing.number,
            building: existing.floor.building.name,
          }),
        )
      }
      if (existing.floor.buildingId) await assertBuildingAccess(existing.floor.buildingId, orgId)
      const occupiedBy = existing.tenant ?? existing.tenantSpaces[0]?.tenant ?? null
      if (occupiedBy) {
        const until = occupiedBy.contractEnd
          ? t("actions.tenantCreate.untilContract", {
              date: formatDateShortL(locale, occupiedBy.contractEnd),
            })
          : ""
        throw new Error(
          t("actions.tenantCreate.spaceOccupied", {
            number: existing.number,
            company: occupiedBy.companyName,
            until,
          }),
        )
      }
    }
  }

  if (phone && !(await releaseContactOfDeletedTenant({ phone }, orgId))) {
    throw new Error(t("actions.users.phoneTaken", { phone }))
  }
  if (email && !(await releaseContactOfDeletedTenant({ email }, orgId))) {
    throw new Error(t("actions.users.emailTaken", { email }))
  }

  // Проверка чёрного списка по БИН/ИИН — предупреждаем не блокируя.
  // Решение принимает Owner: для этого передаём поле formData "ignoreBlacklist".
  if (bin || iin) {
    const where: { bin?: string; iin?: string }[] = []
    if (bin) where.push({ bin })
    if (iin) where.push({ iin })
    if (where.length > 0) {
      const blocked = await db.tenant.findFirst({
        where: {
          blacklistedAt: { not: null },
          user: { organizationId: orgId },
          OR: where,
        },
        select: { id: true, companyName: true, blacklistReason: true, blacklistedAt: true },
      })
      if (blocked && formData.get("ignoreBlacklist") !== "on") {
        const dt = blocked.blacklistedAt ? formatDateShortL(locale, blocked.blacklistedAt) : "—"
        throw new Error(
          t("actions.tenantCreate.blacklisted", {
            company: blocked.companyName,
            date: dt,
            reason: blocked.blacklistReason ?? "—",
          }),
        )
      }
    }
  }

  // Сохраняем plain-password для отправки в email (если sendWelcome=true)
  // Если password не задан — генерируем temporary
  const plainPassword = password || `tenant${Math.random().toString(36).slice(2, 10)}`
  const hash = await bcrypt.hash(plainPassword, 10)

  let userId: string
  try {
    const user = await db.user.create({
      data: {
        name,
        phone,
        email,
        password: hash,
        role: "TENANT",
        organizationId: orgId,
        // Пароль задан администратором (или сгенерирован) — арендатор обязан сменить.
        mustChangePassword: true,
      },
      select: { id: true },
    })
    userId = user.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      // Сообщение для разработчика: сломан деплой, а не ошибка пользователя.
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(`Не удалось создать пользователя: ${msg}`)
  }

  let tenantId: string
  try {
    const tenant = await db.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          userId,
          spaceId: spaceId || null,
          // Прямая привязка к зданию только для арендатора БЕЗ помещения (крышные).
          // У обычных здание выводится через space — дублировать не нужно.
          buildingId: spaceIds.length === 0 && buildingId ? buildingId : null,
          placementNote: placementNote || null,
          fixedMonthlyRent: Number.isFinite(fixedMonthlyRent as number) && (fixedMonthlyRent as number) > 0 ? fixedMonthlyRent : null,
          companyName,
          legalType,
          bin: bin || null,
          iin: iin || null,
          category: category || null,
          legalAddress: legalAddress || null,
          actualAddress: actualAddress || null,
          isVatPayer,
          vatRate: isVatPayer ? vatRate : DEFAULT_KZ_VAT_RATE,
          vatStatus,
          contractStart: contractStart ? new Date(contractStart) : null,
          contractEnd: contractEnd ? new Date(contractEnd) : null,
        },
        select: { id: true },
      })

      if (spaceIds.length > 0) {
        await tx.tenantSpace.createMany({
          data: spaceIds.map((id, index) => ({
            tenantId: created.id,
            spaceId: id,
            isPrimary: index === 0,
          })),
          skipDuplicates: true,
        })
        await tx.space.updateMany({
          where: { id: { in: spaceIds } },
          data: { status: "OCCUPIED" },
        })
      }

      return created
    })
    tenantId = tenant.id
  } catch (e) {
    await db.user.delete({ where: { id: userId } }).catch(() => {})
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      // Сообщение для разработчика: сломан деплой, а не ошибка пользователя.
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(t("actions.tenantCreate.createFailed", { reason: msg }))
  }

  // ── Welcome-письмо арендатору (если есть email и флажок) ─────────
  if (sendWelcome && email) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { name: true, slug: true },
      })
      const h = await headers()
      const proto = h.get("x-forwarded-proto") ?? "https"
      const cabinetLink = org?.slug
        ? `${proto}://${org.slug}.${ROOT_HOST}/cabinet`
        : `${proto}://${ROOT_HOST}/login`

      // Письмо читает арендатор — берём его язык, а не язык создавшего.
      const { t: tt } = await getTForUser(userId)
      const orgName = org?.name ?? tt("actions.tenantCreate.orgFallback")
      const html = basicEmailTemplate({
        title: tt("actions.tenantCreate.mailTitle", { org: orgName }),
        body: [
          tt("actions.tenantCreate.mailGreeting", { name }),
          tt("actions.tenantCreate.mailLead", { org: orgName }),
          tt("actions.tenantCreate.mailCanTitle"),
          "<ul>",
          `<li>${tt("actions.tenantCreate.mailCanInvoices")}</li>`,
          `<li>${tt("actions.tenantCreate.mailCanDocs")}</li>`,
          `<li>${tt("actions.tenantCreate.mailCanRequests")}</li>`,
          `<li>${tt("actions.tenantCreate.mailCanChat")}</li>`,
          "</ul>",
          tt("actions.tenantCreate.mailCredentials", { login: email, password: plainPassword }),
          `<p style="font-size:12px;color:#64748b;">${tt("actions.tenantCreate.mailChangePassword")}</p>`,
        ].join("\n"),
        buttonText: tt("actions.tenantCreate.mailButton"),
        buttonUrl: cabinetLink,
        footer: tt("actions.tenantCreate.mailFooter"),
      })

      const result = await sendEmail({
        to: email,
        subject: tt("actions.tenantCreate.mailSubject", { org: orgName }),
        html,
        text: tt("actions.tenantCreate.mailText", {
          name,
          link: cabinetLink,
          login: email,
          password: plainPassword,
        }),
      })

      // Лог в email_logs
      try {
        await db.emailLog.create({
          data: {
            recipient: email,
            subject: tt("actions.tenantCreate.mailSubject", { org: orgName }),
            type: "WELCOME",
            tenantId,
            userId,
            externalId: result.id,
            status: result.ok ? "SENT" : "FAILED",
            error: result.error,
          },
        })
      } catch {}
    } catch (e) {
      console.warn("[tenant-create] welcome email failed:", e instanceof Error ? e.message : e)
    }
  }

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true as const, tenantId }
}

/**
 * Телефон/почта свободны — или заняты удалённым арендатором этой же организации.
 * Удаление арендатора мягкое: пользователь остаётся (выключенным) и держит
 * уникальные телефон и почту — заново завести того же человека было нельзя
 * («Телефон уже используется»). Такой контакт освобождаем у старой записи.
 * Возвращает false, если контакт занят живым пользователем или чужой организацией.
 */
async function releaseContactOfDeletedTenant(where: { phone: string } | { email: string }, orgId: string): Promise<boolean> {
  const existing = await db.user.findUnique({
    where,
    select: { id: true, role: true, isActive: true, organizationId: true, tenant: { select: { deletedAt: true } } },
  })
  if (!existing) return true
  const deletedTenantHere =
    existing.role === "TENANT" &&
    !existing.isActive &&
    existing.organizationId === orgId &&
    !!existing.tenant?.deletedAt
  if (!deletedTenantHere) return false
  await db.user.update({
    where: { id: existing.id },
    data: "phone" in where ? { phone: null } : { email: null },
  })
  return true
}
