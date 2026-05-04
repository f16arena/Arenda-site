export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { BUILDING_DEFAULT } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { TenantSelector } from "../tenant-selector"
import { PrintButton } from "./print-button"
import { ContractNumberInput } from "./contract-number-input"
import { suggestContractNumber } from "@/lib/contract-numbering"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { DocumentArchive } from "@/components/documents/document-archive"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { tenantScope } from "@/lib/tenant-scope"
import { extractDocxPlaceholders, extractXlsxPlaceholders } from "@/lib/template-engine"
import {
  LEASE_ADDITIONAL_SERVICES_CLAUSE,
  LEASE_ESF_CLAUSE,
  LEASE_PROLONGATION_CLAUSE,
  buildLeaseRentClause,
} from "@/lib/contract-clauses"

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>
}

export default async function RentalContractPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const landlord = await getOrganizationRequisites(orgId)

  const { tenantId } = await searchParams

  const allTenantsRaw = await db.tenant.findMany({
    where: tenantScope(orgId),
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true } },
      user: { select: { name: true } },
    },
    orderBy: { companyName: "asc" },
  })
  const allTenants = allTenantsRaw.map((t) => ({
    id: t.id,
    companyName: t.companyName,
    userName: t.user.name,
    spaceNumber: t.space?.number,
  }))

  const tenant = tenantId
    ? await db.tenant.findFirst({
        where: { id: tenantId, ...tenantScope(orgId) },
        include: {
          user: true,
          space: { include: { floor: true } },
          tenantSpaces: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            include: { space: { include: { floor: true } } },
          },
          fullFloors: true,
          contracts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    : null

  // Определяем здание арендатора и предлагаем номер
  const tenantAssignedSpaces = tenant
    ? tenant.tenantSpaces.length > 0
      ? tenant.tenantSpaces.map((item) => item.space)
      : tenant.space ? [tenant.space] : []
    : []
  const tenantBuildingId = tenantAssignedSpaces[0]?.floor.buildingId ?? tenant?.fullFloors?.[0]?.buildingId
  const suggestedNumber = tenant && tenantBuildingId
    ? await suggestContractNumber(tenantBuildingId).catch(() => "01-001")
    : null
  const initialContractNumber = tenant?.contracts?.[0]?.number ?? suggestedNumber ?? "01-001"

  const building = tenantBuildingId
    ? await db.building.findFirst({ where: { id: tenantBuildingId, organizationId: orgId } })
    : await db.building.findFirst({ where: { isActive: true, organizationId: orgId } })

  const today = new Date()
  const contractEnd = new Date(today)
  contractEnd.setFullYear(contractEnd.getFullYear() + 1)
  contractEnd.setDate(contractEnd.getDate() - 1)

  const start = tenant?.contractStart ?? today
  const end = tenant?.contractEnd ?? contractEnd

  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })

  // Площадь и сумма аренды
  const fullFloor = tenant?.fullFloors?.[0]
  const area = fullFloor?.totalArea ?? tenantAssignedSpaces.reduce((sum, space) => sum + space.area, 0)
  const placement = fullFloor?.name
    ?? (tenantAssignedSpaces.length > 0
      ? tenantAssignedSpaces.map((space) => `${space.floor.name}, кабинет ${space.number}`).join("; ")
      : "")
  const monthlyRent = tenant ? calculateTenantMonthlyRent(tenant) : 0
  const rentClause = tenant
    ? buildLeaseRentClause({
        tenant,
        area,
        placement,
        fullFloorName: fullFloor?.name,
        monthlyRent,
      })
    : ""

  const objectAddress = building?.address ?? BUILDING_DEFAULT.address
  const activeContractTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "CONTRACT", isActive: true },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, format: true, fileName: true, fileSize: true, uploadedAt: true, fileBytes: true },
  })
  const templatePlaceholders = activeContractTemplate
    ? activeContractTemplate.format === "DOCX"
      ? extractDocxPlaceholders(Buffer.from(activeContractTemplate.fileBytes))
      : activeContractTemplate.format === "XLSX"
        ? await extractXlsxPlaceholders(Buffer.from(activeContractTemplate.fileBytes))
        : []
    : []

  return (
    <div className="space-y-5 print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/admin/documents" className="text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Договор аренды</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Автозаполнение из карточки арендатора</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TenantSelector tenants={allTenants} />
          {tenant && <PrintButton />}
        </div>
      </div>

      {!tenant ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Выберите арендатора чтобы сформировать договор</p>
        </div>
      ) : (
        <>
        <ContractNumberInput
          initial={initialContractNumber}
          tenantId={tenant.id}
          suggestedNumber={suggestedNumber}
          downloadFormat={activeContractTemplate?.format ?? "DOCX"}
        />
        {activeContractTemplate ? (
          <ActiveContractTemplatePanel
            template={{
              format: activeContractTemplate.format,
              fileName: activeContractTemplate.fileName,
              fileSize: activeContractTemplate.fileSize,
              uploadedAt: activeContractTemplate.uploadedAt,
            }}
            placeholderCount={templatePlaceholders.length}
          />
        ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 max-w-[900px] mx-auto print:p-12 print:border-0 print:rounded-none print:shadow-none print:max-w-full text-[13px] leading-relaxed text-slate-900 dark:text-slate-100 contract-body">
          <p className="text-center font-bold text-base">Договор № {initialContractNumber} аренды нежилого помещения</p>
          <div className="flex justify-between mt-4">
            <span>г. Усть-Каменогорск</span>
            <span>«___» __________ {today.getFullYear()} года</span>
          </div>

          <p className="mt-4 text-justify">
            <b>{landlord.fullName}</b>, именуемый в дальнейшем «Арендодатель», в лице руководителя {landlord.directorShort},
            действующего на основании {landlord.basis}, с одной стороны, и&nbsp;
            <b>{tenant.companyName}</b>, именуем
            {tenant.legalType === "TOO" || tenant.legalType === "AO" ? "ое" : "ый"} в дальнейшем «Арендатор», в лице&nbsp;
            {tenant.directorName ?? tenant.user.name}
            {tenant.directorPosition ? ` (${tenant.directorPosition})` : ""}, с другой стороны,
            заключили настоящий Договор аренды нежилого помещения о нижеследующем:
          </p>

          <h3 className="font-semibold mt-4">1. Предмет договора.</h3>
          <p className="mt-2 text-justify">
            1.1. Арендодатель обязуется передать, а Арендатор принять во временное владение и пользование (аренду) за плату на срок настоящего Договора нежилое помещение,
            в целях использования его для размещения служебного офиса, расположенное по адресу: {objectAddress}
            {placement ? `, ${placement}` : ""},
            а именно помещение площадью – <b>{area}</b> кв.м., именуемое в дальнейшем «Помещение», в здании, принадлежащем Арендодателю на праве собственности.
          </p>
          <p className="mt-2 text-justify">
            1.2. Арендодатель за отдельную плату может предоставлять Арендатору телефонную линию, интернет, отопление и электроэнергию,
            которые не относятся к арендным платежам и оплачиваются Арендатором.
          </p>
          <p className="mt-2 text-justify">
            1.3. Арендодатель может предоставлять Арендатору место для размещения видеокамеры, наружной вывески для рекламы на фасаде здания арендуемого Помещения.
            Арендатор самостоятельно несёт ответственность за получение разрешения на размещение наружной рекламы и за осуществление платы за её размещение.
          </p>
          <p className="mt-2 text-justify">
            1.4. Арендатор оплачивает арендные платежи в порядке и на условиях, определенных в настоящем Договоре.
          </p>

          <h3 className="font-semibold mt-4">2. Срок аренды.</h3>
          <p className="mt-2 text-justify">
            2.1. Договор вступает в силу с «{start.getDate().toString().padStart(2, "0")}» {fmt(start).split(" ")[1]} {start.getFullYear()} года
            и действует по «{end.getDate().toString().padStart(2, "0")}» {fmt(end).split(" ")[1]} {end.getFullYear()} года.
          </p>
          <p className="mt-2 text-justify">
            {LEASE_PROLONGATION_CLAUSE}
          </p>

          <h3 className="font-semibold mt-4">3. Арендная плата и порядок расчётов.</h3>
          <p className="mt-2 text-justify">
            {rentClause}
          </p>
          <p className="mt-2 text-justify">
            3.2. Оплата арендных платежей производится независимо от фактического количества дней в месяце, включая налоги,
            и подлежит оплате не позднее <b>10 числа</b> каждого месяца на условиях предоплаты.
          </p>
          <p className="mt-2 text-justify">
            3.3. Оплата производится Арендатором путём перечисления арендных платежей на счёт Арендодателя,
            внесением наличных денежных средств в его кассу, или согласовав с Арендодателем другой способ оплаты.
          </p>
          <p className="mt-2 text-justify">
            3.4. Арендная плата подлежит ежегодной индексации с 1 января на величину официального уровня инфляции,
            публикуемого Национальным банком Республики Казахстан.
          </p>
          <p className="mt-2 text-justify">
            {LEASE_ESF_CLAUSE}
          </p>
          <p className="mt-2 text-justify">
            {LEASE_ADDITIONAL_SERVICES_CLAUSE}
          </p>

          <h3 className="font-semibold mt-4">4. Права и обязанности Арендодателя.</h3>
          <p className="mt-2 text-justify">4.1.1. В трёхдневный срок с момента подписания настоящего договора передать указанное помещение Арендатору в состоянии, обеспечивающем его нормальное использование, по Акту приёма-передачи.</p>
          <p className="mt-1 text-justify">4.1.2. Производить капитальный ремонт передаваемого Помещения.</p>
          <p className="mt-1 text-justify">4.1.3. Обеспечить беспрепятственное использование Арендатором арендуемых помещений.</p>
          <p className="mt-1 text-justify">4.1.4. Своевременно выставлять Арендатору счёт на оплату.</p>

          <h3 className="font-semibold mt-4">5. Права и обязанности Арендатора.</h3>
          <p className="mt-2 text-justify">5.1.1. В 10-тидневный срок с момента подписания настоящего договора от Арендодателя принять помещение.</p>
          <p className="mt-1 text-justify">5.1.2. Использовать арендуемое помещение исключительно по его целевому назначению.</p>
          <p className="mt-1 text-justify">5.1.3. Своевременно производить арендные платежи.</p>
          <p className="mt-1 text-justify">5.1.4. Содержать нанимаемое Помещение в порядке, предусмотренном санитарными и противопожарными правилами.</p>
          <p className="mt-1 text-justify">5.1.5. Соблюдать противопожарные правила, не допускать перегрузки электросетей.</p>
          <p className="mt-1 text-justify">5.1.6. Не осуществлять без письменного согласия Арендодателя перестройку и перепланировку.</p>
          <p className="mt-1 text-justify">5.1.7. Возвратить помещение после прекращения договора в состоянии, пригодном для использования с учётом нормального износа.</p>

          <h3 className="font-semibold mt-4">6. Ответственность сторон.</h3>
          <p className="mt-2 text-justify">
            6.1. В случае просрочки по уплате арендных платежей Арендатор обязан уплатить пеню в размере 1% от суммы долга за каждый день просрочки,
            но не более 10% от суммы договора.
          </p>

          <h3 className="font-semibold mt-4">7. Прочие условия.</h3>
          <p className="mt-2 text-justify">
            7.1. Споры и разногласия разрешаются путём переговоров, в претензионном порядке, а впоследствии в суде.
          </p>
          <p className="mt-2 text-justify">
            7.2. Все изменения и дополнения к настоящему Договору действительны лишь в письменной форме и подписаны обеими Сторонами.
          </p>
          <p className="mt-2 text-justify">
            7.3. Договор составлен на русском языке в двух идентичных экземплярах, имеющих одинаковую юридическую силу.
          </p>

          <h3 className="font-semibold mt-6">8. Реквизиты сторон.</h3>
          <div className="grid grid-cols-2 gap-8 mt-4 text-[12px]">
            <div>
              <p className="font-bold">Арендодатель:</p>
              <p>{landlord.fullName}</p>
              <p>Адрес: {landlord.legalAddress}</p>
              <p>{landlord.taxIdLabel}: {landlord.taxId}</p>
              <p>ИИК: {landlord.iik}</p>
              <p>БИК: {landlord.bik}</p>
              <p>Банк: {landlord.bank}</p>
              {landlord.secondIik && (
                <>
                  <p>ИИК 2: {landlord.secondIik}</p>
                  <p>БИК 2: {landlord.secondBik}</p>
                  <p>Банк 2: {landlord.secondBank}</p>
                </>
              )}
              <p>Тел: {landlord.phone}</p>
              <p>Email: {landlord.email}</p>
              <div className="mt-6 border-t border-slate-300 pt-2 text-center">
                ___________________ {landlord.directorShort}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">М.П.</p>
              </div>
            </div>
            <div>
              <p className="font-bold">Арендатор:</p>
              <p>{tenant.companyName}</p>
              <p>Адрес: {tenant.legalAddress ?? "—"}</p>
              {tenant.iin && <p>ИИН: {tenant.iin}</p>}
              {tenant.bin && <p>БИН: {tenant.bin}</p>}
              {tenant.iik && <p>ИИК: {tenant.iik}</p>}
              {tenant.bik && <p>БИК: {tenant.bik}</p>}
              {tenant.bankName && <p>Банк: {tenant.bankName}</p>}
              {tenant.user.phone && <p>Тел: {tenant.user.phone}</p>}
              {tenant.user.email && <p>Email: {tenant.user.email}</p>}
              <div className="mt-6 border-t border-slate-300 pt-2 text-center">
                ___________________ {shortName(tenant.directorName ?? tenant.user.name)}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">М.П.</p>
              </div>
            </div>
          </div>
        </div>
        )}
        </>
      )}

      <DocumentArchive organizationId={orgId} documentType="CONTRACT" />

      <style>{`
        @media print {
          body { background: white !important; }
          .contract-body { font-size: 11pt !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  )
}

function ActiveContractTemplatePanel({
  template,
  placeholderCount,
}: {
  template: { format: string; fileName: string; fileSize: number; uploadedAt: Date }
  placeholderCount: number
}) {
  const isDynamic = template.format !== "PDF" && placeholderCount > 0

  return (
    <div className="mx-auto max-w-[900px] rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900 print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">Используется загруженный шаблон договора</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {template.fileName} · {template.format} · {Math.round(template.fileSize / 1024)} КБ · загружен {new Date(template.uploadedAt).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <Link
          href="/admin/settings/document-templates"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Настроить шаблон
        </Link>
      </div>
      <div className={`mt-4 rounded-lg border p-3 text-xs ${
        isDynamic
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      }`}>
        {isDynamic ? (
          <p>Автоподстановка активна: найдено {placeholderCount} меток. Кнопка {template.format} выше сформирует договор по этому шаблону.</p>
        ) : (
          <p>
            Метки автоподстановки не найдены. Кнопка {template.format} выше скачает именно загруженный файл, без старого договора из кода.
            Чтобы данные арендатора, правильный пункт аренды и реквизиты подставлялись автоматически, добавьте метки вида {"{tenant_name}"}, {"{rent_clause}"}, {"{prolongation_clause}"}, {"{esf_clause}"} и загрузите новую версию.
          </p>
        )}
      </div>
    </div>
  )
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}
