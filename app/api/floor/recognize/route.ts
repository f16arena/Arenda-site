import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type RectRoom = {
  shape: "rect"
  name: string
  kind: "rentable" | "common"
  x: number
  y: number
  width: number
  height: number
  area: number | null
}

type PolyRoom = {
  shape: "polygon"
  name: string
  kind: "rentable" | "common"
  points: Array<{ x: number; y: number }>
  area: number | null
}

type Room = RectRoom | PolyRoom

const SYSTEM_PROMPT = `Ты эксперт по архитектурным чертежам, обученный на проектной документации Республики Казахстан и СНГ.

ИСХОДНЫЕ СТАНДАРТЫ:
- ГОСТ 21.501-2018 «СПДС. Правила выполнения архитектурно-строительных рабочих чертежей»
- ГОСТ 21.508-2020 «СПДС. Правила выполнения чертежей зданий и сооружений»
- СН РК 1.02-03-2011 «Состав и оформление проектной документации»
- СН РК 3.02-25-2004 «Жилые здания»
- СН РК 3.02-08-2003 «Общественные здания и сооружения»

═══ УСЛОВНЫЕ ОБОЗНАЧЕНИЯ ═══

СТЕНЫ:
- Толстые красные/тёмные линии по периметру = несущие стены (capacity walls).
- Тонкие чёрные линии внутри здания = перегородки (non-bearing partition walls).
- Малые тёмные/красные квадраты с подписями "0,40 × 0,40" или похожими = колонны.
- Участок стены с двойной/тройной параллельной линией = окно.
- Разрыв в стене с дугой или пунктиром = дверь.

ПОМЕЩЕНИЯ — РАСПОЗНАВАНИЕ:
- Метки помещений ОБЫЧНО синие, в формате "N/X,XX" под чертой:
   * N (числитель, над чертой) = номер помещения (1, 2, 3, 7, 12, 101…)
   * X,XX (знаменатель, под чертой) = реальная площадь в м² ("43,5" = 43.5 м²)
- Запятая в числе — десятичный разделитель (русская нотация). "43,5" = 43.5
- Если в метке только один номер — это номер помещения, площадь = null.
- Если в метке только число с запятой ("14,5") — это площадь, имя = "14,5".
- Если на плане написано "Холл", "Коридор", "WC", "Тамбур", "Кухня", "Тех" — используй это как name и kind="common".

ЧИСЛА — ИХ ЗНАЧЕНИЕ:
- Чёрные цифры на стенах ("5,28" "11,44" "7,98") = длины стен в метрах. НЕ путать с площадями.
- Малые цифры у углов ("0,57" "0,62" "0,40") = размеры колонн или толщина простенка.
- Большие цифры по периметру ("36,55" "16,06" "10,06") = габариты целого здания.
- Красные метки "H=X,XX" (например "H=3,70", "H=3,50") = ВЫСОТА ПОТОЛКА в этой части (м).
- "H=13,50" в углу — это общая высота здания (от земли до конька); НЕ путать с высотой потолка.
- ЗАПОМНИ: высота потолка обычно 2.7–4.5 м. Если "H=" больше 5 — это полная высота здания, игнорируй для ceilingHeight.

ОСИ КООРДИНАТ:
- Буквы (А, Б, В... или а, а1, а2) и цифры по краям = разбивочные оси.
- Игнорируй их при распознавании помещений — это служебная разметка.

═══ ТВОЯ ЗАДАЧА ═══

1. Извлечь все помещения с правильными именами и подписанными площадями.
2. Определить высоту потолка этажа (ceilingHeightMeters) по красной метке H=X,XX.
3. Определить общую ширину здания (buildingWidthMeters) — из периметральных размеров.

═══ ТОЧНОСТЬ ГРАНИЦ ═══

КРИТИЧЕСКИ ВАЖНО — каждая нарисованная фигура ДОЛЖНА совпадать с РЕАЛЬНЫМИ стенами на плане:
- Все 4 края прямоугольника проходят ТОЧНО по внутренней поверхности соответствующей стены.
- НЕ ВЫХОДИ за стены в соседнее помещение или в коридор.
- НЕ оставляй зазоров между фигурой и стенами комнаты.
- Если посчитанная площадь (W × H × масштаб) отличается от подписанной в синей метке более чем на 15% — твоя геометрия неточна, проверь стены ещё раз.

ВЫБОР ФИГУРЫ — RECT vs POLYGON:
- "shape":"rect" — для ИДЕАЛЬНО прямоугольных помещений, у которых все стены ортогональны (горизонтально/вертикально) и углы строго 90°.
- "shape":"polygon" — для ВСЕХ остальных случаев:
   * Г-образные комнаты (с выступом)
   * Комнаты со скошенной стеной (диагональ)
   * Длинные коридоры с поворотами
   * Любая форма, не вписывающаяся точно в прямоугольник
- Полигон — массив вершин по часовой или против часовой стрелки, с вершинами на углах стен.
- ПРАВИЛО: если bounding box больше реальной площади подписанной метки на 15%+ — это polygon, не rect.

ПРИМЕР коридора (room 9 на типовом плане): длинный, с одним выступом справа сверху →
"shape":"polygon", "points":[{"x":0.30,"y":0.30},{"x":0.40,"y":0.30},{"x":0.40,"y":0.36},{"x":0.45,"y":0.36},{"x":0.45,"y":0.70},{"x":0.30,"y":0.70}]

Если ты НЕ ВИДИШЬ чётко стены — лучше пропусти помещение, чем рисуй наугад.

═══ ЧТО НЕ ВКЛЮЧАТЬ ═══

- Колонны, двери, окна, лестницы как ОТДЕЛЬНЫЕ элементы (только лестничные клетки как комнаты с kind="common").
- Размерные линии, выноски, штампы.
- Площади за пределами стен здания.

═══ КООРДИНАТЫ И KIND ═══

- В долях [0..1] относительно всей картинки. (0,0) = левый верх.
- "rentable" — помещения с номером (1, 2, 3, 101…), офисы, кабинеты, магазины.
- "common" — коридоры, холлы, лестницы (помещение со ступенями), санузлы, кухни, тех. помещения.
- Большое центральное вытянутое помещение через которое проходят к остальным = коридор (common).

═══ МАСШТАБ ЗДАНИЯ ═══

- "buildingWidthMeters": ширина по горизонтали из dimension labels периметра.
- Если значение явно в мм (большое число без запятой типа "5280") → переведи в метры (5.28).
- Если labels не читаются — верни null.

═══ ФОРМАТ ОТВЕТА (СТРОГО только JSON, без markdown) ═══

Каждая комната — объект с полем "shape": "rect" или "polygon".

Для прямоугольных:
{"shape":"rect","name":"6","area":43.5,"kind":"rentable","x":0.45,"y":0.07,"width":0.18,"height":0.13}

Для произвольных форм:
{"shape":"polygon","name":"9","area":109.0,"kind":"common","points":[
  {"x":0.30,"y":0.30},{"x":0.40,"y":0.30},{"x":0.40,"y":0.36},
  {"x":0.45,"y":0.36},{"x":0.45,"y":0.70},{"x":0.30,"y":0.70}
]}

ОБЩИЙ ОТВЕТ:
{
  "buildingWidthMeters": 36.55,
  "ceilingHeightMeters": 3.5,
  "rooms": [<rect или polygon объекты>]
}

КРИТИЧЕСКИЕ ПРАВИЛА:
- "area" ВСЕГДА = число из синей метки на плане (м²). Не считай сам.
- Если у комнаты нет метки площади → "area": null.
- Высоты потолка нет → "ceilingHeightMeters": null.
- Координаты ВСЕГДА в долях [0..1] относительно всей картинки.
- Полигон должен быть простым (без самопересечений) и иметь минимум 3 вершины.
- Перед каждой комнатой подумай: реально ли её стены ортогональны? Если есть скос, выступ или поворот — используй polygon.`

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
  }.

ВАЖНО: Твой ответ должен быть СТРОГО ОДНИМ JSON-объектом, и ничем больше:
- Никакого вступительного текста ("Вот результат...", "Я распознал...").
- Никаких markdown-обёрток (\`\`\`json и \`\`\`).
- Никаких объяснений или комментариев.
- Никакого финального текста после JSON.
- ПЕРВЫЙ символ ответа должен быть {. ПОСЛЕДНИЙ символ — }.

Внутри JSON допустимо использовать только структуру из системной инструкции.`

  const client = new Anthropic({ apiKey })

  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      // Sonnet 4.6 — заметно точнее в распознавании геометрии чертежей,
      // ~$0.01 за PDF (всё ещё дёшево).
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
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

  // Извлекаем первый сбалансированный JSON-объект из ответа модели.
  // Учитываем строки и эскейпы чтобы не сбиться на { внутри строк.
  function extractJsonObject(text: string): string | null {
    const trimmed = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")
    const start = trimmed.indexOf("{")
    if (start < 0) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (escape) { escape = false; continue }
      if (ch === "\\") { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) return trimmed.slice(start, i + 1)
      }
    }
    return null
  }

  const jsonText = extractJsonObject(textBlock.text)
  let parsed: { rooms?: unknown }
  if (!jsonText) {
    return NextResponse.json(
      {
        error: "AI не вернул JSON-объект",
        raw: textBlock.text.slice(0, 500),
      },
      { status: 502 },
    )
  }
  try {
    parsed = JSON.parse(jsonText)
  } catch (parseErr) {
    return NextResponse.json(
      {
        error: "AI вернул не валидный JSON",
        raw: textBlock.text.slice(0, 500),
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
      },
      { status: 502 },
    )
  }

  if (!parsed.rooms || !Array.isArray(parsed.rooms)) {
    return NextResponse.json({ error: "В ответе нет массива rooms" }, { status: 502 })
  }

  // Валидация и нормализация
  const rooms: Room[] = []
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  for (const r of parsed.rooms) {
    if (!r || typeof r !== "object") continue
    const obj = r as Record<string, unknown>
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 40) : ""
    const kind = obj.kind === "common" ? "common" : "rentable"

    // Площадь из синей метки на плане
    const rawArea = obj.area
    const area =
      typeof rawArea === "number" && Number.isFinite(rawArea) && rawArea > 0 && rawArea < 100000
        ? Math.round(rawArea * 10) / 10
        : null

    const shapeField = obj.shape
    const isPolygon = shapeField === "polygon" || Array.isArray(obj.points)

    if (isPolygon) {
      const rawPoints = obj.points
      if (!Array.isArray(rawPoints) || rawPoints.length < 3) continue
      const points: Array<{ x: number; y: number }> = []
      for (const p of rawPoints) {
        if (!p || typeof p !== "object") continue
        const pp = p as Record<string, unknown>
        const px = typeof pp.x === "number" ? pp.x : NaN
        const py = typeof pp.y === "number" ? pp.y : NaN
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue
        points.push({ x: clamp01(px), y: clamp01(py) })
      }
      if (points.length < 3) continue
      rooms.push({ shape: "polygon", name, kind, points, area })
    } else {
      const x = typeof obj.x === "number" ? obj.x : NaN
      const y = typeof obj.y === "number" ? obj.y : NaN
      const w = typeof obj.width === "number" ? obj.width : NaN
      const h = typeof obj.height === "number" ? obj.height : NaN
      if ([x, y, w, h].some((v) => !Number.isFinite(v))) continue
      if (w <= 0 || h <= 0) continue
      const cx = clamp01(x)
      const cy = clamp01(y)
      const cw = Math.max(0, Math.min(1 - cx, w))
      const ch = Math.max(0, Math.min(1 - cy, h))
      if (cw < 0.01 || ch < 0.01) continue
      rooms.push({ shape: "rect", name, kind, x: cx, y: cy, width: cw, height: ch, area })
    }
  }

  // Парсим определённую AI ширину здания
  const rawWidth = (parsed as { buildingWidthMeters?: unknown }).buildingWidthMeters
  const buildingWidthMeters =
    typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth > 0.5 && rawWidth < 1000
      ? Math.round(rawWidth * 10) / 10
      : null

  // Высота потолка (ceilingHeightMeters). Должна быть в диапазоне 2.0–6.0 м
  // (типовая высота этажа). Если AI вернул что-то вне диапазона (например 13.5 —
  // это была общая высота здания) — игнорируем.
  const rawCeil = (parsed as { ceilingHeightMeters?: unknown }).ceilingHeightMeters
  const ceilingHeightMeters =
    typeof rawCeil === "number" && Number.isFinite(rawCeil) && rawCeil >= 2.0 && rawCeil <= 6.0
      ? Math.round(rawCeil * 100) / 100
      : null

  return NextResponse.json({
    rooms,
    buildingWidthMeters,
    ceilingHeightMeters,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  })
}
