import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Building, CheckCircle, Phone, Users, FileText, BarChart3 } from "lucide-react"

export default async function Home() {
  const session = await auth()
  if (session) {
    redirect(session.user.role === "TENANT" ? "/cabinet" : "/admin")
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-6xl px-6 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">ArendaPro</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Возможности</a>
            <a href="#spaces" className="hover:text-slate-900 transition-colors">Помещения</a>
            <a href="#contacts" className="hover:text-slate-900 transition-colors">Контакты</a>
          </nav>
          <Link
            href="/login"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm text-blue-700 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          Коммерческая аренда · Алматы
        </div>
        <h1 className="text-5xl font-bold text-slate-900 leading-tight max-w-3xl mx-auto">
          Современное управление арендой
        </h1>
        <p className="text-xl text-slate-500 mt-5 max-w-xl mx-auto leading-relaxed">
          Прозрачные платежи, электронные договоры и удобный личный кабинет для каждого арендатора.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <a
            href="#contacts"
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Снять помещение
          </a>
          <Link
            href="/login"
            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Личный кабинет
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-slate-900 py-12">
        <div className="mx-auto max-w-6xl px-6 grid grid-cols-4 gap-8 text-center">
          {[
            { value: "3 этажа", label: "и подвал" },
            { value: "13+", label: "помещений" },
            { value: "500 м²", label: "общая площадь" },
            { value: "24/7", label: "управление" },
          ].map((s) => (
            <div key={s.value}>
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-sm text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold text-slate-900 text-center mb-3">Всё в одном месте</h2>
        <p className="text-slate-500 text-center mb-12">Платформа для арендаторов и управляющих</p>
        <div className="grid grid-cols-3 gap-6">
          {[
            {
              icon: Users,
              title: "Личный кабинет",
              desc: "Каждый арендатор видит только свои данные: платежи, договоры, заявки",
            },
            {
              icon: FileText,
              title: "Электронные договоры",
              desc: "Подписание договоров и актов сверки по SMS без визита в офис",
            },
            {
              icon: BarChart3,
              title: "Финансовая аналитика",
              desc: "Полный учёт доходов и расходов: понимайте реальную прибыль",
            },
            {
              icon: CheckCircle,
              title: "Заявки и задачи",
              desc: "Система обращений от арендаторов и контроль технических задач",
            },
            {
              icon: Building,
              title: "Счётчики и КУ",
              desc: "Ввод показаний счётчиков и автоматический расчёт коммунальных услуг",
            },
            {
              icon: Phone,
              title: "Экстренные контакты",
              desc: "Все важные телефоны всегда под рукой: водоканал, электросети и другие",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
              <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Spaces */}
      <section id="spaces" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Свободные помещения</h2>
          <p className="text-slate-500 mb-8">Свяжитесь с нами для актуального списка и просмотра</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { floor: "1 этаж", desc: "Офисы 20–45 м²", rate: "от 5 000 ₸/м²" },
              { floor: "2 этаж", desc: "Офисы 30–40 м²", rate: "от 4 500 ₸/м²" },
              { floor: "3 этаж", desc: "Офисы 40–60 м²", rate: "от 4 000 ₸/м²" },
              { floor: "Подвал", desc: "Склады и мастерские", rate: "от 3 500 ₸/м²" },
            ].map((s) => (
              <div key={s.floor} className="bg-white rounded-2xl border border-slate-200 p-6">
                <p className="text-sm text-slate-500 mb-1">{s.floor}</p>
                <p className="text-lg font-semibold text-slate-900">{s.desc}</p>
                <p className="text-sm text-blue-600 mt-2 font-medium">{s.rate}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contacts" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Свяжитесь с нами</h2>
            <p className="text-slate-500 mb-6">Ответим на все вопросы и проведём просмотр в удобное время</p>
            <div className="space-y-3">
              {[
                { label: "Телефон", value: "+7 (727) 123-45-67" },
                { label: "WhatsApp", value: "+7 700 123-45-67" },
                { label: "Email", value: "arenda@example.kz" },
                { label: "Адрес", value: "г. Алматы, ул. Абая 150" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400 w-16 shrink-0">{c.label}</span>
                  <span className="font-medium text-slate-900">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
          <form className="bg-slate-50 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Оставить заявку</h3>
            <input
              type="text"
              placeholder="Ваше имя"
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white"
            />
            <input
              type="tel"
              placeholder="Телефон"
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white"
            />
            <textarea
              rows={3}
              placeholder="Ваши пожелания (площадь, этаж...)"
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white resize-none"
            />
            <button className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
              Отправить заявку
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            <span>ArendaPro © 2025</span>
          </div>
          <Link href="/login" className="hover:text-slate-700 transition-colors">
            Войти в систему
          </Link>
        </div>
      </footer>
    </div>
  )
}
