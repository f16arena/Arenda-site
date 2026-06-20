import type { ReactNode } from "react"
import Link from "next/link"

// Простой светлый layout для раздела статей (вне дизайна лендинга): шапка с лого
// и кнопкой, читаемая колонка контента, футер с возвратом на главную.
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/commrent-logo-navbar.png" alt="Commrent" className="h-7 w-auto" />
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Попробовать
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">{children}</main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <span>© Commrent — автоматизация коммерческой аренды в Казахстане</span>
          <Link href="/" className="text-slate-700 hover:underline">
            На главную
          </Link>
        </div>
      </footer>
    </div>
  )
}
