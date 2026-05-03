import type { MetadataRoute } from "next"

const SITE_URL = "https://commrent.kz"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/cabinet/",
        "/superadmin/",
        "/forgot-password",
        "/reset-password",
        "/sign/",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
