// Кладёт воркер pdf.js в public/, чтобы он грузился со своего домена.
// Кросс-ориджин Worker браузер запрещает, и pdf.js молча падал в «fake worker»
// на главном потоке — парсинг и декод JPEG шли рядом с рендер-циклом Babylon.
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")
const dst = join(process.cwd(), "public", "pdf.worker.min.mjs")
mkdirSync(dirname(dst), { recursive: true })
copyFileSync(src, dst)
console.log("pdf.js worker →", dst)
