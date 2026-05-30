import "server-only"

// Конвертация DOCX → PDF на отдельном VPS (LibreOffice/Gotenberg), как NCANode:
// наружу через Caddy с секретным заголовком. Прод-PDF для арендатора (1:1 с DOCX).
//
// ENV:
//   PDF_CONVERT_URL    — полный URL эндпоинта конвертации
//                        (Gotenberg: https://pdf.commrent.kz/forms/libreoffice/convert)
//   PDF_CONVERT_SECRET — значение заголовка X-Convert-Secret (проверяет Caddy)
//   PDF_CONVERT_FIELD  — имя поля файла (по умолчанию "files" — формат Gotenberg)

const CONVERT_URL = process.env.PDF_CONVERT_URL || ""
const CONVERT_SECRET = process.env.PDF_CONVERT_SECRET || ""
const FILE_FIELD = process.env.PDF_CONVERT_FIELD || "files"

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export function pdfConvertConfigured(): boolean {
  return !!CONVERT_URL
}

/**
 * Конвертирует DOCX (Buffer) в PDF (Buffer) через внешний LibreOffice-сервис.
 * Бросает понятную ошибку, если сервис не настроен/недоступен.
 */
export async function convertDocxToPdf(docx: Buffer, fileName = "document.docx"): Promise<Buffer> {
  if (!CONVERT_URL) throw new Error("PDF-сервис не настроен (PDF_CONVERT_URL не задан)")

  const form = new FormData()
  form.append(FILE_FIELD, new Blob([new Uint8Array(docx)], { type: DOCX_MIME }), fileName)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(CONVERT_URL, {
      method: "POST",
      headers: CONVERT_SECRET ? { "X-Convert-Secret": CONVERT_SECRET } : {},
      body: form,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Конвертер PDF вернул HTTP ${res.status}${text ? ": " + text.slice(0, 160) : ""}`)
    }
    const arr = await res.arrayBuffer()
    const out = Buffer.from(arr)
    if (out.length < 100 || out.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new Error("Конвертер вернул не PDF")
    }
    return out
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    throw new Error(aborted ? "PDF-сервис не ответил вовремя (timeout)" : (e instanceof Error ? e.message : "Ошибка конвертации PDF"))
  } finally {
    clearTimeout(timer)
  }
}
