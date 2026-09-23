import { ForceLight } from "@/components/force-light"
import Link from "next/link"
import { Building } from "lucide-react"
import { Card } from "@/components/ui/card"
import { ForgotPasswordForm } from "./forgot-password-form"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale, getT } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

export const dynamic = "force-dynamic"

export default async function ForgotPasswordPage() {
  const locale = await getLocale()
  const { t } = await getT(locale)
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
          <h1 className="text-2xl font-bold text-slate-900 mt-4">
            {t("auth.forgotPassword.title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.forgotPassword.subtitle")}</p>
        </div>

        <Card className="block p-6">
          <I18nProvider
            locale={locale}
            messages={pickNamespaces(dictionaries[locale], ["common", "auth"])}
          >
            <ForgotPasswordForm />
          </I18nProvider>
        </Card>

        <p className="text-center text-sm text-slate-500 mt-4">
          {t("auth.forgotPassword.remembered")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            {t("auth.forgotPassword.login")}
          </Link>
        </p>
      </div>
    </div>
  )
}
