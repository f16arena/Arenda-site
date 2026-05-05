import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  WalletCards,
  Workflow,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { LEGAL_ENTITY } from "@/lib/legal-entity"

const navItems = [
  ["Возможности", "#features"],
  ["Модули", "#modules"],
  ["Кейсы", "#cases"],
  ["Тарифы", "#pricing"],
  ["Интеграции", "#integrations"],
  ["FAQ", "#faq"],
  ["Блог", "#blog"],
] as const

const painPoints = [
  "Счета, акты и договоры собираются вручную в Word и Excel",
  "Оплаты приходят в Kaspi или наличными, а долг приходится искать по чатам",
  "Свободные помещения, индексация и сроки договоров всплывают слишком поздно",
  "Владелец не видит общую прибыль по нескольким зданиям",
]

const featureCards = [
  {
    title: "Объекты и помещения",
    text: "Здания, этажи, кабинеты, площади, статусы, несколько помещений и этажей у одного арендатора.",
    icon: Building2,
  },
  {
    title: "Арендаторы",
    text: "ИП, ТОО, ЧСИ, физлица, контакты, реквизиты, НДС, договоры, банковские счета и история работы.",
    icon: Store,
  },
  {
    title: "Финансы",
    text: "Начисления, счета, оплаты, долги, коммунальные услуги, наличные оплаты и подтверждение чеков.",
    icon: CircleDollarSign,
  },
  {
    title: "Документы",
    text: "Договоры, доп. соглашения, счета, АВР, акты сверки и шаблоны с подстановкой данных.",
    icon: FileSignature,
  },
  {
    title: "Кабинет арендатора",
    text: "Арендатор видит долг, документы, реквизиты, заявки, уведомления и может отправить чек.",
    icon: Smartphone,
  },
  {
    title: "Аналитика",
    text: "Доход, расход, прибыль, заполняемость, свободная площадь и сравнение зданий.",
    icon: BarChart3,
  },
] satisfies Array<{ title: string; text: string; icon: LucideIcon }>

const modules = [
  ["Здания", "паспорт объекта, этажи, помещения, ответственные"],
  ["Арендаторы", "карточка клиента, договоры, помещения, реквизиты"],
  ["Финансы", "начисления, оплаты, долги, счета и акты"],
  ["Счетчики", "свет, вода, отопление, мусор и разные тарифы"],
  ["Документы", "DOCX-шаблоны, подписи, история и хранение"],
  ["Заявки", "ремонт, обращения, статусы и комментарии"],
  ["Хранилище", "файлы владельца, арендаторов, чеков и документов"],
  ["Support mode", "ошибки, health, действия и помощь клиенту"],
] as const

const roleCards = [
  {
    title: "Владелец здания",
    text: "Видит все здания сразу: доход, расход, прибыль, долги, свободные площади и что требует внимания сегодня.",
    icon: Landmark,
  },
  {
    title: "Администратор",
    text: "Работает с арендаторами, счетами, заявками, документами, оплатами и задачами в одном рабочем дне.",
    icon: LayoutDashboard,
  },
  {
    title: "Арендатор",
    text: "Понимает, сколько должен, за что начислено, до какого числа оплатить и где скачать документы.",
    icon: MessageSquare,
  },
  {
    title: "Бухгалтер",
    text: "Получает счета, акты, сверки, оплаты, реквизиты и понятную историю взаиморасчетов.",
    icon: ReceiptText,
  },
] satisfies Array<{ title: string; text: string; icon: LucideIcon }>

const kzPoints = [
  "Тенге, ИИН/БИН, БИК/ИИК и банковские реквизиты РК",
  "ИП, ТОО, ЧСИ, физлица и корректные данные для документов",
  "Kaspi/QR, чеки, наличные оплаты и подтверждение администратором",
  "ЭЦП, NCALayer, договоры, доп. соглашения и НДС по настройкам",
  "Адреса Казахстана, здания, этажи и помещения без смешивания данных",
  "Multi-tenant SaaS: у каждого владельца свое хранилище и свои арендаторы",
]

const cases = [
  {
    title: "Бизнес-центр",
    text: "Контроль кабинетов, арендаторов, договоров, просрочек и коммунальных услуг по каждому этажу.",
  },
  {
    title: "Торговые помещения",
    text: "Фиксированная аренда, ставка за м², аренда за этаж, реклама, доп. услуги и документы.",
  },
  {
    title: "Сеть объектов",
    text: "Общий dashboard владельца и раздельная операционная работа по каждому зданию.",
  },
]

const integrations = [
  ["DOCX/XLSX", "шаблоны договоров, счетов, АВР и актов сверки"],
  ["Kaspi и QR", "понятные реквизиты, чеки и подтверждение оплат"],
  ["NCALayer", "контур подписания документов через ЭЦП"],
  ["Email", "welcome-письма, сброс пароля и уведомления"],
  ["Excel import", "быстрая загрузка арендаторов и данных"],
  ["Sentry/Health", "журнал ошибок, release info и системная диагностика"],
] as const

const faqs = [
  {
    question: "Можно ли вести несколько зданий?",
    answer: "Да. Владелец видит общую картину по всем зданиям, а администратору можно выдать доступ только к нужным объектам.",
  },
  {
    question: "Арендатор увидит данные владельца?",
    answer: "Нет. Арендатор работает через свой кабинет и общается с администратором. Данные владельца показываются только тем ролям, кому это разрешено.",
  },
  {
    question: "Можно ли работать с ИП, ТОО, ЧСИ и физлицами?",
    answer: "Да. Система различает правовые формы, проверяет ИИН/БИН, банковские реквизиты и подставляет корректные данные в документы.",
  },
  {
    question: "Где хранятся документы и чеки?",
    answer: "Файлы хранятся в базе в разрезе организации, здания, арендатора и типа документа. У каждого владельца свое изолированное хранилище.",
  },
  {
    question: "Можно ли изменить условия аренды?",
    answer: "Да, но ключевые условия нужно подкреплять документом: доп. соглашением, подписью и датой вступления изменений.",
  },
]

const blogCards = [
  "Как владельцу БЦ контролировать долги арендаторов",
  "Договор аренды нежилого помещения в Казахстане: что важно учесть",
  "ИП, ТОО, ЧСИ и физлицо: какие данные нужны для аренды",
] as const

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Commrent.kz">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <Image src="/commrent-mark.png" alt="" width={27} height={27} className="rounded-md object-contain" priority />
            </span>
            <span className="text-base font-semibold tracking-tight">commrent.kz</span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-slate-600 lg:flex">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="hover:text-slate-950">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">
              Войти
            </Link>
            <a
              href={`mailto:${LEGAL_ENTITY.email.support}?subject=Демо Commrent.kz`}
              className="hidden rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 md:inline-flex"
            >
              Получить демо
            </a>
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Попробовать
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 lg:pb-16 lg:pt-16">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              SaaS для коммерческой аренды в Казахстане
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Управляйте арендой без Excel, WhatsApp и ручных ошибок
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              Commrent.kz помогает владельцам БЦ, ТРЦ, складов и коммерческих помещений вести здания, арендаторов, договоры,
              счета, оплаты, коммуналку, заявки и документы в одном кабинете.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={`mailto:${LEGAL_ENTITY.email.support}?subject=Хочу демо Commrent.kz`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
              >
                Получить демо
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#features"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
              >
                Посмотреть возможности
              </a>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-5xl">
            <ProductVisual />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-orange-600">Знакомая ситуация?</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Когда аренда живет в таблицах, деньги теряются незаметно
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Клиент должен узнать себя уже на втором экране: хаос в документах, долги в переписках,
              непонятные оплаты, свободные помещения и отсутствие общей картины по зданиям.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {painPoints.map((item) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <SearchCheck className="h-5 w-5 text-orange-500" />
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-900">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <SectionIntro
            eyebrow="Возможности"
            title="Вся коммерческая аренда в одной системе"
            text="Commrent закрывает ежедневный путь: объект → помещение → арендатор → договор → счет → оплата → акт → аналитика."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((item) => (
              <InfoCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section id="modules" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-blue-600">Модули</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Не набор кнопок, а рабочие контуры
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Каждый модуль отвечает за понятную часть бизнеса. Владелец видит результат, администратор ведет процесс,
              арендатор получает простой кабинет.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-950">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
          <div>
            <p className="text-sm font-semibold text-blue-300">Казахстанский контур</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Сделано под реальные процессы аренды в РК
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Наша главная разница с зарубежными и российскими системами: Commrent говорит на языке Казахстана,
              документов РК, тенге, реквизитов, ЭЦП и локальной работы с арендаторами.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {kzPoints.map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <BadgeCheck className="h-5 w-5 text-orange-300" />
                <p className="mt-3 text-sm font-medium leading-6 text-slate-100">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <SectionIntro
          eyebrow="Для кого"
          title="Одна платформа, разные кабинеты"
          text="Владелец не тонет в операционке, администратор закрывает ежедневные задачи, арендатор понимает свои платежи и документы."
        />
        <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {roleCards.map((item) => (
            <InfoCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section id="cases" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <SectionIntro
            eyebrow="Кейсы"
            title="Подходит для разных форматов коммерческой недвижимости"
            text="Структура здания, этажей, помещений и арендаторов помогает разделять данные по объектам и видеть общую картину бизнеса."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {cases.map((item) => (
              <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <BriefcaseBusiness className="h-5 w-5 text-blue-600" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-orange-600">Калькулятор потерь</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Покажите владельцу, сколько он теряет без системы
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              На следующем этапе этот блок станет интерактивным: клиент введет количество арендаторов,
              среднюю аренду, просрочки и свободные площади, а система покажет потенциальные потери.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Calculator className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-950">Пример расчета</p>
                <p className="text-sm text-slate-500">20 арендаторов, 2 просрочки, 80 м² пустует</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Потери на простое" value="240 000 ₸" />
              <MiniMetric label="Просрочки" value="380 000 ₸" />
              <MiniMetric label="Время на документы" value="12 часов" />
            </div>
            <p className="mt-5 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              Потенциальные потери: 620 000 ₸ в месяц. Commrent помогает видеть такие риски заранее.
            </p>
          </div>
        </div>
      </section>

      <section id="integrations" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <SectionIntro
            eyebrow="Интеграции"
            title="Связь с привычными инструментами"
            text="Сейчас закрываем критичные процессы внутри системы, дальше можно развивать банковские импорты, ЭСФ, 1С/BAS и новые каналы оплат."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {integrations.map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <Workflow className="h-5 w-5 text-blue-600" />
                <p className="mt-4 font-semibold text-slate-950">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-blue-600">Тарифы</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Начните с одного здания и масштабируйтесь до сети объектов
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Тарифную сетку лучше показывать после финального утверждения лимитов. На главной уже объясняем ценность:
              контроль денег, документов, арендаторов и объектов в одной системе.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PriceCard title="Start" text="одно здание, базовый учет, документы и арендаторы" />
            <PriceCard title="Pro" text="несколько зданий, роли, аналитика, хранилище и заявки" featured />
            <PriceCard title="Business" text="сеть объектов, support mode, расширенные отчеты и SLA" />
          </div>
        </div>
      </section>

      <section id="faq" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 lg:py-16">
          <SectionIntro
            eyebrow="FAQ"
            title="Ответы на вопросы до первой встречи"
            text="FAQ должен сниматься с реальных вопросов владельцев, администраторов и арендаторов. После каждой новой функции его нужно обновлять."
          />
          <div className="mt-8 space-y-3">
            {faqs.map((item) => (
              <details key={item.question} className="group rounded-lg border border-slate-200 bg-slate-50 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-slate-950">
                  {item.question}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="blog" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <SectionIntro
          eyebrow="Блог и SEO"
          title="Чтобы клиенты находили Commrent через свои проблемы"
          text="Блог должен приводить владельцев из Google: договоры РК, аренда, долги, ЭСФ, НДС, коммунальные платежи, ИИН/БИН и учет помещений."
        />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {blogCards.map((title) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <h3 className="mt-4 text-base font-semibold leading-6 text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Статья-проводник: сначала объясняем проблему, потом показываем, как это автоматизируется в Commrent.kz.
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center sm:px-8 lg:py-16">
          <p className="text-sm font-semibold text-blue-300">Демо</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Наведите порядок в аренде уже на этой неделе
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Покажем, как Commrent.kz будет работать именно на вашем здании: помещения, арендаторы, договоры,
            счета, оплаты, долги, заявки и документы.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={`mailto:${LEGAL_ENTITY.email.support}?subject=Демо Commrent.kz`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100"
            >
              Получить демо
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Попробовать бесплатно
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/commrent-mark.png" alt="" width={34} height={34} className="rounded-lg object-contain" />
            <div>
              <p className="text-sm font-semibold text-slate-950">commrent.kz</p>
              <p className="text-xs text-slate-500">Операционная система для коммерческой аренды</p>
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

function ProductVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-2xl shadow-slate-900/15">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Image src="/commrent-mark.png" alt="" width={30} height={30} className="rounded-md bg-white object-contain p-0.5" priority />
          <div>
            <p className="text-sm font-semibold text-white">Dashboard владельца</p>
            <p className="text-xs text-slate-400">Все здания · май 2026</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <LockKeyhole className="h-3.5 w-3.5" />
          данные организаций изолированы
        </div>
      </div>
      <div className="grid gap-px bg-white/10 md:grid-cols-4">
        <PreviewMetric label="Доход" value="8 420 000 ₸" tone="emerald" />
        <PreviewMetric label="Долг" value="610 000 ₸" tone="orange" />
        <PreviewMetric label="Заполняемость" value="91%" tone="blue" />
        <PreviewMetric label="Свободно" value="312 м²" tone="slate" />
      </div>
      <div className="grid gap-px bg-white/10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-slate-950 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Что требует внимания сегодня</p>
              <p className="text-xs text-slate-400">Автоматическая операционная сводка</p>
            </div>
            <ClipboardCheck className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-2">
            <PreviewRow title="3 арендатора с просрочкой" meta="отправить напоминание и проверить чеки" amount="610 000 ₸" />
            <PreviewRow title="2 договора истекают" meta="подготовить продление или доп. соглашение" amount="30 дней" />
            <PreviewRow title="5 заявок в работе" meta="электрик, доступ, уборка, вода" amount="5" />
          </div>
        </div>
        <div className="bg-slate-900 p-5">
          <p className="text-sm font-semibold text-white">Документы и оплаты</p>
          <div className="mt-4 space-y-3">
            <DocLine icon={FileCheck2} title="Договор аренды" status="готов к подписи" />
            <DocLine icon={WalletCards} title="Оплата Kaspi/QR" status="ожидает подтверждения" />
            <DocLine icon={Banknote} title="Наличная оплата" status="администратор проверяет" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function InfoCard({ title, text, icon: Icon }: { title: string; text: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function PreviewMetric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "orange" | "blue" | "slate" }) {
  const tones = {
    emerald: "text-emerald-300",
    orange: "text-orange-300",
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function PriceCard({ title, text, featured = false }: { title: string; text: string; featured?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 ${featured ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-slate-950">{title}</p>
        {featured ? <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">популярно</span> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
      <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        Доступ по ролям
      </div>
    </div>
  )
}
