"use client"

import { AlertCircle, RotateCcw, Home } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import Link from "next/link"
import { reportClientError } from "@/lib/client-error-report"
import { formatErrorId } from "@/lib/error-id"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const errorId = useMemo(() => formatErrorId(error.digest), [error.digest])
  const isDev = process.env.NODE_ENV !== "production"

  useEffect(() => {
    reportClientError({ errorId, source: "global/error", pathname, error })
  }, [error, errorId, pathname])

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
          Мы записали ошибку. Сообщите поддержке код ниже, чтобы быстрее найти причину.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Ошибка <span className="font-mono">#{errorId}</span>
        </p>
        {isDev && error.message && (
          <p className="mt-2 break-words text-xs text-slate-400 dark:text-slate-500">
            {error.message}
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
