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
