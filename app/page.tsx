import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  Clock3,
  FileSignature,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { LEGAL_ENTITY } from "@/lib/legal-entity"

const productHighlights = [
  "Арендаторы, помещения и договоры в одной системе",
  "Начисления, счета, оплаты и долги без Excel",
  "Кабинет арендатора для заявок, документов и платежей",
]

const operatingLoop = [
  {
    title: "Заселение",
    text: "Здание, этажи, помещения, арендатор и условия аренды собираются в один понятный профиль.",
    icon: Building2,
  },
  {
    title: "Финансы",
    text: "Система видит начисления, оплаты, просрочки, коммунальные услуги и прибыль по каждому зданию.",
    icon: Wallet,
  },
  {
    title: "Документы",
    text: "Договоры, доп. соглашения, счета, акты и сверки формируются из ваших реквизитов и данных арендатора.",
    icon: FileSignature,
  },
  {
    title: "Операции",
    text: "Заявки, задачи, сообщения, уведомления и контроль сроков не теряются между чатами и таблицами.",
    icon: Bell,
  },
]

const roleCards = [
  {
    title: "Владелец",
    text: "Видит общую картину: доход, расход, прибыль, заполняемость, долги и сравнение зданий.",
    icon: Landmark,
  },
  {
    title: "Администратор",
    text: "Работает с ежедневными задачами: счета, оплаты, заявки, арендаторы, документы на подпись.",
    icon: LayoutDashboard,
  },
  {
    title: "Арендатор",
    text: "Заходит в кабинет, видит долг, счета, документы, заявки и куда оплатить.",
    icon: MessageSquare,
  },
]

const trustPoints = [
  "Multi-tenant разделение данных",
  "Роли и доступ по зданиям",
  "Журнал действий и ошибок",
  "Готово для нескольких объектов",
]

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f7f8fb]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Commrent">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight">Commrent</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#product" className="hover:text-slate-950">Продукт</a>
            <a href="#workflow" className="hover:text-slate-950">Как работает</a>
            <a href="#roles" className="hover:text-slate-950">Роли</a>
            <a href="#pricing" className="hover:text-slate-950">Тариф</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white sm:inline-flex"
            >
              Войти
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Попробовать
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-14 sm:px-8 lg:pb-20 lg:pt-20">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              SaaS для коммерческой аренды в Казахстане
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Автоматизируйте аренду коммерческой недвижимости
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Commrent помогает владельцам БЦ, ТРЦ и торговых помещений контролировать арендаторов, договоры,
              начисления, оплаты, заявки и долги в одной спокойной системе.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              >
                Начать 14 дней бесплатно
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#product"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
              >
                Посмотреть возможности
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
              {productHighlights.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <DashboardPreview />
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-600">Что закрывает Commrent</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Не просто CRM, а рабочий контур для аренды
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
              Система устроена вокруг реального процесса: объект, помещение, арендатор, договор, начисление,
              оплата, акт, заявка и контроль долга. Владелец видит бизнес, администратор ведет операционку,
              арендатор получает понятный кабинет.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {operatingLoop.map((item) => (
              <FeatureTile key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-5 md:grid-cols-3">
            <Step number="01" title="Настройте объект" text="Добавьте здания, этажи, помещения, ставки, реквизиты и роли сотрудников." />
            <Step number="02" title="Ведите арендаторов" text="Назначайте помещения, храните договоры, фиксируйте условия и контролируйте сроки." />
            <Step number="03" title="Контролируйте деньги" text="Формируйте счета, принимайте оплаты, видьте просрочки и прибыль по каждому зданию." />
          </div>
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Для кого</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Каждый видит только свою работу
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600">
            Права доступа разделяют владельца, администратора, бухгалтера, сотрудника и арендатора.
            Данные разных клиентов SaaS не смешиваются.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {roleCards.map((item) => (
            <RoleTile key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold text-blue-300">Почему это важно</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Владелец должен видеть бизнес за 30 секунд
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkMetric value="95%" label="видимость занятости и свободных площадей" />
            <DarkMetric value="1 экран" label="доход, расход, долг и прибыль по зданиям" />
            <DarkMetric value="0 Excel" label="для ежемесячных начислений и сверок" />
            <DarkMetric value="24/7" label="кабинет арендатора для документов и заявок" />
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-blue-600">Запуск</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Начните с одного здания, масштабируйте до сети объектов
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
              Commrent подходит для собственников одного БЦ и управляющих компаний с несколькими точками.
              При росте вы добавляете здания, сотрудников, роли и отчеты без смены системы.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Пробный запуск</p>
                <p className="mt-1 text-sm text-slate-500">14 дней бесплатно</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                без карты
              </span>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              {trustPoints.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Получить доступ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold text-slate-950">Commrent</p>
              <p className="text-xs text-slate-500">SaaS для коммерческой аренды</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
            <Link href="/offer" className="hover:text-slate-950">Оферта</Link>
            <Link href="/privacy" className="hover:text-slate-950">Конфиденциальность</Link>
            <Link href="/terms" className="hover:text-slate-950">Условия</Link>
            <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="hover:text-slate-950">
              {LEGAL_ENTITY.email.support}
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
      <Image src="/commrent-mark.png" alt="" width={28} height={28} className="rounded-md object-contain" />
    </span>
  )
}

function DashboardPreview() {
  return (
    <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-2xl shadow-slate-900/20">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BrandMark />
          <div>
            <p className="text-sm font-semibold text-white">БЦ Abay Business</p>
            <p className="text-xs text-slate-400">Все здания - май 2026</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <LockKeyhole className="h-3.5 w-3.5" />
          данные организации изолированы
        </div>
      </div>

      <div className="grid gap-px bg-white/10 md:grid-cols-4">
        <PreviewMetric label="Доход за месяц" value="8 420 000 ₸" tone="emerald" />
        <PreviewMetric label="Долг" value="610 000 ₸" tone="amber" />
        <PreviewMetric label="Заполняемость" value="91%" tone="blue" />
        <PreviewMetric label="Свободно" value="312 м²" tone="slate" />
      </div>

      <div className="grid gap-px bg-white/10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-slate-950 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Что требует внимания сегодня</p>
              <p className="text-xs text-slate-400">Автоматический список для администратора</p>
            </div>
            <Clock3 className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-2">
            <PreviewRow title="3 арендатора с просрочкой" meta="Отправить напоминание" amount="610 000 ₸" />
            <PreviewRow title="2 договора истекают" meta="Подготовить продление или доп. соглашение" amount="30 дней" />
            <PreviewRow title="5 заявок в работе" meta="Сантехника, электрика, доступ" amount="5" />
          </div>
        </div>

        <div className="bg-slate-900 p-5">
          <p className="text-sm font-semibold text-white">Документы</p>
          <div className="mt-4 space-y-3">
            <DocLine icon={FileSignature} title="Договор аренды" status="готов к подписи" />
            <DocLine icon={Wallet} title="Счет на оплату" status="выставлен" />
            <DocLine icon={BarChart3} title="Акт сверки" status="сформирован" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewMetric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "blue" | "slate" }) {
  const tones = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    blue: "text-blue-300",
    slate: "text-slate-200",
  }
  return (
    <div className="bg-slate-950 p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  )
}

function PreviewRow({ title, meta, amount }: { title: string; meta: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-0.5 text-xs text-slate-400">{meta}</p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-slate-200">{amount}</span>
    </div>
  )
}

function DocLine({ icon: Icon, title, status }: { icon: LucideIcon; title: string; status: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-slate-400">{status}</p>
      </div>
    </div>
  )
}

function FeatureTile({ title, text, icon: Icon }: { title: string; text: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm font-semibold text-blue-600">{number}</p>
      <h3 className="mt-3 text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function RoleTile({ title, text, icon: Icon }: { title: string; text: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function DarkMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{label}</p>
    </div>
  )
}
