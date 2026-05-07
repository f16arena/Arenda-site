import { NextResponse } from "next/server"
import { getMobileContext } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  return NextResponse.json({
    user: {
      id: result.ctx.user.id,
      name: result.ctx.user.name,
      email: result.ctx.user.email,
      role: result.ctx.user.role,
    },
    organization: result.ctx.org,
  })
}
