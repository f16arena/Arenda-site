"use client"

// ADR: Нижний каталог ассетов (§5.6). Фаза 4 — выбор карточки «вооружает» ассет:
// активируется инструмент размещения (object) с предпросмотром-призраком у курсора
// (R — поворот, клик — поставить). Процедурные примитивы, GLB-ready архитектурно.

import { useState } from "react"
import { useEditorStore } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"

// Имя ассета берём из словаря по его id: подписи двух языков не должны лежать
// в списке ассетов, иначе он превратится в таблицу переводов.
type AssetId = keyof Messages["adminBuilder"]["catalog"]["items"]
type CategoryId = "construction" | "furniture" | "tech" | "light" | "decor" | "gaming" | "cafe" | "water" | "nature" | "street" | "fences" | "paving"

interface Asset {
  id: AssetId
  category: CategoryId
  icon: string
}

const ASSETS: Asset[] = [
  // Стройка
  { id: "column_round", category: "construction", icon: "🏛️" },
  { id: "column_square", category: "construction", icon: "🏛️" },
  { id: "arch", category: "construction", icon: "🌉" },
  { id: "balcony", category: "construction", icon: "🪟" },
  { id: "terrace", category: "construction", icon: "🪵" },
  { id: "awning", category: "construction", icon: "⛱️" },
  { id: "canopy", category: "construction", icon: "⛱️" },
  { id: "railing", category: "construction", icon: "🚧" },
  // Мебель
  { id: "sofa", category: "furniture", icon: "🛋️" },
  { id: "armchair", category: "furniture", icon: "🪑" },
  { id: "chair", category: "furniture", icon: "🪑" },
  { id: "table", category: "furniture", icon: "🪟" },
  { id: "coffee_table", category: "furniture", icon: "▭" },
  { id: "desk", category: "furniture", icon: "🖥️" },
  { id: "meeting_table", category: "furniture", icon: "⬭" },
  { id: "wardrobe", category: "furniture", icon: "🚪" },
  { id: "shelf", category: "furniture", icon: "🗄️" },
  { id: "bookshelf", category: "furniture", icon: "📚" },
  { id: "filing_cabinet", category: "furniture", icon: "🗄️" },
  { id: "whiteboard", category: "furniture", icon: "📋" },
  { id: "bed", category: "furniture", icon: "🛏️" },
  { id: "dining_table", category: "furniture", icon: "🍽️" },
  { id: "stool", category: "furniture", icon: "🪑" },
  { id: "lounge_chair", category: "furniture", icon: "🛋️" },
  { id: "ottoman", category: "furniture", icon: "🟤" },
  { id: "sideboard", category: "furniture", icon: "🗄️" },
  { id: "tv_stand", category: "furniture", icon: "📺" },
  { id: "nightstand", category: "furniture", icon: "🛏️" },
  { id: "locker", category: "furniture", icon: "🔒" },
  { id: "coat_rack", category: "furniture", icon: "🧥" },
  { id: "reception", category: "furniture", icon: "🛎️" },
  { id: "display_case", category: "furniture", icon: "🪟" },
  // Техника
  { id: "tv", category: "tech", icon: "📺" },
  { id: "monitor", category: "tech", icon: "🖥️" },
  { id: "pc", category: "tech", icon: "🖲️" },
  { id: "printer", category: "tech", icon: "🖨️" },
  { id: "fridge", category: "tech", icon: "🧊" },
  { id: "microwave", category: "tech", icon: "📦" },
  { id: "ac", category: "tech", icon: "❄️" },
  { id: "projector", category: "tech", icon: "📽️" },
  { id: "server_rack", category: "tech", icon: "🖥️" },
  { id: "vending", category: "tech", icon: "🥤" },
  { id: "atm", category: "tech", icon: "🏧" },
  { id: "kiosk", category: "tech", icon: "🏪" },
  { id: "turnstile", category: "tech", icon: "🚪" },
  { id: "copier", category: "tech", icon: "🖨️" },
  { id: "safe", category: "tech", icon: "🔐" },
  { id: "monitor_dual", category: "tech", icon: "🖥️" },
  // Свет
  { id: "ceiling_light", category: "light", icon: "💡" },
  { id: "wall_light", category: "light", icon: "🔆" },
  { id: "floor_lamp", category: "light", icon: "🛋️" },
  { id: "table_lamp", category: "light", icon: "💡" },
  { id: "spot", category: "light", icon: "🔅" },
  { id: "led_strip", category: "light", icon: "🌈" },
  { id: "street_lamp", category: "light", icon: "🏮" },
  // Декор
  { id: "painting", category: "decor", icon: "🖼️" },
  { id: "poster", category: "decor", icon: "🪧" },
  { id: "mirror", category: "decor", icon: "🪞" },
  { id: "clock", category: "decor", icon: "🕐" },
  { id: "plant_pot", category: "decor", icon: "🪴" },
  { id: "vase", category: "decor", icon: "🏺" },
  { id: "rug", category: "decor", icon: "🟪" },
  { id: "curtain", category: "decor", icon: "🪟" },
  { id: "wall_panel", category: "decor", icon: "🪵" },
  // Гейминг
  { id: "gaming_desk", category: "gaming", icon: "🎮" },
  { id: "gaming_chair", category: "gaming", icon: "🪑" },
  { id: "pc_rgb", category: "gaming", icon: "🌈" },
  { id: "monitor_triple", category: "gaming", icon: "🖥️" },
  { id: "console_zone", category: "gaming", icon: "🎮" },
  { id: "streaming_setup", category: "gaming", icon: "🎙️" },
  // Кафе
  { id: "cafe_table", category: "cafe", icon: "☕" },
  { id: "cafe_chair", category: "cafe", icon: "🪑" },
  { id: "bar_stool", category: "cafe", icon: "🍸" },
  { id: "bar_counter", category: "cafe", icon: "🍹" },
  { id: "coffee_machine", category: "cafe", icon: "☕" },
  { id: "menu_board", category: "cafe", icon: "📋" },
  { id: "kitchen_counter", category: "cafe", icon: "🍳" },
  { id: "stove", category: "cafe", icon: "🔥" },
  { id: "dishwasher", category: "cafe", icon: "🍽️" },
  { id: "pastry_case", category: "cafe", icon: "🧁" },
  { id: "water_cooler", category: "cafe", icon: "💧" },
  // Природа / Улица / Ограды / Покрытия
  { id: "tree", category: "nature", icon: "🌳" },
  { id: "spruce", category: "nature", icon: "🌲" },
  { id: "birch", category: "nature", icon: "🌿" },
  { id: "bush", category: "nature", icon: "🪴" },
  { id: "flowerbed", category: "nature", icon: "🌼" },
  { id: "plant_big", category: "nature", icon: "🪴" },
  { id: "fern", category: "nature", icon: "🌿" },
  { id: "lamp", category: "street", icon: "🏮" },
  { id: "bench", category: "street", icon: "🪑" },
  { id: "bin", category: "street", icon: "🗑️" },
  { id: "fence", category: "fences", icon: "🧱" },
  { id: "gate", category: "fences", icon: "🚪" },
  { id: "road", category: "paving", icon: "🛣️" },
  { id: "path", category: "paving", icon: "〰️" },
  { id: "parking", category: "paving", icon: "🅿️" },
  // Вода
  { id: "pond", category: "water", icon: "🟦" },
  { id: "pool", category: "water", icon: "🏊" },
  { id: "fountain", category: "water", icon: "⛲" },
  { id: "water_strip", category: "water", icon: "🌊" },
  // Доп. наполнение
  { id: "cubicle", category: "furniture", icon: "🧑‍💻" },
  { id: "coworking_desk", category: "furniture", icon: "🪑" },
  { id: "clothing_rack", category: "furniture", icon: "👕" },
  { id: "checkout_counter", category: "furniture", icon: "🛒" },
  { id: "goods_shelf", category: "furniture", icon: "🏬" },
  { id: "corner_sofa", category: "furniture", icon: "🛋️" },
  { id: "round_pouf", category: "furniture", icon: "🟤" },
  { id: "lockers_row", category: "furniture", icon: "🔐" },
  { id: "conference_phone", category: "tech", icon: "☎️" },
  { id: "tv_large", category: "tech", icon: "📺" },
  { id: "mannequin", category: "decor", icon: "🧍" },
  // масштабные фигуры: по человеку и машине видно реальные габариты
  { id: "person", category: "decor", icon: "🧍‍♂️" },
  { id: "person2", category: "decor", icon: "🧍‍♀️" },
  { id: "car", category: "street", icon: "🚗" },
  { id: "car2", category: "street", icon: "🚙" },
  { id: "shopping_cart", category: "decor", icon: "🛒" },
  { id: "sculpture", category: "decor", icon: "🗿" },
  { id: "aquarium", category: "decor", icon: "🐠" },
  { id: "neon_sign", category: "decor", icon: "💡" },
  { id: "art_pedestal", category: "decor", icon: "🏺" },
  { id: "hanging_plant", category: "decor", icon: "🪴" },
  { id: "floor_vase_big", category: "decor", icon: "🏺" },
  { id: "vr_station", category: "gaming", icon: "🥽" },
  { id: "arcade_machine", category: "gaming", icon: "🕹️" },
  { id: "tournament_stage", category: "gaming", icon: "🏆" },
  { id: "display_fridge", category: "cafe", icon: "🧊" },
  { id: "ice_cream_case", category: "cafe", icon: "🍦" },
  { id: "napkin_stand", category: "cafe", icon: "🧻" },
]

// «all» — не категория ассета, а пункт фильтра «Все».
const CATEGORIES: (CategoryId | "all")[] = ["all", "construction", "furniture", "tech", "light", "decor", "gaming", "cafe", "water", "nature", "street", "fences", "paving"]

// Ключ подписи категории в словаре: catAll, catConstruction…
const CAT_KEY = {
  all: "catAll",
  construction: "catConstruction",
  furniture: "catFurniture",
  tech: "catTech",
  light: "catLight",
  decor: "catDecor",
  gaming: "catGaming",
  cafe: "catCafe",
  water: "catWater",
  nature: "catNature",
  street: "catStreet",
  fences: "catFences",
  paving: "catPaving",
} as const satisfies Record<CategoryId | "all", string>

// Какую категорию показать по умолчанию для режима.
const MODE_CATEGORY: Record<string, CategoryId> = { buy: "furniture", water: "water", landscape: "nature" }

export function AssetCatalog() {
  const { t } = useT()
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const armAsset = useEditorStore((s) => s.armAsset)
  const setTool = useEditorStore((s) => s.setTool)
  const mode = useEditorStore((s) => s.mode)
  // Категория по умолчанию для режима (AssetCatalog ремаунтится по key={mode}).
  const [cat, setCat] = useState<CategoryId | "all">(() => MODE_CATEGORY[mode] ?? "all")
  const activeTool = useEditorStore((s) => s.activeTool)
  // В режиме «Строить» каталог мебели съедал низ экрана, где инженер обводит
  // план. Свёрнут, пока его не открыли или не взяли инструмент «Объект».
  const [expanded, setExpanded] = useState(() => mode !== "build")
  const open = expanded || activeTool === "object"

  const items = cat === "all" ? ASSETS : ASSETS.filter((item) => item.category === cat)

  const arm = (id: string) => {
    setTool("object")
    armAsset(id)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="absolute bottom-9 left-1/2 z-20 -translate-x-1/2 rounded-xl px-3 py-1.5 text-[11px] font-medium shadow-xl backdrop-blur-xl"
        style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
      >
        {t("adminBuilder.catalog.collapsed")}
      </button>
    )
  }

  return (
    <div
      className="absolute bottom-9 left-1/2 z-20 flex max-w-[80vw] -translate-x-1/2 flex-col gap-2 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="flex items-center gap-1.5">
        {mode === "build" && (
          <button
            type="button"
            onClick={() => {
              setExpanded(false)
              if (activeTool === "object") setTool("select")
            }}
            title={t("adminBuilder.catalog.collapse")}
            className="rounded-lg px-2 py-1 text-[11px] font-medium"
            style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.muted }}
          >
            ▾
          </button>
        )}
        {CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCat(id)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all"
            style={{ background: cat === id ? TOKENS.accent : "rgba(148,163,184,0.1)", color: cat === id ? "#0b1220" : TOKENS.text }}
          >
            {t(`adminBuilder.catalog.${CAT_KEY[id]}`)}
          </button>
        ))}
        <span className="ml-1 text-[10px]" style={{ color: TOKENS.muted }}>{t("adminBuilder.catalog.hint")}</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {items.map((item) => {
          const armed = armedAsset === item.id
          const name = t(`adminBuilder.catalog.items.${item.id}`)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => arm(item.id)}
              title={name}
              className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl p-2 transition-all hover:scale-[1.03]"
              style={{ background: armed ? "rgba(56,189,248,0.18)" : "rgba(148,163,184,0.08)", border: `1px solid ${armed ? TOKENS.accent : TOKENS.panelBorder}` }}
            >
              <div className="grid h-10 w-full place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.12)" }}>
                <span className="text-lg">{item.icon}</span>
              </div>
              {/* Карточка 80px: длинное имя обрезаем, полностью оно в title */}
              <span className="w-full truncate text-center text-[10px]" style={{ color: TOKENS.text }}>{name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
