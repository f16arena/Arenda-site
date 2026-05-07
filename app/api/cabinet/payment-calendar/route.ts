import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const PAYMENT_CALENDAR_LIMIT = 120

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!tenant) {
    return NextResponse.json({ charges: [], payments: [] })
  }

  const calendarStart = new Date()
  calendarStart.setMonth(calendarStart.getMonth() - 12)
  const calendarEnd = new Date()
  calendarEnd.setMonth(calendarEnd.getMonth() + 3)

  const [charges, payments] = await Promise.all([
    db.charge.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { dueDate: { gte: calendarStart, lt: calendarEnd } },
          { dueDate: null, createdAt: { gte: calendarStart } },
        ],
      },
      select: {
        id: true,
        amount: true,
        type: true,
        period: true,
        isPaid: true,
        dueDate: true,
      },
      take: PAYMENT_CALENDAR_LIMIT,
    }),
    db.payment.findMany({
      where: {
        tenantId: tenant.id,
        paymentDate: { gte: calendarStart, lt: calendarEnd },
      },
      select: { id: true, amount: true, paymentDate: true },
      take: PAYMENT_CALENDAR_LIMIT,
    }),
  ])

  return NextResponse.json({
    charges: charges.map((charge) => ({
      ...charge,
      dueDate: charge.dueDate ? charge.dueDate.toISOString() : null,
    })),
    payments: payments.map((payment) => ({
      ...payment,
      paymentDate: payment.paymentDate.toISOString(),
    })),
  })
}
