import { NextResponse } from "next/server"
import { requireOrgAccess } from "@/lib/org"
import { getAddressSuggestions } from "@/lib/address-suggestions"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { orgId } = await requireOrgAccess()
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""

  const suggestions = await getAddressSuggestions(orgId, query)

  return NextResponse.json({
    suggestions,
    attribution: "© OpenStreetMap contributors",
  })
}
