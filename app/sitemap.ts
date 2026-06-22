import type { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog"

const SITE_URL = "https://commrent.kz"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const routes = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
    { path: "/offer", changeFrequency: "monthly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/sla", changeFrequency: "yearly", priority: 0.3 },
    { path: "/delete-account", changeFrequency: "yearly", priority: 0.3 },
  ] as const

  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const postEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updated ?? post.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }))

  return [...staticEntries, ...postEntries]
}
