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

const ICONS: Record<Theme, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const LABELS: Record<Theme, string> = {
  light: "Светлая",
  dark: "Тёмная",
  system: "Системная",
}

const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
}

/**
 * Компактная иконка-переключатель темы для шапки.
 * Один клик — циклически переключает: light → dark → system → light.
 */
export function ThemeIconToggle() {
  const [theme, setTheme] = useState<Theme>("system")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as Theme | null
      setTheme(stored ?? "system")
      setMounted(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [theme])

  function cycle() {
    const next = NEXT[theme]
    setTheme(next)
    try {
      localStorage.setItem("theme", next)
    } catch {}
    applyTheme(next)
  }

  if (!mounted) {
    // Скелетон чтобы не было сдвига разметки
    return <div className="h-8 w-8" />
  }

  const Icon = ICONS[theme]

  return (
    <button
      onClick={cycle}
      title={`Тема: ${LABELS[theme]}. Клик — следующая.`}
      aria-label={`Переключить тему. Сейчас: ${LABELS[theme]}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
