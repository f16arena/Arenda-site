"use client"

import { useState, useEffect, ReactNode } from "react"
import { Menu, X } from "lucide-react"

export function MobileShell({ sidebar, header, children }: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  // Закрывать drawer при resize в desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 z-50">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6 gap-3">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden text-slate-600 hover:text-slate-900"
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </button>
          {header}
        </header>
        <main className="flex-1 overflow-y-auto p-3 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
