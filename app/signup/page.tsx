import { ForceLight } from "@/components/force-light"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Check, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { SignupForm } from "./signup-form"
import { I18nProvider } from "@/lib/i18n/client"
import { LocaleSwitcher } from "@/components/i18n/locale-switcher"
import { getLocale, getT } from "@/lib/i18n/server"
import { dictionaries, pickNamespaces } from "@/lib/i18n/messages"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("auth.signup.metaTitle"),
    description: t("auth.signup.metaDescription"),
  }
}

export default async function SignupPage() {
  const locale = await getLocale()
  const { t } = await getT(locale)
  const session = await auth()
  if (session?.user) {
    // Уже залогинен — отправим на login (он сам разрулит куда дальше)
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <ForceLight />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center" aria-label="Commrent.kz">
            <Image
              src="/commrent-logo-navbar.png"
              alt="Commrent.kz"
              width={214}
              height={75}
              priority
              className="h-11 w-auto object-contain"
            />
          </Link>
          {/* Язык нужен до заполнения формы: человек должен читать условия
              регистрации на своём языке, а не после. */}
          <div className="flex items-center gap-3">
            <I18nProvider
              locale={locale}
              messages={pickNamespaces(dictionaries[locale], ["common"])}
            >
              <LocaleSwitcher />
            </I18nProvider>
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              {t("auth.signup.haveAccount")}{" "}
              <span className="font-medium text-blue-600">{t("auth.signup.login")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.signup.toHome")}
        </Link>

        <div className="grid lg:grid-cols-[1fr_360px] gap-10">
          {/* Форма */}
          <Card className="block p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">{t("auth.signup.title")}</h1>
              <p className="text-sm text-slate-500 mt-1">{t("auth.signup.subtitle")}</p>
            </div>
            <I18nProvider
              locale={locale}
              messages={pickNamespaces(dictionaries[locale], ["common", "auth"])}
            >
              <SignupForm />
            </I18nProvider>
          </Card>

          {/* Что внутри триала */}
          <aside className="space-y-4">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">{t("auth.signup.trialTitle")}</p>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {[
                  t("auth.signup.trial.scale"),
                  t("auth.signup.trial.documents"),
                  t("auth.signup.trial.import"),
                  t("auth.signup.trial.telegram"),
                  t("auth.signup.trial.export"),
                  t("auth.signup.trial.finance"),
                ].map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600 mt-4 pt-4 border-t border-blue-200">
                {t("auth.signup.trialFooter")}
              </p>
            </div>

            <Card className="block p-5">
              <p className="text-sm font-semibold text-slate-900 mb-2">{t("auth.signup.nextTitle")}</p>
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>
                  {t("auth.signup.next.subdomain", { example: "your.commrent.kz" })}
                </li>
                <li>{t("auth.signup.next.wizard")}</li>
                <li>{t("auth.signup.next.import")}</li>
                <li>{t("auth.signup.next.ready")}</li>
              </ol>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}
