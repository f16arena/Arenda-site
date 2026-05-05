"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertCircle, RotateCcw } from "lucide-react"
import { reportClientError } from "@/lib/client-error-report"
import { formatErrorId } from "@/lib/error-id"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const errorId = useMemo(() => formatErrorId(error.digest), [error.digest])
  const pathname = usePathname()
  const isDev = process.env.NODE_ENV !== "production"

  useEffect(() => {
    reportClientError({ errorId, source: "app/global-error", pathname, error })
  }, [error, errorId, pathname])

  return (
    <html lang="ru">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
          <div className="max-w-lg text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-7 w-7 text-red-300" />
            </div>
            <h1 className="mt-5 text-xl font-semibold">Что-то пошло не так</h1>
            <p className="mt-2 text-sm text-slate-400">
              Мы записали ошибку в журнал поддержки. Сообщите код ниже, чтобы быстро найти причину.
            </p>
            <p className="mt-3 text-sm">
              Ошибка <span className="font-mono text-red-200">#{errorId}</span>
            </p>
            {pathname && (
              <p className="mt-1 text-xs text-slate-500">
                Страница: <span className="font-mono">{pathname}</span>
              </p>
            )}
            {isDev && error.message && (
              <p className="mt-2 break-words text-xs text-slate-500">{error.message}</p>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200"
              >
                <RotateCcw className="h-4 w-4" />
                Попробовать снова
              </button>
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
              >
                На главную
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
