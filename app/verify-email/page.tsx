import Link from "next/link"
import { Building, CheckCircle2, AlertCircle } from "lucide-react"
import { confirmEmailChange } from "@/app/actions/my-account"

export const dynamic = "force-dynamic"

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  if (!token) {
    return (
      <Layout>
        <Status type="error" title="Нет токена" message="Ссылка некорректная — токен отсутствует" />
      </Layout>
    )
  }

  const result = await confirmEmailChange(token)

  return (
    <Layout>
      {result.ok ? (
        <Status type="ok" title="Email подтверждён" message={result.message ?? "Готово"} />
      ) : (
        <Status type="error" title="Ошибка" message={result.error} />
      )}
    </Layout>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Commrent</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}

function Status({ type, title, message }: { type: "ok" | "error"; title: string; message: string }) {
  return (
    <div className={`rounded-2xl border p-6 ${type === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
      <div className="flex items-start gap-3">
        {type === "ok"
          ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          : <AlertCircle className="h-6 w-6 text-red-600 shrink-0" />}
        <div className="flex-1">
          <h1 className={`text-lg font-semibold ${type === "ok" ? "text-emerald-900" : "text-red-900"}`}>{title}</h1>
          <p className={`text-sm mt-1 ${type === "ok" ? "text-emerald-800" : "text-red-800"}`}>{message}</p>
          <div className="flex gap-2 mt-4">
            <Link href="/login" className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white">
              Войти
            </Link>
            <Link href="/" className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              На главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
