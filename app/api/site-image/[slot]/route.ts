export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

// Публичная отдача изображения публичного сайта (лендинг) по slot.
// Редактируется без передеплоя (таблица site_images). 404 — если не загружено.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params
  const img = await db.siteImage.findUnique({ where: { slot } }).catch(() => null)
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 })
  return new NextResponse(img.data as unknown as BodyInit, {
    headers: {
      "Content-Type": img.mime || "image/png",
      // Кэшируем кратко + версионируем через ?v= на стороне ссылки.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  })
}
