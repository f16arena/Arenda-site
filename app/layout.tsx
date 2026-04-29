import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Commrent — управление коммерческой арендой",
  description: "SaaS-платформа для собственников бизнес-центров и коммерческой недвижимости в Казахстане",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Commrent",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={`${geist.variable} h-full`}>
      <body className="h-full font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  )
}
