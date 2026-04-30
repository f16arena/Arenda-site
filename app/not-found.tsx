import Link from "next/link"
import { FileQuestion, Home } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <FileQuestion className="h-7 w-7 text-slate-500 dark:text-slate-400" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Страница не найдена
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Возможно, страница была удалена или у вас нет к ней доступа.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Home className="h-4 w-4" />
          На главную
        </Link>
      </div>
    </div>
  )
}
