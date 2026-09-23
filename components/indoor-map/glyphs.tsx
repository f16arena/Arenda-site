"use client"

// Служебные знаки и иконки категорий. Половина узнаваемости indoor-карты —
// именно они: лестница, лифт, санузел, эскалатор, вход (SPEC §3).

import {
  ArrowUpDown,
  Baby,
  Briefcase,
  CircleParking,
  Coffee,
  DoorOpen,
  HeartPulse,
  Landmark,
  Scissors,
  Shirt,
  Smartphone,
  Store,
  Toilet,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { IconKind } from "@/lib/floor-layout"
import type { TenantCategory } from "@/lib/indoor-map/tokens"
import { useT } from "@/lib/i18n/client"

/** Расширение набора плана: эскалатор и травалатор рисуем сами. */
export type ServiceKind = IconKind | "escalator" | "travolator" | "entrance"

function Stairs({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d="M3 20h5v-4h5v-4h5V8h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Escalator({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M4 19 20 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 19h4M9 14h3M14 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 5h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Travolator({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M3 15h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 15V9M12 15V9M17 15V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M14 6h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SERVICE_LUCIDE: Partial<Record<ServiceKind, LucideIcon>> = {
  elevator: ArrowUpDown,
  toilet: Toilet,
  kitchen: Utensils,
  parking: CircleParking,
  entrance: DoorOpen,
}

/**
 * Знак служебной зоны. Подпись берём из словаря и отдаём как имя иконки:
 * на плане зона показана только значком, и без имени она недоступна для
 * чтения с экрана.
 */
export function ServiceGlyph({ kind, size = 18 }: { kind: ServiceKind; size?: number }) {
  const { t } = useT()
  const label = t(`adminObjects.map.zones.${kind}` as "adminObjects.map.zones.stairs")
  if (kind === "stairs") return <Stairs size={size} label={label} />
  if (kind === "escalator") return <Escalator size={size} label={label} />
  if (kind === "travolator") return <Travolator size={size} label={label} />
  const Icon = SERVICE_LUCIDE[kind] ?? Wrench
  return <Icon width={size} height={size} strokeWidth={1.7} role="img" aria-label={label} />
}

const CATEGORY_LUCIDE: Record<TenantCategory, LucideIcon> = {
  retail: Shirt,
  food: Coffee,
  services: Wrench,
  beauty: Scissors,
  kids: Baby,
  electronics: Smartphone,
  health: HeartPulse,
  bank: Landmark,
  office: Briefcase,
  other: Store,
}

export function CategoryGlyph({ category, size = 14 }: { category: TenantCategory; size?: number }) {
  const { t } = useT()
  const Icon = CATEGORY_LUCIDE[category]
  const label = t(`adminObjects.map.category.${category}` as "adminObjects.map.category.other")
  return <Icon width={size} height={size} strokeWidth={1.8} role="img" aria-label={label} />
}
