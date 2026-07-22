"use client"

import * as React from "react"
import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Дизайн-система (этап 0 редизайна): вся палитра — через токены темы
// (bg-primary и т.д., app/globals.css), а не через хардкод slate/blue.
// API обратно совместим со старым Button (50+ файлов): variant
// primary|secondary|danger|ghost|outline, size sm|md|lg, loading,
// leftIcon/rightIcon. Новые shadcn-имена (default|destructive|link,
// size default|icon) тоже принимаются — alert-dialog и новые экраны
// используют buttonVariants напрямую.

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
        outline: "border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

// Старые имена → новые (обратная совместимость со старым API).
type LegacyVariant = "primary" | "danger"
type LegacySize = "md"
const LEGACY_VARIANTS: Record<LegacyVariant, NonNullable<VariantProps<typeof buttonVariants>["variant"]>> = {
  primary: "default",
  danger: "destructive",
}

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]> | LegacyVariant
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]> | LegacySize

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "default", loading, leftIcon, rightIcon, asChild, className, children, disabled, ...rest },
  ref,
) {
  const resolvedVariant = (variant in LEGACY_VARIANTS ? LEGACY_VARIANTS[variant as LegacyVariant] : variant) as VariantProps<typeof buttonVariants>["variant"]
  const resolvedSize = (size === "md" ? "default" : size) as VariantProps<typeof buttonVariants>["size"]
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </Comp>
  )
})

export { buttonVariants }
