import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { parseHost, ROOT_HOST } from "@/lib/host"

export const dynamic = "force-dynamic"

/**
 * Разрешение Caddy на выпуск сертификата (on-demand TLS на VPS).
 *
 * Caddy перед выпуском сертификата для *.commrent.kz спрашивает: GET /api/tls/ask?domain=<host>.
 * 200 — выпускать, иначе — нет. Пускаем только корень/www и поддомены СУЩЕСТВУЮЩИХ организаций:
 * перебор случайных поддоменов иначе выжег бы лимит Let's Encrypt (50 сертификатов в неделю
 * на домен), и настоящие организации остались бы без HTTPS.
 *
 * Снаружи маршрут ничего не раскрывает сверх того, что и так видно по ответу поддомена.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") ?? "").toLowerCase()
  const host = parseHost(domain)

  if (host.kind === "root") return new NextResponse("ok")
  if (!domain.endsWith(`.${ROOT_HOST}`)) return new NextResponse("no", { status: 403 })

  // Смотрим по базе, а не по kind: у демо-организации slug «demo» короче формата parseHost
  // (kind "invalid"), но поддомен должен открываться по HTTPS — дальше его разрулит proxy.ts.
  const slug = domain.slice(0, -(ROOT_HOST.length + 1))
  if (slug.includes(".")) return new NextResponse("no", { status: 403 })
  const org = await db.organization.findUnique({
    where: { slug },
    select: { id: true },
  })
  return org ? new NextResponse("ok") : new NextResponse("no", { status: 404 })
}
