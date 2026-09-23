import { ForceLight } from "@/components/force-light"
import Link from "next/link"
import { Building, AlertCircle } from "lucide-react"
import { db } from "@/lib/db"
import { Card } from "@/components/ui/card"
import { ResetPasswordForm } from "./reset-password-form"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale, getT } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const locale = await getLocale()
  const { t } = await getT(locale)

  // Сразу проверяем токен на сервере — если плохой, не показываем форму.
  let validationError: string | null = null
  if (!token) {
    validationError = t("auth.resetPassword.noToken")
  } else {
    const row = await db.verificationToken.findUnique({
      where: { token },
      select: { type: true, usedAt: true, expiresAt: true, userId: true },
    }).catch(() => null)

    if (!row) validationError = t("auth.resetPassword.tokenNotFound")
    else if (row.usedAt) validationError = t("auth.resetPassword.tokenUsed")
    else if (row.expiresAt < new Date())
      validationError = t("auth.resetPassword.tokenExpired")
    else if (row.type !== "PASSWORD_RESET")
      validationError = t("auth.resetPassword.tokenWrongType")
    else if (!row.userId) validationError = t("auth.resetPassword.tokenNoUser")
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <ForceLight />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center">
              <Building className="h-6 w-6 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">{t("auth.resetPassword.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.resetPassword.subtitle")}</p>
        </div>

        <Card className="block p-6">
          {validationError ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">{t("auth.resetPassword.linkInvalid")}</p>
                    <p className="text-xs text-red-800 mt-1">{validationError}</p>
                  </div>
                </div>
              </div>
              <Link
                href="/forgot-password"
                className="block w-full rounded-lg bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-semibold text-white text-center"
              >
                {t("auth.resetPassword.requestNew")}
              </Link>
            </div>
          ) : (
            <I18nProvider
            locale={locale}
            messages={pickNamespaces(dictionaries[locale], ["common", "auth"])}
          >
            <ResetPasswordForm token={token!} />
          </I18nProvider>
          )}
        </Card>

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            {t("auth.resetPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  )
}
