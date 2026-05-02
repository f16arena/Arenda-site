"use client"

// Утилиты для конвертации PDF и изображений в data-URL подложки.
// Используются в редакторе плана этажа.

type PdfModule = typeof import("pdfjs-dist")
let _pdfjs: PdfModule | null = null

async function getPdfjs(): Promise<PdfModule> {
  if (_pdfjs) return _pdfjs
  const pdfjs = await import("pdfjs-dist")
  // pdfjs-dist v4 поставляет worker как .mjs. Загружаем его с CDN, чтобы не возиться с настройками турбопака.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  _pdfjs = pdfjs
  return pdfjs
}

export type RenderedPlan = {
  dataUrl: string
  widthPx: number
  heightPx: number
  source: "pdf" | "image"
  numPages?: number
}

/**
 * Отрендерить первую страницу PDF в PNG data-URL с разрешением, пригодным для подложки.
 * scale=2 — даёт примерно 2× относительно оригинальных point'ов PDF (≈ 144 DPI).
 */
export async function renderPdfFirstPage(file: File, scale = 2): Promise<RenderedPlan> {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D недоступен в этом браузере")

  await page.render({ canvasContext: ctx, viewport }).promise

  const dataUrl = canvas.toDataURL("image/png")
  return {
    dataUrl,
    widthPx: canvas.width,
    heightPx: canvas.height,
    source: "pdf",
    numPages: pdf.numPages,
  }
}

/**
 * Загрузить картинку как data-URL и вернуть её натуральные размеры в пикселях.
 */
export async function loadImageWithDimensions(file: File): Promise<RenderedPlan> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })

  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error("Не удалось загрузить картинку"))
    img.src = dataUrl
  })

  return {
    dataUrl,
    widthPx: dims.w,
    heightPx: dims.h,
    source: "image",
  }
}

/**
 * Универсальная загрузка: автоматически определяет PDF vs изображение по mime/расширению.
 */
export async function loadPlanFile(file: File): Promise<RenderedPlan> {
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  if (isPdf) return renderPdfFirstPage(file)
  if (file.type.startsWith("image/")) return loadImageWithDimensions(file)
  throw new Error("Поддерживаются PDF и изображения (PNG / JPG / SVG)")
}

/**
 * Сжать data-URL картинки до приемлемого размера для отправки в API.
 * Vercel ограничивает тело запроса ~4.5 МБ; base64 даёт +33% оверхеда,
 * поэтому целимся в ~2 МБ исходного бинаря (≈ 2.7 МБ base64).
 *
 * Стратегия:
 *   1. Уменьшаем большую сторону до maxDim
 *   2. Перекодируем в JPEG с заданным quality
 *   3. Если всё равно >2 МБ — снижаем quality до 0.6 шагами по 0.1
 */
export async function compressDataUrl(
  dataUrl: string,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<string> {
  const maxDim = opts.maxDim ?? 1800
  const initialQuality = opts.quality ?? 0.85

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("Не удалось декодировать картинку для сжатия"))
    i.src = dataUrl
  })

  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const ratio = longest > maxDim ? maxDim / longest : 1
  const w = Math.round(img.naturalWidth * ratio)
  const h = Math.round(img.naturalHeight * ratio)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D недоступен")
  // Белая подложка чтобы PNG с прозрачностью не стал чёрным после JPEG
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  let q = initialQuality
  let out = canvas.toDataURL("image/jpeg", q)
  // Целимся в ~2.7 МБ base64 (= ~2 МБ бинаря) с запасом на структуру JSON
  while (out.length > 2_700_000 && q > 0.6) {
    q = Math.round((q - 0.1) * 100) / 100
    out = canvas.toDataURL("image/jpeg", q)
  }
  return out
}
