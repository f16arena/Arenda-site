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
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = (user as any).role
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
