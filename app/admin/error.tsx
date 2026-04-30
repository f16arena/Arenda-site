"use client"

import { AlertCircle, RotateCcw, Home } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()

  useEffect(() => {
    console.error("[admin/error]", {
      pathname,
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error, pathname])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Что-то пошло не так</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {error.message || "Не удалось загрузить страницу"}
        </p>
        <div className="mt-3 space-y-1">
          <p className="text-xs text-slate-400 dark:text-slate-500">Страница: <span className="font-mono">{pathname}</span></p>
          {error.digest && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Код: <span className="font-mono">{error.digest}</span></p>
          )}
        </div>
        <div className="mt-5 flex gap-2 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Попробовать снова
          </button>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          >
            <Home className="h-4 w-4" />
            На главную
          </Link>
        </div>
      </div>
    </div>
  )
}
