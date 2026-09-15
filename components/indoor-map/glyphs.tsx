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

/** Расширение набора плана: эскалатор и травалатор рисуем сами. */
export type ServiceKind = IconKind | "escalator" | "travolator" | "entrance"

function Stairs({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function Escalator({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19 20 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 19h4M9 14h3M14 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 5h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Travolator({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  stairs: "Лестница",
  elevator: "Лифт",
  toilet: "Санузел",
  kitchen: "Кухня",
  parking: "Парковка",
  escalator: "Эскалатор",
  travolator: "Травалатор",
  entrance: "Вход",
}

export function ServiceGlyph({ kind, size = 18 }: { kind: ServiceKind; size?: number }) {
  if (kind === "stairs") return <Stairs size={size} />
  if (kind === "escalator") return <Escalator size={size} />
  if (kind === "travolator") return <Travolator size={size} />
  const Icon = SERVICE_LUCIDE[kind] ?? Wrench
  return <Icon width={size} height={size} strokeWidth={1.7} aria-hidden="true" />
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
  const Icon = CATEGORY_LUCIDE[category]
  return <Icon width={size} height={size} strokeWidth={1.8} aria-hidden="true" />
}
