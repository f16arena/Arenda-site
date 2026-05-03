"use client"

import { AlertCircle, RotateCcw } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import { reportClientError } from "@/lib/client-error-report"
import { formatErrorId } from "@/lib/error-id"

export default function Error({
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
    reportClientError({ errorId, source: "cabinet/error", pathname, error })
  }, [error, errorId, pathname])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Что-то пошло не так</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Мы записали ошибку. Сообщите администратору код ниже.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Ошибка <span className="font-mono">#{errorId}</span>
        </p>
        {isDev && error.message && (
          <p className="mt-2 break-words text-xs text-slate-400 dark:text-slate-500">
            {error.message}
          </p>
        )}
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
