import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import Script from "next/script"
import { Toaster } from "sonner"
import { ClientErrorMonitor } from "@/components/errors/client-error-monitor"
import { WebVitalsReporter } from "@/components/performance/web-vitals-reporter"
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

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://commrent.kz"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Commrent — управление коммерческой арендой",
    template: "%s | Commrent",
  },
  description: "SaaS-платформа для собственников бизнес-центров и коммерческой недвижимости в Казахстане",
  manifest: "/manifest.json",
  verification: {
    google: "djKedxtoy91w6VUuWG5o8cT1f57Ps14K2mcMRsAQAaM",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Commrent",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: siteUrl,
    siteName: "Commrent",
    title: "Commrent — управление коммерческой арендой",
    description: "Управление арендой, финансами и арендаторами в одном месте",
    images: [
      {
        url: "/commrent-logo-hero.png",
        width: 1200,
        height: 630,
        alt: "Commrent",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Commrent — управление коммерческой арендой",
    description: "SaaS для управления арендой коммерческой недвижимости",
    images: ["/commrent-logo-hero.png"],
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
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="h-full font-sans antialiased">
        {children}
        <ClientErrorMonitor />
        <WebVitalsReporter />
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  )
}
