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
  // Мебель
  { id: "sofa", name: "Диван", category: "Мебель", icon: "🛋️" },
  { id: "armchair", name: "Кресло", category: "Мебель", icon: "🪑" },
  { id: "chair", name: "Стул", category: "Мебель", icon: "🪑" },
  { id: "table", name: "Стол", category: "Мебель", icon: "🪟" },
  { id: "coffee_table", name: "Журнальный", category: "Мебель", icon: "▭" },
  { id: "desk", name: "Стол раб.", category: "Мебель", icon: "🖥️" },
  { id: "meeting_table", name: "Переговорный", category: "Мебель", icon: "⬭" },
  { id: "wardrobe", name: "Шкаф", category: "Мебель", icon: "🚪" },
  { id: "shelf", name: "Стеллаж", category: "Мебель", icon: "🗄️" },
  { id: "bed", name: "Кровать", category: "Мебель", icon: "🛏️" },
  { id: "reception", name: "Ресепшн", category: "Мебель", icon: "🛎️" },
  { id: "display_case", name: "Витрина", category: "Мебель", icon: "🪟" },
  // Техника
  { id: "tv", name: "Телевизор", category: "Техника", icon: "📺" },
  { id: "monitor", name: "Монитор", category: "Техника", icon: "🖥️" },
  { id: "pc", name: "ПК", category: "Техника", icon: "🖲️" },
  { id: "printer", name: "Принтер", category: "Техника", icon: "🖨️" },
  { id: "fridge", name: "Холодильник", category: "Техника", icon: "🧊" },
  { id: "microwave", name: "Микроволновка", category: "Техника", icon: "📦" },
  { id: "ac", name: "Кондиционер", category: "Техника", icon: "❄️" },
  { id: "projector", name: "Проектор", category: "Техника", icon: "📽️" },
  // Свет
  { id: "ceiling_light", name: "Люстра", category: "Свет", icon: "💡" },
  { id: "wall_light", name: "Бра", category: "Свет", icon: "🔆" },
  { id: "floor_lamp", name: "Торшер", category: "Свет", icon: "🛋️" },
  { id: "table_lamp", name: "Настольная", category: "Свет", icon: "💡" },
  { id: "spot", name: "Точечный", category: "Свет", icon: "🔅" },
  { id: "led_strip", name: "LED-лента", category: "Свет", icon: "🌈" },
  { id: "street_lamp", name: "Фонарь", category: "Свет", icon: "🏮" },
  // Декор
  { id: "painting", name: "Картина", category: "Декор", icon: "🖼️" },
  { id: "poster", name: "Постер", category: "Декор", icon: "🪧" },
  { id: "mirror", name: "Зеркало", category: "Декор", icon: "🪞" },
  { id: "clock", name: "Часы", category: "Декор", icon: "🕐" },
  { id: "plant_pot", name: "Растение", category: "Декор", icon: "🪴" },
  { id: "vase", name: "Ваза", category: "Декор", icon: "🏺" },
  { id: "rug", name: "Ковёр", category: "Декор", icon: "🟪" },
  { id: "curtain", name: "Штора", category: "Декор", icon: "🪟" },
  // Гейминг
  { id: "gaming_desk", name: "Игровой стол", category: "Гейминг", icon: "🎮" },
  { id: "gaming_chair", name: "Игр. кресло", category: "Гейминг", icon: "🪑" },
  { id: "pc_rgb", name: "ПК RGB", category: "Гейминг", icon: "🌈" },
  { id: "monitor_triple", name: "3 монитора", category: "Гейминг", icon: "🖥️" },
  { id: "console_zone", name: "Консоль-зона", category: "Гейминг", icon: "🎮" },
  // Кафе
  { id: "cafe_table", name: "Столик", category: "Кафе", icon: "☕" },
  { id: "cafe_chair", name: "Стул кафе", category: "Кафе", icon: "🪑" },
  { id: "bar_stool", name: "Барный стул", category: "Кафе", icon: "🍸" },
  { id: "bar_counter", name: "Барная стойка", category: "Кафе", icon: "🍹" },
  { id: "coffee_machine", name: "Кофемашина", category: "Кафе", icon: "☕" },
  { id: "menu_board", name: "Меню-борд", category: "Кафе", icon: "📋" },
  // Природа / Улица / Ограды / Покрытия
  { id: "tree", name: "Дерево", category: "Природа", icon: "🌳" },
  { id: "spruce", name: "Ёлка", category: "Природа", icon: "🌲" },
  { id: "birch", name: "Берёза", category: "Природа", icon: "🌿" },
  { id: "bush", name: "Куст", category: "Природа", icon: "🪴" },
  { id: "flowerbed", name: "Клумба", category: "Природа", icon: "🌼" },
  { id: "lamp", name: "Уличн. фонарь", category: "Улица", icon: "🏮" },
  { id: "bench", name: "Скамейка", category: "Улица", icon: "🪑" },
  { id: "bin", name: "Урна", category: "Улица", icon: "🗑️" },
  { id: "fence", name: "Забор", category: "Ограды", icon: "🧱" },
  { id: "gate", name: "Ворота", category: "Ограды", icon: "🚪" },
  { id: "road", name: "Дорога", category: "Покрытия", icon: "🛣️" },
  { id: "path", name: "Дорожка", category: "Покрытия", icon: "〰️" },
  { id: "parking", name: "Парковка", category: "Покрытия", icon: "🅿️" },
]

const CATEGORIES = ["Все", "Мебель", "Техника", "Свет", "Декор", "Гейминг", "Кафе", "Природа", "Улица", "Ограды", "Покрытия"]

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
