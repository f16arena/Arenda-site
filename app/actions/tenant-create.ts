"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertBuildingInOrg, assertSpaceInOrg } from "@/lib/scope-guards"
import { assertBuildingAccess } from "@/lib/building-access"
import { assertSpaceAssignable } from "@/lib/full-floor-guards"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { normalizeTenantLegalType, normalizeTenantTaxIds } from "@/lib/tenant-identity"

export async function createTenant(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "tenants")

  const name = String(formData.get("name") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"), { required: true })
  const email = await normalizeEmailWithDns(formData.get("email"))
  const password = String(formData.get("password") ?? "")
  const companyName = String(formData.get("companyName") ?? "").trim()
  const legalType = normalizeTenantLegalType(formData.get("legalType"))
  const taxIds = normalizeTenantTaxIds({
    legalType,
    bin: formData.get("bin"),
    iin: formData.get("iin"),
  })
  const bin = taxIds.bin
  const iin = taxIds.iin
  const category = String(formData.get("category") ?? "").trim()
  const spaceId = String(formData.get("spaceId") ?? "").trim()
  const buildingId = String(formData.get("buildingId") ?? "").trim()
  const contractStart = String(formData.get("contractStart") ?? "")
  const contractEnd = String(formData.get("contractEnd") ?? "")
  // Если флажок включён — отправить welcome-письмо с логином/паролем на email
  const sendWelcome = formData.get("sendWelcome") === "on"

  if (!name) throw new Error("Введите ФИО контактного лица")
  if (!companyName) throw new Error("Введите название компании")
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  if (spaceId) {
    await assertSpaceInOrg(spaceId, orgId)
    // Помещение не должно быть на полностью арендованном этаже
    await assertSpaceAssignable(spaceId)
    // И само помещение не должно быть уже занято
    const existing = await db.space.findUnique({
      where: { id: spaceId },
      select: {
        number: true,
        floor: {
          select: {
            buildingId: true,
            building: { select: { name: true } },
          },
        },
        tenant: { select: { companyName: true, contractEnd: true } },
      },
    })
    if (buildingId && existing?.floor.buildingId !== buildingId) {
      throw new Error(
        `Помещение «Каб. ${existing?.number ?? "—"}» относится к зданию «${existing?.floor.building.name ?? "другое здание"}». ` +
          "Переключитесь на это здание или выберите помещение из текущего здания.",
      )
    }
    if (existing?.floor.buildingId) await assertBuildingAccess(existing.floor.buildingId, orgId)
    if (existing?.tenant) {
      const until = existing.tenant.contractEnd
        ? ` (договор до ${existing.tenant.contractEnd.toLocaleDateString("ru-RU")})`
        : ""
      throw new Error(
        `Кабинет ${existing.number} уже занят арендатором «${existing.tenant.companyName}»${until}. Сначала выселите.`,
      )
    }
  }

  if (phone) {
    const existing = await db.user.findUnique({ where: { phone }, select: { id: true } })
    if (existing) throw new Error(`Телефон ${phone} уже используется другим пользователем`)
  }
  if (email) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new Error(`Email ${email} уже используется другим пользователем`)
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
        const dt = blocked.blacklistedAt?.toLocaleDateString("ru-RU") ?? "—"
        throw new Error(
          `⛔ Этот БИН/ИИН в чёрном списке (компания «${blocked.companyName}», добавлен ${dt}). ` +
            `Причина: ${blocked.blacklistReason ?? "—"}. ` +
            `Если уверены — отметьте «Игнорировать чёрный список» и попробуйте снова.`,
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
      },
      select: { id: true },
    })
    userId = user.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(`Не удалось создать пользователя: ${msg}`)
  }

  let tenantId: string
  try {
    const tenant = await db.tenant.create({
      data: {
        userId,
        spaceId: spaceId || null,
        companyName,
        legalType,
        bin: bin || null,
        iin: iin || null,
        category: category || null,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd: contractEnd ? new Date(contractEnd) : null,
      },
      select: { id: true },
    })
    tenantId = tenant.id
  } catch (e) {
    await db.user.delete({ where: { id: userId } }).catch(() => {})
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(`Не удалось создать арендатора: ${msg}`)
  }

  if (spaceId) {
    await db.space.update({
      where: { id: spaceId },
      data: { status: "OCCUPIED" },
    })
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

      const html = basicEmailTemplate({
        title: `Добро пожаловать в Commrent · ${org?.name ?? "Кабинет арендатора"}`,
        body: `<p>Здравствуйте, ${name}!</p>
<p>Для вас создан личный кабинет арендатора в <b>${org?.name ?? "Commrent"}</b>.</p>
<p>В кабинете вы можете:</p>
<ul>
<li>Просматривать счета и оплачивать их</li>
<li>Скачивать договоры, акты и другие документы</li>
<li>Отправлять заявки на обслуживание помещения</li>
<li>Общаться с администрацией</li>
</ul>
<p><b>Логин:</b> ${email}<br/>
<b>Временный пароль:</b> ${plainPassword}</p>
<p style="font-size:12px;color:#64748b;">⚠ Рекомендуем сменить пароль при первом входе (Профиль → Безопасность).</p>`,
        buttonText: "Открыть кабинет",
        buttonUrl: cabinetLink,
        footer: "Если возникнут вопросы — свяжитесь с администрацией здания.",
      })

      const result = await sendEmail({
        to: email,
        subject: `Доступ к кабинету арендатора · ${org?.name ?? "Commrent"}`,
        html,
        text: `Здравствуйте, ${name}! Ваш кабинет: ${cabinetLink}\nЛогин: ${email}\nПароль: ${plainPassword}`,
      })

      // Лог в email_logs
      try {
        await db.emailLog.create({
          data: {
            recipient: email,
            subject: `Доступ к кабинету арендатора`,
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
  return { success: true, tenantId }
}
