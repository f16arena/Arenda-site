"use client"

import { AlertCircle, RotateCcw, Home } from "lucide-react"
import { useEffect } from "react"
import Link from "next/link"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global/error]", {
      message: error.message,
      digest: error.digest,
    })
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center max-w-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Что-то пошло не так
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {error.message || "Произошла непредвиденная ошибка"}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Код: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Попробовать снова
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <Home className="h-4 w-4" />
            На главную
          </Link>
        </div>
      </div>
    </div>
  )
}
