import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Room = {
  name: string
  kind: "rentable" | "common"
  x: number
  y: number
  width: number
  height: number
}

const SYSTEM_PROMPT = `Ты помогаешь разметить план этажа коммерческого здания.
Извлекай помещения как ПРЯМОУГОЛЬНИКИ, точно по их стенам, и определи масштаб плана.

ОЧЕНЬ ВАЖНО — ТОЧНОСТЬ ПРЯМОУГОЛЬНИКОВ:
- Каждый прямоугольник должен ИДЕАЛЬНО ВПИСЫВАТЬСЯ во внутренние стены помещения.
- Левый край прямоугольника = внутренняя поверхность левой стены комнаты.
- Правый край = внутренняя поверхность правой стены. То же для top/bottom.
- НЕ оставляй большие зазоры между прямоугольником и стенами комнаты.
- НЕ выходи за пределы стен комнаты в соседние помещения или в коридор.
- Если комната не прямоугольная (Г-образная, со скосом) — впиши прямоугольник по самой большой части, чтобы он не выходил за стены.
- Игнорируй текст внутри комнаты (номера, размеры) — он не определяет границы.

ЧТО ЭТО ЗА ЭЛЕМЕНТЫ:
- "kind":"rentable" — офисы, кабинеты, магазины, переговорки, помещения с номером (101, 102…).
- "kind":"common" — коридоры, холлы, лестницы, лифты, санузлы (WC), тех. помещения, кухни.
- "name": номер кабинета или короткое имя ("101", "Коридор", "WC", "Лестница", "Холл", "Тех").

ЧТО НЕ ВКЛЮЧАТЬ:
- Двери, окна, мебель, текст с размерами (5,28 / 11,44 / etc), стены сами по себе.
- Размерные линии, ведущие наружу плана.
- Площади за пределами здания (улица, парковка, газон).

КООРДИНАТЫ:
- В долях [0..1] относительно ВСЕЙ КАРТИНКИ (включая поля/штамп если они есть).
- (0,0) — левый верхний угол изображения. (1,1) — правый нижний.
- x = левая граница, y = верхняя граница, width/height — размеры прямоугольника.

МАСШТАБ:
- "buildingWidthMeters": общая ширина здания на плане в метрах (по горизонтали). Извлеки из dimension labels (цифры "5,28", "11,44", "29,9" — они почти всегда в метрах). Сложи горизонтальные размеры по верхней или нижней оси.
- Если labels не читаются — верни null.
- Если значение в мм (например "5280" — большое число без запятой) → переведи в метры (5,28).

ФОРМАТ ОТВЕТА (СТРОГО только JSON, без markdown, без комментариев):
{"buildingWidthMeters":17.8,"rooms":[{"name":"101","kind":"rentable","x":0.1,"y":0.2,"width":0.15,"height":0.2}]}`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  await requireOrgAccess()

  // Rate limit: 10 распознаваний в час с одного пользователя — защита от перерасхода
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `recognize:${session.user.id}`), {
    max: 10,
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
      {
        error:
          "AI-распознавание не настроено. Администратор должен добавить ANTHROPIC_API_KEY в переменные окружения Vercel.",
      },
      { status: 503 },
    )
  }

  let body: { imageDataUrl?: string; floorName?: string; floorNumber?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const dataUrl = body.imageDataUrl
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Ожидался data URL изображения" }, { status: 400 })
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/)
  if (!match) {
    return NextResponse.json({ error: "Неподдерживаемый формат изображения" }, { status: 400 })
  }
  const mediaType = match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  const base64 = match[2]

  // Anthropic ограничивает картинки до ~5 МБ в base64
  if (base64.length > 6_500_000) {
    return NextResponse.json(
      { error: "Изображение слишком большое (макс ~5 МБ)" },
      { status: 413 },
    )
  }

  const userText = `На картинке план этажа${body.floorName ? ` «${body.floorName}»` : ""}${
    body.floorNumber !== undefined ? ` (этаж ${body.floorNumber})` : ""
  }. Верни JSON со всеми помещениями строго по системной инструкции.`

  const client = new Anthropic({ apiKey })

  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      // Sonnet 4.6 — заметно точнее в распознавании геометрии чертежей,
      // ~$0.01 за PDF (всё ещё дёшево).
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI-сервис недоступен"
    return NextResponse.json({ error: `Ошибка AI: ${msg}` }, { status: 502 })
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "AI не вернул текст" }, { status: 502 })
  }

  // Подчищаем возможные markdown-обёртки
  const cleaned = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

  let parsed: { rooms?: unknown }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json(
      { error: "AI вернул не валидный JSON", raw: textBlock.text.slice(0, 300) },
      { status: 502 },
    )
  }

  if (!parsed.rooms || !Array.isArray(parsed.rooms)) {
    return NextResponse.json({ error: "В ответе нет массива rooms" }, { status: 502 })
  }

  // Валидация и нормализация
  const rooms: Room[] = []
  for (const r of parsed.rooms) {
    if (!r || typeof r !== "object") continue
    const obj = r as Record<string, unknown>
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 40) : ""
    const kind = obj.kind === "common" ? "common" : "rentable"
    const x = typeof obj.x === "number" ? obj.x : NaN
    const y = typeof obj.y === "number" ? obj.y : NaN
    const w = typeof obj.width === "number" ? obj.width : NaN
    const h = typeof obj.height === "number" ? obj.height : NaN
    if ([x, y, w, h].some((v) => !Number.isFinite(v))) continue
    if (w <= 0 || h <= 0) continue
    // Зажимаем в [0..1] и режем выходящие части
    const cx = Math.max(0, Math.min(1, x))
    const cy = Math.max(0, Math.min(1, y))
    const cw = Math.max(0, Math.min(1 - cx, w))
    const ch = Math.max(0, Math.min(1 - cy, h))
    if (cw < 0.01 || ch < 0.01) continue
    rooms.push({ name, kind, x: cx, y: cy, width: cw, height: ch })
  }

  // Парсим определённую AI ширину здания (если доступна)
  const rawWidth = (parsed as { buildingWidthMeters?: unknown }).buildingWidthMeters
  const buildingWidthMeters =
    typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth > 0.5 && rawWidth < 1000
      ? Math.round(rawWidth * 10) / 10
      : null

  return NextResponse.json({
    rooms,
    buildingWidthMeters,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  })
}
