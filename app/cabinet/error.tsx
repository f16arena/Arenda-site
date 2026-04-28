"use client"

import { AlertCircle, RotateCcw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertCircle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Что-то пошло не так</h2>
        <p className="mt-2 text-sm text-slate-500">
          {error.message || "Не удалось загрузить страницу"}
        </p>
        <button
          onClick={reset}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          Попробовать снова
        </button>
      </div>
    </div>
  )
}
