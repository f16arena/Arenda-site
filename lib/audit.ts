"use server"

import { db } from "./db"
import { auth } from "@/auth"
import { headers } from "next/headers"
import { getValidatedImpersonateData } from "./org"

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "ERROR" | "SECURITY"
export type AuditEntity = "tenant" | "building" | "floor" | "space" | "charge" | "payment" | "expense" | "user" | "contract" | "lead" | "tariff" | "meter" | "request" | "task" | "system" | "apiKey" | "storage"

export async function audit(opts: {
  action: AuditAction
  entity: AuditEntity
  entityId?: string
  details?: object
}) {
  try {
    const session = await auth()
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? null

    // Если активен impersonate — добавляем метку в details
    let details = opts.details ?? null
    try {
      const imp = await getValidatedImpersonateData()
      if (imp) {
        details = {
          ...(details ?? {}),
          _impersonate: { realUserId: imp.realUserId, asUserId: imp.actAsUserId, orgId: imp.orgId },
        }
      }
    } catch {
      // игнор — impersonate cookie отсутствует или битый
    }

    await db.auditLog.create({
      data: {
        userId: session?.user?.id ?? null,
        userName: session?.user?.name ?? null,
        userRole: session?.user?.role ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        details: details ? JSON.stringify(details) : null,
        ip,
      },
    })
  } catch {
    // не падаем если таблицы нет или сессии нет
  }
}
