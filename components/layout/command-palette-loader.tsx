"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const CommandPalette = dynamic(
  () => import("./command-palette").then((mod) => mod.CommandPalette),
  { ssr: false },
)

export function CommandPaletteLoader() {
  const [enabled, setEnabled] = useState(false)
  const [openSignal, setOpenSignal] = useState(0)

  useEffect(() => {
    if (enabled) return

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setEnabled(true)
        setOpenSignal((n) => n + 1)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled])

  return enabled ? <CommandPalette openSignal={openSignal} /> : null
}
