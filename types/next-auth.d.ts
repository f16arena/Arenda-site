import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      organizationId: string | null
      isPlatformOwner: boolean
    } & DefaultSession["user"]
  }
  interface User {
    role: string
    organizationId: string | null
    isPlatformOwner: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    organizationId: string | null
    isPlatformOwner: boolean
  }
}
