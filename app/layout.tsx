import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import { Toaster } from "sonner"
import { themeInitScript } from "@/components/theme-toggle"
import "./globals.css"

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] })

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
    <html lang="ru" className={`${geist.variable} h-full`} suppressHydrationWarning>
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
