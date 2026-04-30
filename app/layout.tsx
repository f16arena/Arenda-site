import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import { Toaster } from "sonner"
import { themeInitScript } from "@/components/theme-toggle"
import "./globals.css"

// Manrope — современный, минималистичный, премиальный sans-serif с
// отличной кириллицей. Цифры — табличные (хорошо для финансов).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  title: "Commrent — управление коммерческой арендой",
  description: "SaaS-платформа для собственников бизнес-центров и коммерческой недвижимости в Казахстане",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Commrent",
  },
}

// В Next.js 16 themeColor вынесен из metadata в отдельный viewport export
export const viewport: Viewport = {
  themeColor: "#0f172a",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  )
}
