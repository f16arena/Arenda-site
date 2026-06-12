import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { type FloorElement, uid } from "@/lib/floor-layout"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Координаты — в метрах внутри холста 0..width × 0..height.
const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["elements"],
  properties: {
    elements: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["el", "x", "y", "width", "height", "kind", "label"],
            properties: {
              el: { type: "string", enum: ["rect"] },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              kind: { type: "string", enum: ["rentable", "common"] },
              label: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["el", "icon", "x", "y", "size", "label"],
            properties: {
              el: { type: "string", enum: ["icon"] },
              icon: { type: "string", enum: ["stairs", "elevator", "toilet", "kitchen", "parking"] },
              x: { type: "number" },
              y: { type: "number" },
              size: { type: "number" },
              label: { type: "string" },
            },
          },
        ],
      },
    },
  },
} as const

const SYSTEM_PROMPT = `Ты — планировщик коммерческой недвижимости (Казахстан/СНГ). По заданным габаритам зоны и её типу составь разумную планировку.

ТИПЫ ЗОН:
- "floor" (этаж): арендные помещения (kind="rentable") + общие зоны (kind="common": коридор, санузел, лестница, лифт, кухня). Обычно центральный коридор и кабинеты по сторонам; санузел и лестница — у ядра. Кабинеты ~12–40 м².
- "roof" (крыша): технические зоны под оборудование (kind="common", напр. "Тех. зона (HVAC)") и свободная площадка. Без жилых помещений.
- "territory" (территория): парковочные места (иконки "parking", ~2.5×5 м, рядами с проездами ≥6 м), дорожки и газон (kind="common").

ПРАВИЛА:
- Все координаты и размеры — В МЕТРАХ, внутри холста (0,0)–(width,height). (0,0) = левый верх.
- Прямоугольники (el="rect") не должны вылезать за холст и сильно перекрываться.
- Иконки (el="icon") — точечные объекты: stairs/elevator/toilet/kitchen/parking; x,y — центр, size — размер в метрах.
- Давай человеко-читаемые label ("Офис 1", "Коридор", "Санузел", "P1").
- 6–30 элементов в зависимости от площади. Не делай мусор.`

type SuggestEl =
  | { el: "rect"; x: number; y: number; width: number; height: number; kind: "rentable" | "common"; label: string }
  | { el: "icon"; icon: "stairs" | "elevator" | "toilet" | "kitchen" | "parking"; x: number; y: number; size: number; label: string }

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  if (session.user.role === "TENANT") return NextResponse.json({ error: "Запрещено" }, { status: 403 })
  await requireOrgAccess()

  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `suggest-layout:${session.user.id}`), {
    max: 20,
    window: 60 * 60_000,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.` },
      { status: 429 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI не настроен. Добавьте ANTHROPIC_API_KEY в переменные окружения." },
      { status: 503 },
    )
  }

  let body: { kind?: string; width?: number; height?: number; name?: string; hint?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const kind = body.kind === "roof" ? "roof" : body.kind === "territory" ? "territory" : "floor"
  const width = Number.isFinite(body.width) && (body.width as number) > 2 ? Math.min(200, body.width as number) : 30
  const height = Number.isFinite(body.height) && (body.height as number) > 2 ? Math.min(200, body.height as number) : 20

  const kindRu = kind === "roof" ? "крыша" : kind === "territory" ? "территория" : "этаж"
  const userText = `Тип зоны: ${kindRu} (${kind}). Габариты холста: ${width} × ${height} метров${
    body.name ? `. Название: «${body.name}»` : ""
  }${body.hint ? `. Пожелание: ${body.hint}` : ""}. Составь планировку по системной инструкции, координаты в метрах в пределах холста.`

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: SUGGEST_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    })
  } catch (e) {
    return NextResponse.json({ error: `Ошибка AI: ${e instanceof Error ? e.message : "сервис недоступен"}` }, { status: 502 })
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "AI не вернул ответ" }, { status: 502 })
  }
  let parsed: { elements?: unknown }
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    return NextResponse.json({ error: "AI вернул невалидный JSON" }, { status: 502 })
  }
  if (!Array.isArray(parsed.elements)) {
    return NextResponse.json({ error: "В ответе нет массива elements" }, { status: 502 })
  }

  const clampW = (v: number, max: number) => Math.max(0, Math.min(max, v))
  const elements: FloorElement[] = []
  for (const raw of parsed.elements as SuggestEl[]) {
    if (!raw || typeof raw !== "object") continue
    if (raw.el === "rect") {
      const x = clampW(Number(raw.x), width)
      const y = clampW(Number(raw.y), height)
      const w = Math.max(0.5, Math.min(width - x, Number(raw.width)))
      const h = Math.max(0.5, Math.min(height - y, Number(raw.height)))
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0.5 || h < 0.5) continue
      elements.push({
        type: "rect", id: uid(), kind: raw.kind === "common" ? "common" : "rentable",
        x, y, width: w, height: h, label: typeof raw.label === "string" ? raw.label.slice(0, 40) : "",
      })
    } else if (raw.el === "icon") {
      const x = clampW(Number(raw.x), width)
      const y = clampW(Number(raw.y), height)
      const size = Math.max(0.5, Math.min(8, Number(raw.size) || 1.5))
      const allowed = ["stairs", "elevator", "toilet", "kitchen", "parking"] as const
      const ik = (allowed as readonly string[]).includes(raw.icon) ? raw.icon : "parking"
      elements.push({ type: "icon", id: uid(), kind: ik, x, y, size, label: typeof raw.label === "string" ? raw.label.slice(0, 40) : undefined })
    }
  }

  if (elements.length === 0) {
    return NextResponse.json({ error: "AI не сгенерировал элементы — попробуйте ещё раз" }, { status: 502 })
  }

  return NextResponse.json({
    layout: { version: 2, width, height, ceilingHeight: kind === "floor" ? 3 : null, elements },
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  })
}
