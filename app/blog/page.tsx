import type { Metadata } from "next"
import Link from "next/link"
import { getAllPosts } from "@/lib/blog"

export const metadata: Metadata = {
  title: "Блог об автоматизации аренды | Commrent",
  description:
    "Статьи про автоматизацию аренды, управление коммерческой недвижимостью, CRM для арендодателя, электронный договор с ЭЦП и ЭСФ в Казахстане.",
  alternates: { canonical: "/blog" },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Блог Commrent</h1>
      <p className="mt-2 text-slate-600">
        Автоматизация аренды, управление коммерческой недвижимостью, договоры с ЭЦП и ЭСФ — простым языком.
      </p>

      <div className="mt-8 space-y-6">
        {posts.map((post) => (
          <article key={post.slug} className="border-b border-slate-100 pb-6">
            <h2 className="text-xl font-semibold">
              <Link href={`/blog/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="mt-2 text-slate-600">{post.description}</p>
            <div className="mt-2 text-xs text-slate-400">{post.readMin} мин чтения</div>
          </article>
        ))}
      </div>
    </div>
  )
}
