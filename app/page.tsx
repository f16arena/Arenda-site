import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Building, Users, FileText, BarChart3, Wallet, Bell,
  Shield, Zap, Check, ArrowRight, Building2, MessageSquare,
} from "lucide-react"
import { LEGAL_ENTITY } from "@/lib/legal-entity"

export default async function Home() {
  const session = await auth()
  if (session) {
    redirect(session.user.role === "TENANT" ? "/cabinet" : "/admin")
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* ─── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white dark:bg-slate-900/90 backdrop-blur border-b border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Commrent</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">
            <a href="#features" className="hover:text-slate-900 dark:text-slate-100 transition-colors">Возможности</a>
            <a href="#pricing" className="hover:text-slate-900 dark:text-slate-100 transition-colors">Тарифы</a>
            <a href="#how" className="hover:text-slate-900 dark:text-slate-100 transition-colors">Как работает</a>
            <a href="#faq" className="hover:text-slate-900 dark:text-slate-100 transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 transition-colors"
            >
              Войти
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Попробовать
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 via-white to-white pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm text-blue-700 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            SaaS для коммерческой аренды · Казахстан
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-slate-100 leading-tight max-w-4xl mx-auto tracking-tight">
            Управляйте арендой&nbsp;БЦ <br className="hidden sm:block" />
            в&nbsp;одной системе
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            Учёт арендаторов, автоматические начисления, счета-фактуры и&nbsp;акты сверки, личный кабинет
            для арендатора. Меньше Excel — больше контроля.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Попробовать 14&nbsp;дней бесплатно
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors"
            >
              Что внутри
            </a>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">Без карты, без обязательств. Тариф Бизнес на 14&nbsp;дней.</p>
        </div>

        {/* Mockup placeholder */}
        <div className="mx-auto max-w-5xl px-6 pb-16">
          <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white shadow-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <span className="ml-3 text-xs text-slate-400 dark:text-slate-500 font-mono">bcf16.commrent.kz/admin</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 sm:p-8">
              <StatTile label="Арендаторов" value="42" icon={Users} accent="blue" />
              <StatTile label="Заполняемость" value="94%" icon={Building2} accent="emerald" />
              <StatTile label="Поступления, мес." value="3.8 млн ₸" icon={Wallet} accent="violet" />
              <div className="sm:col-span-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Последние операции</p>
                <ul className="space-y-2 text-sm">
                  <RowItem name='ТОО "АлмаПлюс"' meta="Каб. 201 · Платёж" amount="180 000 ₸" tone="emerald" />
                  <RowItem name="ИП Бекова" meta="Каб. 301 · Начисление" amount="200 000 ₸" tone="slate" />
                  <RowItem name="ИП Ахметов" meta="Каб. 101 · Договор" amount="до 31.12" tone="amber" />
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust bar ───────────────────────────────────────── */}
      <section className="border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/60">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <span>Используют собственники БЦ в Алматы и Астане</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">БЦ F16</span>
          <span className="text-slate-300">·</span>
          <span>Поддомен на каждого клиента</span>
          <span className="text-slate-300">·</span>
          <span>Данные клиентов изолированы</span>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-blue-600 mb-3">Возможности</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Всё для управления коммерческой арендой
          </h2>
          <p className="text-base text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-3">
            Не нужно собирать систему из 5 разных программ. Commrent закрывает весь цикл — от заселения до отчётности.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Feature
            icon={Users}
            title="Арендаторы и помещения"
            text="Карточка каждого арендатора: реквизиты, договор, документы, история. Визуальная схема этажей с актуальной заполняемостью."
          />
          <Feature
            icon={Wallet}
            title="Финансы и начисления"
            text="Автоматические ежемесячные начисления по ставке этажа. Платежи, задолженности, пени, акты сверки. Импорт банковской выписки."
          />
          <Feature
            icon={FileText}
            title="Документы"
            text="Готовые шаблоны договоров аренды, счетов-фактур, актов сверки. Автозаполнение из карточки арендатора. PDF и печать в один клик."
          />
          <Feature
            icon={Building2}
            title="Многозданий"
            text="Один аккаунт — несколько зданий. Удобно для управляющих компаний и собственников нескольких БЦ или ТРЦ."
          />
          <Feature
            icon={MessageSquare}
            title="Личный кабинет арендатора"
            text="Арендатор видит свои начисления, платежи и документы, отправляет заявки и показания счётчиков, переписывается с администрацией."
          />
          <Feature
            icon={Bell}
            title="Уведомления Telegram и Email"
            text="Напоминания о платежах, окончании договоров, новых заявках. Не нужно держать всё в голове или Excel-таблице."
          />
          <Feature
            icon={BarChart3}
            title="Аналитика и отчёты"
            text="Заполняемость, выручка по месяцам, прибыль по зданию, тепловая карта по этажам. Выгрузка в Excel и формат 1С."
          />
          <Feature
            icon={Shield}
            title="Роли и права"
            text="Владелец, администратор, бухгалтер, завхоз, арендатор — у каждого свои разделы и операции. Настраиваемая матрица прав."
          />
          <Feature
            icon={Zap}
            title="Свой поддомен"
            text="Каждая компания работает на своём поддомене вида yourcompany.commrent.kz. Данные ваших клиентов изолированы от чужих."
          />
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────── */}
      <section id="how" className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-sm font-semibold text-blue-600 mb-3">Как это работает</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Запуск за 15 минут
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Step
              n="1"
              title="Регистрация"
              text="Введите название компании — получите свой поддомен. Никаких созвонов и установок."
            />
            <Step
              n="2"
              title="Здание и арендаторы"
              text="Добавьте этажи, помещения, арендаторов. Можно импортировать из Excel или ввести вручную."
            />
            <Step
              n="3"
              title="Работайте"
              text="Начисления, документы, личный кабинет арендатора, отчёты — всё работает с первого дня."
            />
          </div>
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-blue-600 mb-3">Тарифы</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Прозрачные цены без скрытых платежей
          </h2>
          <p className="text-base text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-3">
            14 дней пробного периода на любом тарифе. Оплата ежемесячно или со скидкой&nbsp;20% при оплате за&nbsp;год.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <PricingCard
            name="Старт"
            price="9 990"
            yearly="95 900"
            description="Для одного небольшого здания — ИП или малое ТОО"
            features={[
              "1 здание",
              "до 20 арендаторов",
              "до 3 сотрудников",
              "Базовые шаблоны документов",
              "Email-уведомления",
              "Поддержка по почте",
            ]}
          />
          <PricingCard
            name="Бизнес"
            price="24 990"
            yearly="239 900"
            description="Для управляющих компаний и собственников нескольких БЦ"
            features={[
              "до 5 зданий",
              "до 100 арендаторов",
              "до 10 сотрудников",
              "Все шаблоны документов",
              "Telegram-бот для уведомлений",
              "Импорт/экспорт данных",
              "Приоритетная поддержка",
            ]}
            popular
          />
          <PricingCard
            name="Корпоративный"
            price="59 990"
            yearly="575 900"
            description="Для крупных управляющих компаний и сетей"
            features={[
              "Без лимитов",
              "Свой домен (white-label)",
              "API для 1С и интеграций",
              "Электронная подпись (ЭЦП НУЦ РК)",
              "Выделенный менеджер",
              "SLA 99.95%",
              "Кастомные доработки",
            ]}
          />
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-8">
          Цены указаны в тенге за месяц. {" "}
          <a href="/offer" className="text-blue-600 hover:underline">Условия — в публичной оферте</a>.
        </p>
      </section>

      {/* ─── Case ────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="text-sm font-semibold text-blue-400 mb-3">Кейс</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">БЦ F16, Алматы</h2>
          <blockquote className="mt-8 text-xl sm:text-2xl text-slate-200 leading-relaxed font-light">
            «Раньше начисления и&nbsp;акты сверки делали в&nbsp;Excel — каждый месяц несколько часов
            ручной работы и&nbsp;спорные ситуации с&nbsp;арендаторами. С&nbsp;Commrent всё считается
            автоматически, у&nbsp;арендаторов есть свой кабинет, а&nbsp;договоры подписываются прямо&nbsp;онлайн».
          </blockquote>
          <div className="grid sm:grid-cols-3 gap-6 mt-12 max-w-2xl mx-auto">
            <CaseStat value="42" label="арендатора" />
            <CaseStat value="3 этажа + подвал" label="одной кнопкой" />
            <CaseStat value="−6 ч/мес" label="на рутине" />
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-blue-600 mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Частые вопросы</h2>
        </div>
        <div className="space-y-3">
          <FaqItem
            q="Можно ли попробовать бесплатно?"
            a="Да, 14 дней на тарифе Бизнес со всеми функциями. Карта при регистрации не требуется. После окончания периода вы можете выбрать платный тариф или продолжить пользоваться режимом только для просмотра."
          />
          <FaqItem
            q="Где хранятся данные и как они защищены?"
            a="Данные хранятся в зашифрованном виде на серверах с резервным копированием каждые 6 часов. Соединение с сервисом — через HTTPS/TLS. Данные одной организации полностью изолированы от других — мы используем строгое разделение по поддоменам и organizationId."
          />
          <FaqItem
            q="Что происходит при отказе от подписки?"
            a="Доступ к данным сохраняется на 30 дней — за это время вы можете выгрузить всё в Excel. После — данные удаляются без возможности восстановления, кроме обязательной к хранению бухгалтерской отчётности."
          />
          <FaqItem
            q="Можно ли управлять несколькими зданиями?"
            a="Да, на тарифах Бизнес (до 5 зданий) и Корпоративный (без лимита). Управление через один аккаунт, переключение между зданиями в один клик."
          />
          <FaqItem
            q="Есть ли мобильное приложение?"
            a="Сервис работает в браузере на любом устройстве — ноутбуке, планшете, телефоне. Отдельное мобильное приложение в планах на 2026 год."
          />
          <FaqItem
            q="Что если нужны доработки под мою компанию?"
            a="На тарифе Корпоративный мы делаем кастомные доработки и интеграции (1С, ЭЦП НУЦ РК, своя нумерация документов, white-label на ваш домен). Напишите на support@commrent.kz — обсудим объём и сроки."
          />
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────── */}
      <section className="border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Готовы перенести аренду в порядок?
          </h2>
          <p className="text-base text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-3">
            Регистрация — 1&nbsp;минута. Первое начисление — через&nbsp;15.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Начать бесплатно
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={`mailto:${LEGAL_ENTITY.email.support}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 transition-colors"
            >
              Написать в поддержку
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="sm:col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                  <Building className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Commrent</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 leading-relaxed">
                SaaS для собственников коммерческой недвижимости в Казахстане.
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Продукт</p>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Возможности</a></li>
                <li><a href="#pricing" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Тарифы</a></li>
                <li><a href="#faq" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">FAQ</a></li>
                <li><Link href="/login" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Войти</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Документы</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/offer" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Публичная оферта</Link></li>
                <li><Link href="/privacy" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Политика конфиденциальности</Link></li>
                <li><Link href="/terms" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Пользовательское соглашение</Link></li>
                <li><Link href="/sla" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">SLA</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Контакты</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">
                    {LEGAL_ENTITY.email.support}
                  </a>
                </li>
                <li className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{LEGAL_ENTITY.phone}</li>
                <li className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{LEGAL_ENTITY.fullName}</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500">
            <p>© {new Date().getFullYear()} {LEGAL_ENTITY.fullName}. Все права защищены.</p>
            <p>commrent.kz</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ─── Sub-components ────────────────────────────────────────── */

function StatTile({
  label, value, icon: Icon, accent,
}: { label: string; value: string; icon: React.ElementType; accent: "blue" | "emerald" | "violet" }) {
  const accents = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  }
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${accents[accent]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{value}</p>
    </div>
  )
}

function RowItem({
  name, meta, amount, tone,
}: { name: string; meta: string; amount: string; tone: "emerald" | "slate" | "amber" }) {
  const tones = {
    emerald: "text-emerald-600 bg-emerald-50",
    slate: "text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800",
    amber: "text-amber-700 bg-amber-50",
  }
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{meta}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-md ${tones[tone]}`}>{amount}</span>
    </li>
  )
}

function Feature({
  icon: Icon, title, text,
}: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:border-slate-200 hover:shadow-sm transition-all">
      <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 leading-relaxed">{text}</p>
    </div>
  )
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6">
      <div className="h-9 w-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-sm mb-4">
        {n}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 leading-relaxed">{text}</p>
    </div>
  )
}

function PricingCard({
  name, price, yearly, description, features, popular = false,
}: {
  name: string
  price: string
  yearly: string
  description: string
  features: string[]
  popular?: boolean
}) {
  return (
    <div
      className={`relative rounded-2xl border p-7 flex flex-col ${
        popular
          ? "border-blue-500 bg-white dark:bg-slate-900 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
            Самый популярный
          </span>
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{name}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1 min-h-10">{description}</p>
      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{price}</span>
          <span className="text-base text-slate-500 dark:text-slate-400 dark:text-slate-500">₸ / мес</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">или {yearly} ₸ при оплате за&nbsp;год (−20%)</p>
      </div>
      <Link
        href="/signup"
        className={`mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
          popular
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        Попробовать бесплатно
      </Link>
      <ul className="mt-6 space-y-3 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CaseStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{label}</p>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 [&[open]]:shadow-sm">
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
        <span className="font-medium text-slate-900 dark:text-slate-100">{q}</span>
        <span className="text-slate-400 dark:text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
      </summary>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 leading-relaxed">{a}</p>
    </details>
  )
}
