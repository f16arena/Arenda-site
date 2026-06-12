"use client"

// ADR: Нижний каталог ассетов (§5.6). Фаза 4 — выбор карточки «вооружает» ассет:
// активируется инструмент размещения (object) с предпросмотром-призраком у курсора
// (R — поворот, клик — поставить). Процедурные примитивы, GLB-ready архитектурно.

import { useState } from "react"
import { useEditorStore } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

interface Asset {
  id: string
  name: string
  category: string
  icon: string
}

const ASSETS: Asset[] = [
  { id: "tree", name: "Дерево", category: "Природа", icon: "🌳" },
  { id: "spruce", name: "Ёлка", category: "Природа", icon: "🌲" },
  { id: "birch", name: "Берёза", category: "Природа", icon: "🌿" },
  { id: "bush", name: "Куст", category: "Природа", icon: "🪴" },
  { id: "flowerbed", name: "Клумба", category: "Природа", icon: "🌼" },
  { id: "lamp", name: "Фонарь", category: "Улица", icon: "💡" },
  { id: "bench", name: "Скамейка", category: "Улица", icon: "🪑" },
  { id: "bin", name: "Урна", category: "Улица", icon: "🗑️" },
  { id: "fence", name: "Забор", category: "Ограды", icon: "🧱" },
  { id: "gate", name: "Ворота", category: "Ограды", icon: "🚪" },
  { id: "road", name: "Дорога", category: "Покрытия", icon: "🛣️" },
  { id: "path", name: "Дорожка", category: "Покрытия", icon: "〰️" },
  { id: "parking", name: "Парковка", category: "Покрытия", icon: "🅿️" },
]

const CATEGORIES = ["Все", "Природа", "Улица", "Ограды", "Покрытия"]

export function AssetCatalog() {
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const armAsset = useEditorStore((s) => s.armAsset)
  const setTool = useEditorStore((s) => s.setTool)
  const [cat, setCat] = useState("Все")

  const items = cat === "Все" ? ASSETS : ASSETS.filter((a) => a.category === cat)

  const arm = (id: string) => {
    setTool("object")
    armAsset(id)
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
        <span className="ml-1 text-[10px]" style={{ color: TOKENS.muted }}>выбери → призрак у курсора · R — поворот · клик — поставить</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {items.map((a) => {
          const armed = armedAsset === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => arm(a.id)}
              className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl p-2 transition-all hover:scale-[1.03]"
              style={{ background: armed ? "rgba(56,189,248,0.18)" : "rgba(148,163,184,0.08)", border: `1px solid ${armed ? TOKENS.accent : TOKENS.panelBorder}` }}
            >
              <div className="grid h-10 w-full place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.12)" }}>
                <span className="text-lg">{a.icon}</span>
              </div>
              <span className="text-[10px]" style={{ color: TOKENS.text }}>{a.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
