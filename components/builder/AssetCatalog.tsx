"use client"

// ADR: Нижний каталог ассетов (§5.6). Фаза 1 — процедурные примитивы (§9.4), click-to-place
// на участок (drag-to-scene и позиционирование мышью — Фаза 2/4). Архитектурно GLB-ready:
// добавление реальной модели = новая запись каталога без правок кода.

import { useState } from "react"
import { uid } from "@/core/id"
import { AddObjectCommand } from "@/core/document/commands"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

interface Asset {
  id: string
  name: string
  category: string
}

const ASSETS: Asset[] = [
  { id: "tree", name: "Дерево", category: "Природа" },
  { id: "spruce", name: "Ёлка", category: "Природа" },
  { id: "lamp", name: "Фонарь", category: "Улица" },
  { id: "bench", name: "Скамейка", category: "Улица" },
  { id: "parking", name: "Парковка", category: "Улица" },
]

const CATEGORIES = ["Все", "Природа", "Улица"]

export function AssetCatalog() {
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const setSelection = useEditorStore((s) => s.setSelection)
  const [cat, setCat] = useState("Все")

  const items = cat === "Все" ? ASSETS : ASSETS.filter((a) => a.category === cat)

  const place = (assetId: string) => {
    const n = doc.site.objects.length
    const x = ((n % 6) - 3) * 3000
    const z = 16000 + Math.floor(n / 6) * 3000
    const id = uid("o")
    execute(new AddObjectCommand({ site: true }, { id, assetId, position: { x, y: 0, z }, rotationY: 0, scale: 1, attachTo: "terrain", locked: false }))
    setSelection({ type: "object", id })
  }

  return (
    <div
      className="absolute bottom-9 left-1/2 z-20 flex max-w-[80vw] -translate-x-1/2 flex-col gap-2 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="flex items-center gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all"
            style={{ background: cat === c ? TOKENS.accent : "rgba(148,163,184,0.1)", color: cat === c ? "#0b1220" : TOKENS.text }}
          >
            {c}
          </button>
        ))}
        <span className="ml-1 text-[10px]" style={{ color: TOKENS.muted }}>клик — добавить на участок</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => place(a.id)}
            className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl p-2 transition-all hover:scale-[1.03]"
            style={{ background: "rgba(148,163,184,0.08)", border: `1px solid ${TOKENS.panelBorder}` }}
          >
            <div className="grid h-10 w-full place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.12)" }}>
              <span className="text-lg">{a.id === "tree" || a.id === "spruce" ? "🌳" : a.id === "lamp" ? "💡" : a.id === "bench" ? "🪑" : "🅿️"}</span>
            </div>
            <span className="text-[10px]" style={{ color: TOKENS.text }}>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
