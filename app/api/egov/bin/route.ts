import { NextResponse } from "next/server"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// Проверка БИН/ИИН через открытый API e-license.kz / pkb.kz
// Реальный endpoint: https://pkb.kz/api/v2/com_legal/get_legal_info?bin={bin}
// или https://stat.gov.kz/api/rnFL/getRnFLByBin?BIN={bin}
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const bin = searchParams.get("bin")

  if (!bin || !/^\d{12}$/.test(bin)) {
    return NextResponse.json({ error: "Введите 12-значный БИН/ИИН" }, { status: 400 })
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
        error: `stat.gov.kz вернул статус ${res.status}`,
        suggestions: [
          "Проверьте БИН на e-license.kz вручную",
          "Возможно API недоступен в данный момент",
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
      hint: "API недоступен. Проверьте БИН вручную на e-license.kz",
    })
  }
}
