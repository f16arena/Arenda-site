import type { Metadata } from "next"
import { LegalShell, Section, Clause, ClauseList } from "@/components/legal/legal-shell"
import { LEGAL_ENTITY } from "@/lib/legal-entity"

export const metadata: Metadata = {
  title: "SLA — Commrent",
  description: "Соглашение об уровне обслуживания SaaS-платформы Commrent",
}

const slaTiers = [
  { plan: "Free / Starter", availability: "≥ 99.0%", maxDowntime: "≈ 7 ч/мес", reaction: "1 рабочий день" },
  { plan: "Pro",             availability: "≥ 99.5%", maxDowntime: "≈ 3.6 ч/мес", reaction: "8 рабочих часов" },
  { plan: "Business",        availability: "≥ 99.9%", maxDowntime: "≈ 43 мин/мес", reaction: "4 рабочих часа" },
  { plan: "Enterprise",      availability: "по индивидуальному соглашению", maxDowntime: "—", reaction: "≤ 2 ч" },
]

const incidents = [
  { level: "P1 — критический", desc: "Платформа недоступна для всех клиентов", reaction: "≤ 30 мин", solution: "≤ 4 ч" },
  { level: "P2 — высокий",      desc: "Не работает существенная функция", reaction: "≤ 4 ч", solution: "≤ 1 рабочий день" },
  { level: "P3 — средний",      desc: "Не работает второстепенная функция или одна организация", reaction: "≤ 1 рабочий день", solution: "≤ 5 рабочих дней" },
  { level: "P4 — низкий",        desc: "Косметика, мелкие баги, запросы улучшений", reaction: "≤ 5 рабочих дней", solution: "плановый релиз" },
]

export default function SlaPage() {
  return (
    <LegalShell
      title="SLA"
      subtitle="соглашение об уровне обслуживания Платформы Commrent"
      version={LEGAL_ENTITY.version}
      effectiveDate={LEGAL_ENTITY.effectiveDate}
      lastUpdated={LEGAL_ENTITY.lastUpdated}
    >
      <p>
        Настоящее SLA является приложением к{" "}
        <a href="/offer" className="text-blue-600 hover:underline">Публичной оферте</a> и
        определяет уровень доступности SaaS-платформы «{LEGAL_ENTITY.brand}» (далее —
        «Платформа»), время реакции на инциденты и каналы поддержки.
      </p>

      <Section number="1" title="Уровень доступности">
        <Clause num="1.1">
          Заявленный уровень доступности Платформы по тарифам:
          <div className="overflow-x-auto rounded-lg border border-slate-200 mt-3">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">Тариф</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Доступность</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Допустимый простой/мес</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Время реакции</th>
                </tr>
              </thead>
              <tbody>
                {slaTiers.map((t) => (
                  <tr key={t.plan} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-900 font-medium">{t.plan}</td>
                    <td className="px-3 py-2 text-slate-700">{t.availability}</td>
                    <td className="px-3 py-2 text-slate-600">{t.maxDowntime}</td>
                    <td className="px-3 py-2 text-slate-600">{t.reaction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Clause>
        <Clause num="1.2">
          Доступность считается в пределах календарного месяца (UTC+5). Расчёт ведётся
          на основе системного мониторинга Turanix.
        </Clause>
      </Section>

      <Section number="2" title="Категории инцидентов">
        <Clause num="2.1">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">Уровень</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Описание</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Реакция</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Решение</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.level} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-900 font-medium">{i.level}</td>
                    <td className="px-3 py-2 text-slate-600">{i.desc}</td>
                    <td className="px-3 py-2 text-slate-700">{i.reaction}</td>
                    <td className="px-3 py-2 text-slate-700">{i.solution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Clause>
        <Clause num="2.2">
          Мониторинг ошибок осуществляется через Sentry. Критические инциденты
          обрабатываются в режиме 24/7.
        </Clause>
      </Section>

      <Section number="3" title="Каналы поддержки">
        <Clause num="3.1">
          Поддержка клиентов:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-blue-600 hover:underline">
            {LEGAL_ENTITY.email.support}
          </a>
        </Clause>
        <Clause num="3.2">
          Общие вопросы и коммерческие запросы:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email.info}`} className="text-blue-600 hover:underline">
            {LEGAL_ENTITY.email.info}
          </a>
        </Clause>
        <Clause num="3.3">
          Инциденты безопасности и утечки данных:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email.security}`} className="text-blue-600 hover:underline">
            {LEGAL_ENTITY.email.security}
          </a>
        </Clause>
      </Section>

      <Section number="4" title="Планируемые работы (maintenance)">
        <Clause num="4.1">
          Плановые технические работы проводятся в нерабочее время по Алматы
          (UTC+5): обычно ночью или в выходные. О планируемых работах с возможным
          простоем Заказчики уведомляются не позднее чем за 48 часов через
          уведомления внутри Платформы и/или email.
        </Clause>
        <Clause num="4.2">
          Плановые работы не учитываются при расчёте доступности по п. 1.1.
        </Clause>
      </Section>

      <Section number="5" title="Исключения из SLA">
        <Clause num="5.1">
          Turanix не несёт ответственности за простои, вызванные:
          <ClauseList items={[
            "сбоями инфраструктуры третьих лиц: Vercel (хостинг), Supabase (база данных), Sentry (мониторинг);",
            "сбоями сервисов доставки уведомлений: Resend (email), Telegram Bot API, SMS-провайдеры;",
            "сбоями платёжных систем (Kaspi и др.) — при использовании их API клиентами Заказчика;",
            "сбоями интернет-соединения, браузера, операционной системы или устройства пользователя;",
            "форс-мажором (стихийные бедствия, военные действия, акты государственных органов);",
            "DDoS-атаками и иными вредоносными действиями третьих лиц;",
            "блокировкой со стороны интернет-провайдеров или государственных регуляторов.",
          ]} />
        </Clause>
        <Clause num="5.2">
          <b>Ручные платежи арендаторов</b> внутри Платформы (загрузка чеков и
          подтверждение администратором организации) <b>не являются банковским
          процессингом Turanix</b>. Turanix не отвечает за сроки прохождения этих
          платежей через банк и за корректность их подтверждения администратором.
        </Clause>
      </Section>

      <Section number="6" title="Резервное копирование">
        <Clause num="6.1">
          Ежедневные резервные копии и Point-In-Time Recovery (PITR) в окне 7 дней —
          силами Supabase. При корректном запросе со стороны Заказчика данные могут
          быть восстановлены с гранулярностью до минуты в пределах окна хранения.
        </Clause>
      </Section>

      <Section number="7" title="Компенсации">
        <Clause num="7.1">
          При недостижении заявленной доступности по тарифу (п. 1.1) Заказчик вправе
          обратиться за компенсацией в виде продления подписки на пропорциональный срок.
          Денежный возврат не предусмотрен.
        </Clause>
        <Clause num="7.2">
          Совокупный объём компенсаций в пределах одного календарного месяца не может
          превышать стоимость месячной подписки Заказчика.
        </Clause>
      </Section>

      <Section number="8" title="Изменения SLA">
        <Clause num="8.1">
          Действующая редакция SLA размещена на{" "}
          <a href="/sla" className="text-blue-600 hover:underline">/sla</a> с указанием
          версии. Существенные изменения — за 14 календарных дней.
        </Clause>
      </Section>
    </LegalShell>
  )
}
