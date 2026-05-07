import { NextResponse } from "next/server"
import {
  revokeMobileSessionByBearer,
  revokeMobileSessionByRefresh,
} from "@/lib/mobile-auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { refreshToken?: string } | null

  await revokeMobileSessionByBearer(req)
  if (body?.refreshToken) await revokeMobileSessionByRefresh(body.refreshToken)

  return NextResponse.json({ ok: true })
}
