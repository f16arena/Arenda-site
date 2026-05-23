import Link from "next/link"
import { Building, AlertCircle } from "lucide-react"
import { db } from "@/lib/db"
import { ResetPasswordForm } from "./reset-password-form"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  // Сразу проверяем токен на сервере — если плохой, не показываем форму.
  let validationError: string | null = null
  if (!token) {
    validationError = "Ссылка некорректная — токен отсутствует"
  } else {
    const t = await db.verificationToken.findUnique({
      where: { token },
      select: { type: true, usedAt: true, expiresAt: true, userId: true },
    }).catch(() => null)

    if (!t) validationError = "Токен не найден. Возможно, ссылка повреждена."
    else if (t.usedAt) validationError = "Ссылка уже использована. Запросите сброс пароля заново."
    else if (t.expiresAt < new Date()) validationError = "Срок действия ссылки истёк. Запросите сброс пароля заново."
    else if (t.type !== "PASSWORD_RESET") validationError = "Неверный тип токена."
    else if (!t.userId) validationError = "Токен не привязан к пользователю."
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center">
              <Building className="h-6 w-6 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">Новый пароль</h1>
          <p className="text-sm text-slate-500 mt-1">Установите новый пароль для входа</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {validationError ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Ссылка недействительна</p>
                    <p className="text-xs text-red-800 mt-1">{validationError}</p>
                  </div>
                </div>
              </div>
              <Link
                href="/forgot-password"
                className="block w-full rounded-lg bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-semibold text-white text-center"
              >
                Запросить новую ссылку
              </Link>
            </div>
          ) : (
            <ResetPasswordForm token={token!} />
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Вернуться ко входу
          </Link>
        </p>
      </div>
    </div>
  )
}
