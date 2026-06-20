import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getAllPosts, getPostBySlug, type BlogBlock } from "@/lib/blog"

const SITE_URL = "https://commrent.kz"

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: "Статья не найдена" }
  return {
    title: `${post.title} | Commrent`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
    },
  }
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "h2":
      return <h2 className="mt-8 text-xl font-semibold">{block.text}</h2>
    case "p":
      return <p className="mt-4 leading-relaxed text-slate-700">{block.text}</p>
    case "quote":
      return (
        <blockquote className="mt-4 border-l-4 border-slate-200 pl-4 italic text-slate-600">
          {block.text}
        </blockquote>
      )
    case "ul":
      return (
        <ul className="mt-4 list-disc space-y-1.5 pl-6 text-slate-700">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol className="mt-4 list-decimal space-y-1.5 pl-6 text-slate-700">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  // Article JSON-LD — помогает поисковикам распознать статью.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    inLanguage: "ru",
    keywords: post.keywords.join(", "),
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    author: { "@type": "Organization", name: "Commrent" },
    publisher: {
      "@type": "Organization",
      name: "Commrent",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/commrent-logo-hero.png` },
    },
  }

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/blog" className="text-sm text-slate-500 hover:underline">
        ← Все статьи
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{post.title}</h1>
      <div className="mt-2 text-sm text-slate-400">{post.readMin} мин чтения</div>

      <div className="mt-2">
        {post.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>

      <div className="mt-10 rounded-xl bg-slate-50 p-6">
        <p className="font-medium">Попробуйте Commrent для своей аренды</p>
        <p className="mt-1 text-sm text-slate-600">
          Договоры, ЭЦП, счета, ЭСФ и контроль оплат — в одном окне.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Начать бесплатно
        </Link>
      </div>
    </article>
  )
}
