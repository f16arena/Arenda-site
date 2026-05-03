import type { MetadataRoute } from "next"

const SITE_URL = "https://commrent.kz"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const routes = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
    { path: "/offer", changeFrequency: "monthly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/sla", changeFrequency: "yearly", priority: 0.3 },
  ] as const

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
