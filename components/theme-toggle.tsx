"use client"

import { useState, useEffect } from "react"
import { Sun, Moon, Monitor } from "lucide-react"

type Theme = "light" | "dark" | "system"

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", dark)
  } else {
    root.classList.toggle("dark", theme === "dark")
  }
}

/** Мини-инициализатор — встраивается в <head> чтобы избежать flash. */
export const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as Theme | null
    setTheme(stored ?? "system")
    setMounted(true)
  }, [])

  // Реакция на смену системной темы (только при theme=system)
  useEffect(() => {
    if (theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [theme])

  function change(next: Theme) {
    setTheme(next)
    try {
      localStorage.setItem("theme", next)
    } catch {}
    applyTheme(next)
  }

  if (!mounted) return null

  const items: { value: Theme; icon: React.ElementType; label: string }[] = [
    { value: "light", icon: Sun, label: "Светлая" },
    { value: "system", icon: Monitor, label: "Системная" },
    { value: "dark", icon: Moon, label: "Тёмная" },
  ]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Тема оформления</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          Сохраняется в браузере
        </p>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2">
        {items.map((item) => {
          const Icon = item.icon
          const active = theme === item.value
          return (
            <button
              key={item.value}
              onClick={() => change(item.value)}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-3 transition ${
                active
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                  : "border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 dark:text-slate-500"}`} />
              <span className={`text-xs font-medium ${active ? "text-blue-900 dark:text-blue-200 dark:text-blue-100" : "text-slate-700 dark:text-slate-300"}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
