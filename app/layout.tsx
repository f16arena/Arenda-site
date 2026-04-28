import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ArendaPro — Управление арендой",
  description: "Платформа для управления коммерческой недвижимостью",
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
