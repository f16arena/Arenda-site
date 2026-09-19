"use client"

// Публичные страницы (вход, регистрация, бронь, подписание договора, правовые,
// блог) свёрстаны в светлой теме. В тёмной получались тёмные карточки на
// светлом фоне. Здесь тема всегда светлая; при уходе в кабинет — восстанавливаем.
import { useEffect } from "react"

export function ForceLight() {
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains("dark")
    root.classList.remove("dark")
    root.style.colorScheme = "light"
    return () => {
      if (wasDark) {
        root.classList.add("dark")
        root.style.colorScheme = "dark"
      }
    }
  }, [])
  return null
}
