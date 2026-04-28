import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { formatDate, formatMoney, LEGAL_TYPE_LABELS } from "@/lib/utils"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TenantSelector, PrintButton } from "./tenant-selector"

function numberToWords(n: number): string {
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
    "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]

  if (n === 0) return "ноль"
  if (n < 0) return "минус " + numberToWords(-n)

  let result = ""
  const h = Math.floor(n / 100)
  const remainder = n % 100
  const t = Math.floor(remainder / 10)
  const u = remainder % 10

  if (h > 0) result += hundreds[h] + " "
  if (remainder < 20 && remainder > 0) {
    result += units[remainder] + " "
  } else {
    if (t > 0) result += tens[t] + " "
    if (u > 0) result += units[u] + " "
  }

  return result.trim()
}

function amountInWords(amount: number): string {
  const millions = Math.floor(amount / 1_000_000)
  const thousands = Math.floor((amount % 1_000_000) / 1000)
  const remainder = amount % 1000

  let result = ""
  if (millions > 0) result += numberToWords(millions) + " миллион(ов) "
  if (thousands > 0) result += numberToWords(thousands) + " тысяч(а) "
  if (remainder > 0) result += numberToWords(remainder)

  return result.trim() + " тенге"
}

export default async function ContractTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { tenantId } = await searchParams

  const tenants = await db.tenant.findMany({
    include: {
      user: true,
      space: { include: { floor: true } },
    },
    orderBy: { companyName: "asc" },
  })

  const building = await db.building.findFirst({ where: { isActive: true } })

  const selectedBase = tenantId ? tenants.find((t) => t.id === tenantId) : null

  const selected = selectedBase
    ? await db.tenant.findUnique({
        where: { id: selectedBase.id },
        include: {
          user: true,
          space: { include: { floor: true } },
          contracts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    : null

  const rate = selected?.customRate
    ?? (selected?.space?.floor.ratePerSqm ?? 0)
  const monthlyRent = selected?.space
    ? selected.space.area * rate
    : 0

  const today = new Date()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/documents"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Шаблон договора аренды</h1>
          <p className="text-sm text-slate-500 mt-0.5">Коммерческая аренда нежилого помещения</p>
        </div>
      </div>

      {/* Tenant selector + print button */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 no-print flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-2">Выбрать арендатора</label>
          <TenantSelector
            selectedId={tenantId}
            tenants={tenants.map((t) => ({
              id: t.id,
              companyName: t.companyName,
              userName: t.user.name,
              spaceNumber: t.space?.number,
            }))}
          />
        </div>
        {selected && <PrintButton />}
      </div>

      {/* Contract document */}
      <div className="bg-white rounded-xl border border-slate-200 p-10 font-serif text-sm leading-relaxed text-slate-900 contract-paper">
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            .contract-paper { border: none !important; border-radius: 0 !important; padding: 20px !important; }
          }
          .contract-paper { font-family: 'Times New Roman', Times, serif; }
          .blank { border-bottom: 1px solid #000; display: inline-block; min-width: 120px; }
          .blank-wide { border-bottom: 1px solid #000; display: inline-block; min-width: 250px; }
        `}</style>

        <h2 className="text-center text-base font-bold uppercase mb-1">Договор аренды нежилого помещения</h2>
        <p className="text-center text-sm mb-6">
          №{" "}
          {selected?.contracts?.[0]?.number ? (
            <strong>{selected.contracts[0].number}</strong>
          ) : (
            <span className="blank" style={{ minWidth: 60 }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
          )}
        </p>

        <div className="flex justify-between mb-8 text-sm">
          <span>
            г. {building?.address?.split(",")[0]?.replace("г.", "")?.trim() ?? "___________"}
          </span>
          <span>
            «{today.getDate()}» {formatDate(today).split(" ")[1]} {today.getFullYear()} г.
          </span>
        </div>

        {/* Parties */}
        <p className="mb-4 indent-8">
          <strong>
            {building?.responsible ? building.responsible : (
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>
          , именуемый(ая) в дальнейшем «<strong>Арендодатель</strong>», с одной стороны, и{" "}
          <strong>
            {selected ? (
              `${selected.companyName}, ${LEGAL_TYPE_LABELS[selected.legalType] ?? selected.legalType}`
            ) : (
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>
          {selected ? `, в лице ${selected.user.name},` : ""} именуемое в дальнейшем «<strong>Арендатор</strong>», с другой стороны, заключили настоящий Договор о нижеследующем:
        </p>

        {/* Section 1 */}
        <p className="font-bold mt-6 mb-2 text-center">1. ПРЕДМЕТ ДОГОВОРА</p>
        <p className="mb-3 indent-8">
          1.1. Арендодатель обязуется предоставить Арендатору во временное возмездное пользование нежилое помещение №{" "}
          <strong>
            {selected?.space ? selected.space.number : (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>
          , расположенное на{" "}
          <strong>
            {selected?.space?.floor.name ?? (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>
          {" "}здания по адресу: <strong>{building?.address ?? <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>}</strong>.
        </p>
        <p className="mb-3 indent-8">
          1.2. Общая площадь помещения составляет{" "}
          <strong>
            {selected?.space ? `${selected.space.area} (${numberToWords(selected.space.area)}) кв. м` : (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>.
        </p>
        <p className="mb-3 indent-8">
          1.3. Помещение предоставляется для использования в качестве:{" "}
          <strong>
            {selected?.category ? selected.category : (
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>.
        </p>
        <p className="mb-3 indent-8">
          1.4. Срок аренды: с{" "}
          <strong>
            {selected?.contractStart ? formatDate(selected.contractStart) : (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>
          {" "}по{" "}
          <strong>
            {selected?.contractEnd ? formatDate(selected.contractEnd) : (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>.
        </p>

        {/* Section 2 */}
        <p className="font-bold mt-6 mb-2 text-center">2. АРЕНДНАЯ ПЛАТА</p>
        <p className="mb-3 indent-8">
          2.1. Ежемесячная арендная плата составляет{" "}
          <strong>
            {selected?.space ? (
              `${formatMoney(monthlyRent)} (${amountInWords(Math.round(monthlyRent))})`
            ) : (
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>{" "}
          в месяц, из расчёта{" "}
          <strong>
            {selected?.space ? `${formatMoney(rate)} за 1 кв. м` : (
              <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            )}
          </strong>.
        </p>
        <p className="mb-3 indent-8">
          2.2. Арендная плата вносится не позднее <strong>10 (десятого)</strong> числа текущего месяца путём перечисления денежных средств на банковский счёт Арендодателя.
        </p>
        <p className="mb-3 indent-8">
          2.3. Коммунальные услуги (отопление, водоснабжение, вывоз мусора, уборка, охрана) в стоимость аренды <strong>не включены</strong> и оплачиваются Арендатором отдельно согласно выставленным счетам.
        </p>
        <p className="mb-3 indent-8">
          2.4. Арендодатель вправе ежегодно индексировать размер арендной платы на уровень инфляции, установленный уполномоченным органом Республики Казахстан, уведомив Арендатора не позднее чем за 30 (тридцать) дней.
        </p>

        {/* Section 3 */}
        <p className="font-bold mt-6 mb-2 text-center">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</p>
        <p className="mb-2 indent-8">3.1. <strong>Арендодатель обязуется:</strong></p>
        <p className="mb-2 ml-8">3.1.1. Передать помещение в состоянии, пригодном для использования по назначению.</p>
        <p className="mb-2 ml-8">3.1.2. Обеспечить техническое обслуживание общих инженерных систем здания.</p>
        <p className="mb-2 ml-8">3.1.3. Не препятствовать Арендатору в пользовании помещением.</p>
        <p className="mb-2 indent-8 mt-2">3.2. <strong>Арендатор обязуется:</strong></p>
        <p className="mb-2 ml-8">3.2.1. Своевременно вносить арендную плату в установленные сроки.</p>
        <p className="mb-2 ml-8">3.2.2. Использовать помещение исключительно по указанному назначению.</p>
        <p className="mb-2 ml-8">3.2.3. Поддерживать помещение в надлежащем санитарном и техническом состоянии.</p>
        <p className="mb-2 ml-8">3.2.4. Не производить перепланировку без письменного согласия Арендодателя.</p>
        <p className="mb-2 ml-8">3.2.5. По истечении срока аренды вернуть помещение в исходном состоянии с учётом нормального износа.</p>

        {/* Section 4 */}
        <p className="font-bold mt-6 mb-2 text-center">4. ОТВЕТСТВЕННОСТЬ СТОРОН</p>
        <p className="mb-3 indent-8">
          4.1. За несвоевременное внесение арендной платы Арендатор уплачивает пеню в размере <strong>1% (одного процента)</strong> от суммы задолженности за каждый день просрочки, но не более <strong>10% (десяти процентов)</strong> от суммы настоящего Договора.
        </p>
        <p className="mb-3 indent-8">
          4.2. Стороны несут ответственность в соответствии с действующим законодательством Республики Казахстан.
        </p>

        {/* Section 5 */}
        <p className="font-bold mt-6 mb-2 text-center">5. ПРОЧИЕ УСЛОВИЯ</p>
        <p className="mb-3 indent-8">
          5.1. Настоящий Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.
        </p>
        <p className="mb-3 indent-8">
          5.2. Все изменения и дополнения к настоящему Договору действительны только при условии их оформления в письменном виде и подписания обеими Сторонами.
        </p>
        <p className="mb-3 indent-8">
          5.3. Споры, возникающие из настоящего Договора, разрешаются путём переговоров, а при невозможности достижения соглашения — в судебном порядке.
        </p>

        {/* Section 6 — Requisites */}
        <p className="font-bold mt-8 mb-4 text-center">6. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</p>
        <div className="grid grid-cols-2 gap-8 text-xs">
          <div className="space-y-2">
            <p className="font-bold text-sm">АРЕНДОДАТЕЛЬ</p>
            <p>
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </p>
            <p>ИИН / БИН: <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
            <p>Банк: <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
            <p>ИИК: <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
            <p>БИК: <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
            <p className="mt-6">Подпись: <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
            <p>МП</p>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-sm">АРЕНДАТОР</p>
            <p>
              <strong>
                {selected ? `${selected.companyName}` : (
                  <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                )}
              </strong>
            </p>
            <p>
              ИИН / БИН:{" "}
              <strong>
                {selected?.bin ?? (
                  <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                )}
              </strong>
            </p>
            <p>
              Банк:{" "}
              <strong>
                {selected?.bankName ?? (
                  <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                )}
              </strong>
            </p>
            <p>
              ИИК:{" "}
              <strong>
                {selected?.iik ?? (
                  <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                )}
              </strong>
            </p>
            <p>
              БИК:{" "}
              <strong>
                {selected?.bik ?? (
                  <span className="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                )}
              </strong>
            </p>
            <p className="mt-6">
              Подпись:{" "}
              <span className="blank-wide">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </p>
            <p>МП</p>
          </div>
        </div>
      </div>
    </div>
  )
}
