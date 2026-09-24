import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getT } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

// Проверка БИН/ИИН через открытый API e-license.kz / pkb.kz
// Реальный endpoint: https://pkb.kz/api/v2/com_legal/get_legal_info?bin={bin}
// или https://stat.gov.kz/api/rnFL/getRnFLByBin?BIN={bin}
export async function GET(req: Request) {
  // Переводчик объявлен до try — иначе в catch его не видно.
  const { t } = await getT()
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const bin = searchParams.get("bin")

  if (!bin || !/^\d{12}$/.test(bin)) {
    return NextResponse.json({ error: t("adminDocs.api.egov.badTaxId") }, { status: 400 })
  }

  // Используем открытый API stat.gov.kz
  try {
    const res = await fetch(`https://stat.gov.kz/api/rnFL/getRnFLByBin?BIN=${bin}`, {
      headers: { "Accept": "application/json" },
      // Кеш на час
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: t("adminDocs.api.egov.upstreamStatus", { status: res.status }),
        suggestions: [
          t("adminDocs.api.egov.hintManual"),
          t("adminDocs.api.egov.hintMaybeDown"),
        ],
      })
    }

    const data = await res.json()

    return NextResponse.json({
      ok: true,
      bin,
      data,
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
      hint: t("adminDocs.api.egov.unavailable"),
    })
  }
}
