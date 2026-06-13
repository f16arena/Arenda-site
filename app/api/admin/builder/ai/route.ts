import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { headers } from "next/headers"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { BuildingSpecSchema, BUILDING_SPEC_JSONSCHEMA, buildDocFromSpec } from "@/lib/builder/ai-compile"
import { parseDocument } from "@/types/builder"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const SYSTEM_PROMPT = `Ты — архитектор-планировщик коммерческой недвижимости (Казахстан/СНГ).
По текстовому запросу пользователя верни СТРОГО JSON-объект BuildingSpec (без прозы):
- floors: число надземных этажей (1–10).
- widthM/depthM: габариты здания в метрах (разумные для типа: офис/ТЦ/клуб/кафе).
- cols/rows: на сколько колонок и рядов делить план перегородками (сетка помещений).
- facade: материал фасада (plaster_white | brick | concrete | glass | block).
- roof: тип кровли (flat | gable).
- parking: число парковочных мест (0–40).
- basement: есть ли цоколь/подземный уровень.
Подбирай значения осмысленно под запрос. Только JSON по схеме.`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  if (session.user.role === "TENANT") return NextResponse.json({ error: "Запрещено" }, { status: 403 })
  await requireOrgAccess()

  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `builder-ai:${session.user.id}`), { max: 20, window: 60 * 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: `Слишком много запросов. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.` }, { status: 429 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: "AI не настроен (нет ANTHROPIC_API_KEY)." }, { status: 503 })

  let body: { prompt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }
  const prompt = (body.prompt ?? "").toString().slice(0, 2000).trim()
  if (!prompt) return NextResponse.json({ error: "Пустой запрос" }, { status: 400 })

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: BUILDING_SPEC_JSONSCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    })
  } catch (e) {
    return NextResponse.json({ error: `Ошибка AI: ${e instanceof Error ? e.message : "сервис недоступен"}` }, { status: 502 })
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") return NextResponse.json({ error: "AI не вернул ответ" }, { status: 502 })

  try {
    const spec = BuildingSpecSchema.parse(JSON.parse(textBlock.text))
    const doc = parseDocument(buildDocFromSpec(spec))
    return NextResponse.json({ doc, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } })
  } catch (e) {
    return NextResponse.json({ error: `Не удалось собрать здание: ${e instanceof Error ? e.message : "невалидный ответ"}` }, { status: 502 })
  }
}
