"use client"

// Toaster в цвет темы: sonner по умолчанию светлый, и в тёмной теме все
// уведомления были белыми. Следим за классом .dark на <html>.
import { useEffect, useState } from "react"
import { Toaster } from "sonner"

export function ThemedToaster() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains("dark"))
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return <Toaster theme={dark ? "dark" : "light"} richColors position="top-right" closeButton />
}
