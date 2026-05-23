import type { Metadata } from "next"
import { LegalShell, Section, Clause, ClauseList } from "@/components/legal/legal-shell"
import { LEGAL_ENTITY } from "@/lib/legal-entity"

export const metadata: Metadata = {
  title: "SLA — Commrent",
  description: "Соглашение об уровне обслуживания сервиса Commrent",
}

const slaTiers = [
  { plan: "Старт", uptime: "99.0%", maxDowntime: "~7,2 ч", reaction: "до 24 ч" },
  { plan: "Бизнес", uptime: "99.5%", maxDowntime: "~3,6 ч", reaction: "до 8 ч" },
  { plan: "Профи", uptime: "99.9%", maxDowntime: "~43 мин", reaction: "до 4 ч" },
  { plan: "Корпоративный", uptime: "99.95%", maxDowntime: "~22 мин", reaction: "до 1 ч" },
]

const incidentLevels = [
  { level: "Критический (P1)", desc: "Сервис полностью недоступен или затронуты все пользователи", reaction: "до 1 ч", resolve: "до 4 ч" },
  { level: "Высокий (P2)", desc: "Существенно нарушен ключевой функционал", reaction: "до 4 ч", resolve: "до 24 ч" },
  { level: "Средний (P3)", desc: "Частичное нарушение, есть обходные пути", reaction: "до 8 ч", resolve: "до 3 рабочих дней" },
  { level: "Низкий (P4)", desc: "Косметические замечания, вопросы по работе", reaction: "до 24 ч", resolve: "в плановом порядке" },
]

const compensation = [
  { actual: "Менее гарантированной, но ≥ 95%", percent: "10%" },
  { actual: "От 90% до 95%", percent: "25%" },
  { actual: "Менее 90%", percent: "50%" },
]

export default function SlaPage() {
  return (
    <LegalShell
      title="Соглашение об уровне обслуживания (SLA)"
      subtitle={`сервиса ${LEGAL_ENTITY.brand}`}
      effectiveDate={LEGAL_ENTITY.effectiveDate}
    >
      <p>
        Настоящее Соглашение об уровне обслуживания (далее — «SLA») определяет показатели качества Услуг,
        предоставляемых {LEGAL_ENTITY.fullName} (далее — «Исполнитель») в рамках сервиса {LEGAL_ENTITY.brand}{" "}
        (далее — «Сервис»), и условия компенсации в случае их недостижения.
      </p>
      <p>
        SLA является неотъемлемой частью{" "}
        <a href="/offer" className="text-blue-600 hover:underline">Публичной оферты</a>.
      </p>

      <Section number="1" title="Определения">
        <Clause num="1.1">
          Доступность Сервиса — состояние, при котором Заказчик может авторизоваться в Сервисе и использовать
          его основной функционал.
        </Clause>
        <Clause num="1.2">
          Время работы — период, в течение которого Сервис должен быть доступен (24/7, за исключением
          плановых работ).
        </Clause>
        <Clause num="1.3">Простой — период недоступности Сервиса по причинам, зависящим от Исполнителя.</Clause>
        <Clause num="1.4">
          Плановые работы — заранее запланированные технические работы, проводимые в установленные интервалы.
        </Clause>
        <Clause num="1.5">Инцидент — любое событие, приводящее к снижению качества Услуг.</Clause>
      </Section>

      <Section number="2" title="Гарантированный уровень доступности">
        <Clause num="2.1">
          Исполнитель гарантирует следующие уровни доступности Сервиса в зависимости от Тарифа Заказчика:
        </Clause>
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
                  <td className="px-3 py-2 font-medium">{t.plan}</td>
                  <td className="px-3 py-2 font-mono">{t.uptime}</td>
                  <td className="px-3 py-2 text-slate-600">{t.maxDowntime}</td>
                  <td className="px-3 py-2 text-slate-600">{t.reaction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Clause num="2.2">
          Расчёт доступности производится по формуле: (Общее время − Простой) / Общее время × 100%.
        </Clause>
        <Clause num="2.3">
          В расчёт не включаются:
          <ClauseList
            items={[
              "плановые технические работы;",
              "сбои на стороне Заказчика (его интернет-провайдера, оборудования);",
              "сбои сторонних сервисов, интегрированных по запросу Заказчика;",
              "обстоятельства непреодолимой силы.",
            ]}
          />
        </Clause>
      </Section>

      <Section number="3" title="Плановые технические работы">
        <Clause num="3.1">
          Плановые работы проводятся в окне минимальной нагрузки: с 02:00 до 06:00 по времени Астаны (UTC+5).
        </Clause>
        <Clause num="3.2">
          О плановых работах, требующих более 30 минут, Исполнитель уведомляет Заказчиков не менее чем за 24
          часа.
        </Clause>
        <Clause num="3.3">
          Суммарная длительность плановых работ не превышает 4 (четырёх) часов в месяц.
        </Clause>
      </Section>

      <Section number="4" title="Классификация инцидентов и время решения">
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
              {incidentLevels.map((i) => (
                <tr key={i.level} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{i.level}</td>
                  <td className="px-3 py-2 text-slate-600">{i.desc}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{i.reaction}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{i.resolve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section number="5" title="Компенсация при нарушении SLA">
        <Clause num="5.1">
          При недостижении гарантированного уровня доступности в течение Учётного периода Заказчик вправе
          требовать компенсации в следующем порядке:
        </Clause>
        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-3">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Фактическая доступность</th>
                <th className="px-3 py-2 font-medium text-slate-700">Размер компенсации</th>
              </tr>
            </thead>
            <tbody>
              {compensation.map((c) => (
                <tr key={c.actual} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{c.actual}</td>
                  <td className="px-3 py-2 font-medium">{c.percent} стоимости месячной подписки</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Clause num="5.2">
          Компенсация предоставляется в виде продления срока подписки на эквивалентный период.
        </Clause>
        <Clause num="5.3">
          Для получения компенсации Заказчик подаёт письменное обращение на адрес{" "}
          <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-blue-600 hover:underline">
            {LEGAL_ENTITY.email.support}
          </a>{" "}
          в течение 30 (тридцати) календарных дней с момента инцидента.
        </Clause>
        <Clause num="5.4">
          Совокупный размер компенсаций за месяц не может превышать 100% месячной стоимости Тарифа.
        </Clause>
      </Section>

      <Section number="6" title="Резервное копирование">
        <Clause num="6.1">
          Исполнитель осуществляет регулярное резервное копирование данных Заказчиков:
          <ClauseList
            items={[
              "полный бэкап — ежедневно;",
              "инкрементальный бэкап — каждые 6 часов;",
              "срок хранения резервных копий — 30 (тридцать) календарных дней.",
            ]}
          />
        </Clause>
        <Clause num="6.2">
          В случае утраты данных по вине Исполнителя восстановление производится из последней доступной
          резервной копии в кратчайшие сроки.
        </Clause>
        <Clause num="6.3">
          Заказчик имеет право самостоятельно выгружать данные из Сервиса для собственного резервного
          копирования.
        </Clause>
      </Section>

      <Section number="7" title="Заявки в техническую поддержку">
        <Clause num="7.1">
          Каналы обращения:
          <ClauseList
            items={[
              <>электронная почта:{" "}
                <a href={`mailto:${LEGAL_ENTITY.email.support}`} className="text-blue-600 hover:underline">
                  {LEGAL_ENTITY.email.support}
                </a>;</>,
              "чат в Сервисе;",
              "для тарифа Корпоративный — выделенный менеджер.",
            ]}
          />
        </Clause>
        <Clause num="7.2">
          При обращении Заказчик указывает:
          <ClauseList
            items={[
              "название организации и логин;",
              "описание проблемы;",
              "шаги для воспроизведения;",
              "скриншоты при необходимости.",
            ]}
          />
        </Clause>
        <Clause num="7.3">
          Время работы поддержки: рабочие дни с 09:00 до 19:00 по времени Астаны, кроме государственных
          праздников Республики Казахстан. Для тарифов Профи и Корпоративный доступна расширенная поддержка.
        </Clause>
      </Section>

      <Section number="8" title="Исключения">
        <Clause num="8.1">
          Гарантии SLA не распространяются на:
          <ClauseList
            items={[
              "бесплатный (пробный) период использования;",
              "нестандартные конфигурации, выполненные по запросу Заказчика;",
              "случаи, когда нарушение вызвано действиями самого Заказчика;",
              "сбои сторонних сервисов, не входящих в инфраструктуру Исполнителя;",
              "обстоятельства непреодолимой силы.",
            ]}
          />
        </Clause>
      </Section>

      <Section number="9" title="Пересмотр SLA">
        <Clause num="9.1">
          Исполнитель вправе пересматривать показатели SLA, уведомляя Заказчиков не менее чем за 30 (тридцать)
          календарных дней.
        </Clause>
        <Clause num="9.2">
          Изменение показателей в сторону ухудшения требует согласия Заказчиков, оплативших Услуги авансом.
        </Clause>
      </Section>

      <Section number="10" title="Контакты для инцидентов">
        <p>
          E-mail инцидентов:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email.incident}`} className="text-blue-600 hover:underline">
            {LEGAL_ENTITY.email.incident}
          </a>
        </p>
      </Section>
    </LegalShell>
  )
}
