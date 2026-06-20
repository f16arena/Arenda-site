import { getAllPosts } from "@/lib/blog"

// SEO-секция на главной: текст с ключевыми фразами (автоматизация аренды,
// управление коммерческой недвижимостью, CRM для арендодателя, договор/ЭЦП/ЭСФ)
// + внутренние ссылки на статьи блога. Использует классы дизайна (.sec/.wrap/...),
// поэтому визуально не выбивается из лендинга.
export function SeoSection() {
  const posts = getAllPosts()
  return (
    <div className="sec">
      <div className="wrap">
        <div className="center-head reveal">
          <span className="kicker center">Коротко о продукте</span>
          <h2>Программа для автоматизации аренды и управления недвижимостью</h2>
          <p>
            Commrent — система для автоматизации аренды и управления коммерческой недвижимостью в Казахстане.
            Заменяет Excel и тетради: учёт арендаторов и платежей, генерация договоров, электронный договор
            аренды с подписанием ЭЦП (в том числе с телефона через eGov Mobile), счета и акты, ЭСФ в КГД и
            контроль оплат. По сути — CRM для арендодателя со всей юридической частью внутри.
          </p>
        </div>

        <div className="reveal" style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Статьи по теме</h3>
          <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
            {posts.map((post) => (
              <li key={post.slug}>
                <a href={`/blog/${post.slug}`} style={{ fontWeight: 600 }}>
                  {post.title}
                </a>
                <span style={{ display: "block", opacity: 0.7, fontSize: 14 }}>{post.description}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 14 }}>
            <a href="/blog" style={{ fontWeight: 600 }}>
              Все статьи в блоге →
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
