import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { t } = await getTForUser(result.ctx.user.id)
  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = String(body?.password ?? "")
  if (!password) return mobileError(t("adminDocs.api.auth.passwordRequired"))

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { password: true, totpEnabledAt: true },
  })
  if (!user) return mobileError(t("adminDocs.api.common.userNotFound"), 404)
  if (!user.totpEnabledAt) return mobileError(t("adminDocs.api.auth.totpNotEnabled"), 409)

  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return mobileError(t("adminDocs.api.auth.passwordWrong"))

  await db.user.update({
    where: { id: result.ctx.user.id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpBackupCodes: undefined,
    },
  })

  return NextResponse.json({ ok: true })
}
