import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { getLoginIdentifiers } from "@/lib/contact-validation"
import { loginBlockReason } from "@/lib/approval"
import bcrypt from "bcryptjs"

const isProduction = process.env.NODE_ENV === "production"

// Cookie session-токена работает на всех *.commrent.kz, чтобы вход на
// commrent.kz/login → редирект на bcf16.commrent.kz/admin сохранял сессию.
// Изоляция между организациями — на app-level через requireOrgAccess
// (slug в URL должен совпадать с user.organizationId.slug).
const ROOT_HOST_FOR_COOKIE = process.env.ROOT_HOST
const SESSION_COOKIE_DOMAIN = isProduction && ROOT_HOST_FOR_COOKIE
  ? `.${ROOT_HOST_FOR_COOKIE}`
  : undefined

const SESSION_COOKIE_NAME = isProduction
  ? "__Secure-commrent.session-token"
  : "commrent.session-token"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        login: { label: "Телефон / Email" },
        password: { label: "Пароль", type: "password" },
        // Опциональный 6-значный код TOTP или резервный код XXXX-XXXX
        totp: { label: "Код 2FA", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.password) return null

        try {
          const loginIdentifiers = getLoginIdentifiers(credentials.login as string)
          if (loginIdentifiers.length === 0) return null
          const user = await db.user.findFirst({
            where: {
              OR: loginIdentifiers.flatMap((identifier) => [
                { phone: identifier },
                { email: identifier },
              ]),
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              organizationId: true,
              isPlatformOwner: true,
              approvalStatus: true,
              rejectionReason: true,
              totpEnabledAt: true,
              totpSecret: true,
              organization: {
                select: {
                  approvalStatus: true,
                  rejectionReason: true,
                  isActive: true,
                  isSuspended: true,
                },
              },
            },
          })

          if (!user) {
            // Audit: попытка входа в несуществующий аккаунт.
            // Пишем напрямую в auditLog (минуя audit() — там используется auth(),
            // а в callback authorize её ещё нет).
            await db.auditLog.create({
              data: {
                action: "LOGIN",
                entity: "user",
                entityId: null,
                details: JSON.stringify({ result: "fail", reason: "user_not_found", login: String(credentials.login) }),
              },
            }).catch(() => null)
            return null
          }

          const isValid = await bcrypt.compare(
            String(credentials.password),
            user.password
          )
          if (!isValid) {
            // Audit: неверный пароль для существующего пользователя.
            await db.auditLog.create({
              data: {
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                action: "LOGIN",
                entity: "user",
                entityId: user.id,
                details: JSON.stringify({ result: "fail", reason: "wrong_password" }),
              },
            }).catch(() => null)
            return null
          }

          if (!user.isPlatformOwner) {
            if (!user.organization?.isActive) return null
            // Suspended (истёкшая подписка): пускаем только владельца — чтобы он
            // мог войти и продлить подписку на /admin/subscription (иначе catch-22:
            // не залогиниться → не оплатить). Остальные роли при suspend не пускаем.
            // См. AUDIT_2026-05-29, пункт D.
            if (user.organization.isSuspended && user.role !== "OWNER") return null
            const blockReason = loginBlockReason({
              userStatus: user.approvalStatus,
              orgStatus: user.organization.approvalStatus,
              userRejectionReason: user.rejectionReason,
              orgRejectionReason: user.organization.rejectionReason,
            })
            if (blockReason) return null
          }

          // Если у пользователя включена 2FA — требуем код
          if (user.totpEnabledAt && user.totpSecret) {
            const totpCode = String(credentials.totp ?? "").trim()
            if (!totpCode) {
              // Сигнал клиенту: «нужен код 2FA» через специальную ошибку.
              // NextAuth превратит это в результат с error "TOTP_REQUIRED".
              throw new Error("TOTP_REQUIRED")
            }
            const { verifyTotpForLogin } = await import("@/app/actions/two-factor")
            const ok = await verifyTotpForLogin(user.id, totpCode)
            if (!ok) {
              throw new Error("TOTP_INVALID")
            }
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email ?? undefined,
            role: user.role,
            organizationId: user.organizationId ?? null,
            isPlatformOwner: user.isPlatformOwner ?? false,
          } as { id: string; name: string; email: string | undefined; role: string; organizationId: string | null; isPlatformOwner: boolean }
        } catch (e) {
          // TOTP_REQUIRED / TOTP_INVALID должны пробрасываться, остальные обезличиваем
          if (e instanceof Error && (e.message === "TOTP_REQUIRED" || e.message === "TOTP_INVALID")) {
            throw e
          }
          if (process.env.NODE_ENV !== "production") {
            console.error("[authorize error]", e)
          }
          return null
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = (user as { role: string }).role
        token.organizationId = (user as { organizationId?: string | null }).organizationId ?? null
        token.isPlatformOwner = (user as { isPlatformOwner?: boolean }).isPlatformOwner ?? false
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.organizationId = (token.organizationId as string | null) ?? null
      session.user.isPlatformOwner = (token.isPlatformOwner as boolean) ?? false
      return session
    },
  },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
        // domain=.commrent.kz → cookie работает на всех *.commrent.kz,
        // чтобы login на commrent.kz → редирект на slug-поддомен сохранял сессию.
        ...(SESSION_COOKIE_DOMAIN ? { domain: SESSION_COOKIE_DOMAIN } : {}),
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
