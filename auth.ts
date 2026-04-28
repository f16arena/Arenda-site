import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        login: { label: "Телефон / Email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.password) return null

        try {
          const user = await db.user.findFirst({
            where: {
              OR: [
                { phone: String(credentials.login) },
                { email: String(credentials.login) },
              ],
              isActive: true,
            },
          })

          if (!user) return null

          const isValid = await bcrypt.compare(
            String(credentials.password),
            user.password
          )
          if (!isValid) return null

          return {
            id: user.id,
            name: user.name,
            email: user.email ?? undefined,
            role: user.role,
            organizationId: user.organizationId ?? null,
            isPlatformOwner: user.isPlatformOwner ?? false,
          } as { id: string; name: string; email: string | undefined; role: string; organizationId: string | null; isPlatformOwner: boolean }
        } catch (e) {
          console.error("[authorize error]", e)
          throw e
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
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
