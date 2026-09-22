import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      organizationId: string | null
      isPlatformOwner: boolean
      /** Язык из профиля — нужен, когда cookie языка ещё нет (новое устройство). */
      locale: string
    } & DefaultSession["user"]
  }
  interface User {
    role: string
    organizationId: string | null
    isPlatformOwner: boolean
    locale?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    organizationId: string | null
    isPlatformOwner: boolean
    locale?: string
  }
}
