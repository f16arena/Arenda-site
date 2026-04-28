import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendTelegram } from "@/lib/telegram"

export const dynamic = "force-dynamic"

// Защита: только Vercel Cron или ручной запуск с секретом
function authorize(req: Request): boolean {
  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true

  const url = new URL(req.url)
  if (url.searchParams.get("secret") === process.env.CRON_SECRET) return true

  // Vercel Cron автоматически добавляет этот заголовок
  if (req.headers.get("user-agent")?.includes("vercel-cron")) return true

  return false
}

const CONTRACT_WARN_DAYS = 20  // за 20 дней до окончания договора
const PAYMENT_WARN_DAYS = 10   // за 10 дней до даты оплаты (если не оплачено)

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const results = {
    contractsChecked: 0,
    contractsWarned: 0,
    paymentsWarned: 0,
    notificationsCreated: 0,
    telegramSent: 0,
    errors: [] as string[],
  }

  try {
    // ── 1. Договоры — проверяем contractEnd ─────────────────────
    const expiringIn = new Date(now)
    expiringIn.setDate(expiringIn.getDate() + CONTRACT_WARN_DAYS)

    const tenantsExpiring = await db.tenant.findMany({
      where: {
        contractEnd: { gte: now, lte: expiringIn },
      },
      include: {
        user: { select: { id: true, name: true, telegramChatId: true } },
        space: { select: { number: true, floor: { select: { name: true } } } },
      },
    })
    results.contractsChecked = tenantsExpiring.length

    // Получим всех админов и владельцев — им тоже шлём
    const staff = await db.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true, name: true, telegramChatId: true },
    })

    for (const t of tenantsExpiring) {
      if (!t.contractEnd) continue
      const daysLeft = Math.ceil((t.contractEnd.getTime() - now.getTime()) / 86_400_000)

      // Чтобы не дублировать — проверим уже было ли сегодня
      const recentNotif = await db.notification.findFirst({
        where: {
          type: "CONTRACT_EXPIRING",
          message: { contains: t.id },
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const title = `Договор истекает через ${daysLeft} дн.`
      const message = `Арендатор «${t.companyName}» (id:${t.id}). Окончание договора: ${t.contractEnd.toLocaleDateString("ru-RU")}. Необходимо подготовить продление.`
      const link = `/admin/tenants/${t.id}`

      // Уведомление арендатору
      await db.notification.create({
        data: { userId: t.user.id, type: "CONTRACT_EXPIRING", title, message, link: `/cabinet` },
      })
      results.notificationsCreated++
      if (t.user.telegramChatId) {
        const sent = await sendTelegram(t.user.telegramChatId, `<b>⏰ ${title}</b>\n\nВаш договор аренды истекает через <b>${daysLeft} дн.</b> — ${t.contractEnd.toLocaleDateString("ru-RU")}.\n\nПожалуйста, свяжитесь с администрацией для продления.`)
        if (sent) results.telegramSent++
      }

      // Уведомления всем сотрудникам (OWNER+ADMIN)
      for (const s of staff) {
        await db.notification.create({
          data: { userId: s.id, type: "CONTRACT_EXPIRING", title, message, link },
        })
        results.notificationsCreated++
        if (s.telegramChatId) {
          const sent = await sendTelegram(s.telegramChatId, `<b>⏰ ${title}</b>\n\n${message}`)
          if (sent) results.telegramSent++
        }
      }

      results.contractsWarned++
    }

    // ── 2. Платежи — проверяем неоплаченные начисления ──────────
    const tenantsWithDebt = await db.tenant.findMany({
      where: { charges: { some: { isPaid: false } } },
      include: {
        user: { select: { id: true, name: true, telegramChatId: true } },
        charges: {
          where: { isPaid: false },
          select: { id: true, amount: true, type: true, period: true, dueDate: true },
        },
      },
    })

    for (const t of tenantsWithDebt) {
      const totalDebt = t.charges.reduce((s, c) => s + c.amount, 0)
      // Берём ближайший дедлайн
      const earliestDue = t.charges
        .map((c) => c.dueDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0]

      if (!earliestDue) continue
      const daysToDue = Math.ceil((earliestDue.getTime() - now.getTime()) / 86_400_000)

      // Уведомляем если до дедлайна <= 10 дней (включая просрочку)
      if (daysToDue > PAYMENT_WARN_DAYS) continue

      const recentNotif = await db.notification.findFirst({
        where: {
          userId: t.user.id,
          type: "PAYMENT_DUE",
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const overdue = daysToDue < 0
      const title = overdue
        ? `Просрочка оплаты ${Math.abs(daysToDue)} дн.`
        : `Оплата через ${daysToDue} дн.`
      const message = overdue
        ? `У вас просроченная задолженность ${totalDebt.toLocaleString("ru-RU")} ₸. Начисляется пеня ${t.penaltyPercent}% в день.`
        : `Не забудьте оплатить аренду до ${earliestDue.toLocaleDateString("ru-RU")}. Сумма к оплате: ${totalDebt.toLocaleString("ru-RU")} ₸.`

      await db.notification.create({
        data: { userId: t.user.id, type: "PAYMENT_DUE", title, message, link: "/cabinet/finances" },
      })
      results.notificationsCreated++
      if (t.user.telegramChatId) {
        const sent = await sendTelegram(t.user.telegramChatId, `<b>${overdue ? "🚨" : "💳"} ${title}</b>\n\n${message}`)
        if (sent) results.telegramSent++
      }
      results.paymentsWarned++

      // Дополнительно: уведомить админов о просрочке > 5 дней
      if (overdue && Math.abs(daysToDue) > 5) {
        for (const s of staff) {
          await db.notification.create({
            data: {
              userId: s.id,
              type: "PAYMENT_DUE",
              title: `Просрочка: ${t.companyName}`,
              message: `Арендатор «${t.companyName}» не оплатил ${totalDebt.toLocaleString("ru-RU")} ₸ (${Math.abs(daysToDue)} дн. просрочки).`,
              link: `/admin/tenants/${t.id}`,
            },
          })
          results.notificationsCreated++
          if (s.telegramChatId) {
            const sent = await sendTelegram(s.telegramChatId, `<b>🚨 Просрочка: ${t.companyName}</b>\n\nДолг: ${totalDebt.toLocaleString("ru-RU")} ₸ (${Math.abs(daysToDue)} дн.)`)
            if (sent) results.telegramSent++
          }
        }
      }
    }
  } catch (e) {
    results.errors.push(e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true, ...results, ranAt: now.toISOString() })
}
