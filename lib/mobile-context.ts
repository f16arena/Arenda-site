import { auth } from "@/auth"
import { db } from "@/lib/db"
import { verifyMobileBearer } from "@/lib/mobile-auth"
import { NextResponse } from "next/server"

export type MobileUserContext = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    role?: string | null
    organizationId?: string | null
    isPlatformOwner?: boolean | null
  }
  org: {
    id: string
    name: string
    slug: string
    isSuspended: boolean
  }
}

export async function getMobileContext(req?: Request): Promise<
  | { ok: true; ctx: MobileUserContext }
  | { ok: false; response: NextResponse }
> {
  if (req) {
    const bearer = await verifyMobileBearer(req)
    if (bearer) {
      return {
        ok: true,
        ctx: {
          user: bearer.user,
          org: {
            id: bearer.org.id,
            name: bearer.org.name,
            slug: bearer.org.slug,
            isSuspended: bearer.org.isSuspended,
          },
        },
      }
    }
  }

  const session = await auth()
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const orgId = session.user.organizationId
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Mobile API requires an organization-bound user" },
        { status: 403 },
      ),
    }
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, isActive: true, isSuspended: true },
  })

  if (!org || !org.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Organization is not active" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    ctx: {
      user: session.user,
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        isSuspended: org.isSuspended,
      },
    },
  }
}

export function mobileError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
