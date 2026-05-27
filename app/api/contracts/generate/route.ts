import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { BUILDING_DEFAULT } from "@/lib/landlord"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { extractDocxPlaceholders, extractXlsxPlaceholders, renderDocx, renderXlsx } from "@/lib/template-engine"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm } from "@/lib/rent"
import { formatMonthsRangeLabel } from "@/lib/service-fee"
import { resolveServiceFeeSettings } from "@/lib/service-fee-settings"
import { buildLegalEntityFullName, buildSignerIntro } from "@/lib/full-name"
import { shortenFio } from "@/lib/declension"
import { formatTenantPlacement, getTenantAreaTotal, getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import {
  LEASE_ADDITIONAL_SERVICES_CLAUSE,
  LEASE_ESF_CLAUSE,
  LEASE_PROLONGATION_CLAUSE,
  buildLeaseRentClause,
  getLeaseRentBasisLabel,
} from "@/lib/contract-clauses"

export const dynamic = "force-dynamic"

// GET /api/contracts/generate?tenantId=xxx&format=docx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `contract:${session.user.id}`), {
    max: 30,
    window: 60 * 60_000,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.` },
      { status: 429 },
    )
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get("tenantId")
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 })
  }

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(tenantId, orgId)
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-tenant access" }, { status: 403 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      user: true,
      space: { include: { floor: true } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: true } } },
      },
      fullFloors: true,
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const landlord = await getOrganizationRequisites(orgId)
  // Дополнительные поля организации, не входящие в ORGANIZATION_REQUISITES_SELECT
  // (он используется широко, не хотим тащить туда новые колонки и ломать другие
  // генераторы). defaultPenaltyPercent — глобальный дефолт пени для всех договоров
  // организации; tenant.penaltyPercent его переопределяет.
  const orgExtras = await db.organization.findUnique({
    where: { id: orgId },
    select: { defaultPenaltyPercent: true },
  })
  const orgPenaltyDefault = orgExtras?.defaultPenaltyPercent ?? 0.5
  const contractNumber = searchParams.get("number") || "01-XXX"
  const today = new Date()
  const fullFloors = tenant.fullFloors ?? []
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const primarySpace = assignedSpaces[0] ?? null
  const tenantBuildingId = primarySpace?.floor.buildingId ?? getTenantPrimaryBuildingId(tenant)
  const buildingTariffsInclude = {
    tariffs: { where: { isActive: true }, orderBy: { type: "asc" } },
  } as const
  const building = tenantBuildingId
    ? await db.building.findFirst({
        where: { id: tenantBuildingId, isActive: true, organizationId: orgId },
        include: buildingTariffsInclude,
      })
    : await db.building.findFirst({
        where: { isActive: true, organizationId: orgId },
        include: buildingTariffsInclude,
      })
  const monthlyRent = calculateTenantMonthlyRent(tenant)
  const ratePerSqm = calculateTenantRatePerSqm(tenant) ?? 0
  // Даты договора. Приоритет: query-параметры start/end (заданы в
  // ContractNumberInput при создании договора) → tenant.contractStart/End
  // (старые значения, для повторной генерации) → today/end-of-year.
  // При наличии query-параметров — синхронизируем Tenant: чтобы proration
  // и cron-задачи (check-deadlines) видели свежие даты.
  const startParam = searchParams.get("start")
  const endParam = searchParams.get("end")
  const parseIsoDate = (s: string | null): Date | null => {
    if (!s) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const startFromQuery = parseIsoDate(startParam)
  const endFromQuery = parseIsoDate(endParam)
  const start = startFromQuery ?? tenant.contractStart ?? today
  const end = endFromQuery ?? tenant.contractEnd
    ?? new Date(today.getFullYear(), 11, 31) // 31 декабря текущего года
  // Синхронизируем Tenant если даты пришли из формы и отличаются.
  if (startFromQuery || endFromQuery) {
    const updates: { contractStart?: Date; contractEnd?: Date } = {}
    if (startFromQuery && (!tenant.contractStart || tenant.contractStart.getTime() !== startFromQuery.getTime())) {
      updates.contractStart = startFromQuery
    }
    if (endFromQuery && (!tenant.contractEnd || tenant.contractEnd.getTime() !== endFromQuery.getTime())) {
      updates.contractEnd = endFromQuery
    }
    if (Object.keys(updates).length > 0) {
      await db.tenant.update({ where: { id: tenant.id }, data: updates }).catch((e) =>
        console.error("[contract] failed to sync tenant dates:", e),
      )
    }
  }
  const placement = formatTenantPlacement(tenant, { emptyLabel: "по договору" })
  const area = getTenantAreaTotal(tenant)
  // Адрес для договоров — приоритет documentAddress (если задан владельцем
  // вручную, например — переведённый с казахского), иначе обычный address
  // (часто приходит с геокодера, может быть на казахском).
  const objectAddress = building?.documentAddress?.trim()
    || building?.address
    || BUILDING_DEFAULT.address
  // Основание подписи для арендатора: приоритет — явно заданное basisDocument,
  // иначе fallback по legalType БЕЗ дублирования БИН (он есть в реквизитах ниже).
  const tenantBasis = tenant.basisDocument?.trim() || inferTenantBasis(tenant)
  const tenantBankAccounts = tenant.bankAccounts ?? []
  const tenantPrimaryBank = tenantBankAccounts.find((account) => account.isPrimary) ?? tenantBankAccounts[0] ?? null
  // Единый источник банковских реквизитов — TenantBankAccount. Legacy-поля
  // tenant.bankName/iik/bik больше не используются как fallback (создавали
  // путаницу — см. AUDIT_2026-05-26.md). Если у тенанта нет primary счёта,
  // владелец должен добавить его через /admin/tenants/[id].
  const tenantBankName = tenantPrimaryBank?.bankName ?? ""
  const tenantIik = tenantPrimaryBank?.iik ?? ""
  const tenantBik = tenantPrimaryBank?.bik ?? ""
  const tenantBankAccountsText = tenantBankAccounts
    .map((account, index) => {
      const label = account.label ? `${account.label}: ` : `Счёт ${index + 1}: `
      return `${label}${account.bankName}, ИИК ${account.iik}, БИК ${account.bik}${account.isPrimary ? " (основной)" : ""}`
    })
    .join("\n")
  const tenantVatRate = coerceKzVatRate(tenant.vatRate, DEFAULT_KZ_VAT_RATE)
  const rentWords = numberToWords(monthlyRent)
  const rentWithWords = `${formatMoney(monthlyRent)} (${rentWords})`
  const rentClause = buildLeaseRentClause({
    tenant,
    area,
    placement,
    fullFloorName: fullFloors.map((floor) => floor.name).filter(Boolean).join("; ") || null,
    monthlyRent,
    ratePerSqm,
  })
  const startDate = start.toLocaleDateString("ru-RU")
  const endDate = end.toLocaleDateString("ru-RU")
  const contractDate = today.toLocaleDateString("ru-RU")
  const contractCity = extractCity(objectAddress)
  const cleaningFeeText = tenant.needsCleaning && tenant.cleaningFee > 0 ? formatMoney(tenant.cleaningFee) : ""

  // Эксплуатационный сбор (Приложение №3) — берётся из настроек здания.
  // Если у здания не задан тариф — placeholders подставятся пустыми.
  const serviceFeeSettings = building
    ? resolveServiceFeeSettings(building)
    : { winterRate: null, summerRate: null, winterMonths: [10, 11, 12, 1, 2, 3, 4], indexationPct: 10, enabled: false }
  const winterMonthsLabel = formatMonthsRangeLabel(serviceFeeSettings.winterMonths)
  const summerMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !serviceFeeSettings.winterMonths.includes(m))
  const summerMonthsLabel = formatMonthsRangeLabel(summerMonths)
  const serviceFeeWinterTotal = serviceFeeSettings.winterRate ? Math.round(serviceFeeSettings.winterRate * area) : 0
  const serviceFeeSummerTotal = serviceFeeSettings.summerRate ? Math.round(serviceFeeSettings.summerRate * area) : 0

  // Строки таблицы доп. услуг для шаблонов с циклом {#items}{name}{tariff}{amount}{/items}.
  // Берём активные тарифы здания + уборку арендатора. amount (стоимость в месяц)
  // для тарифов по счётчику оставляем пустым — она зависит от потребления.
  const serviceItems: { index: string; name: string; tariff: string; amount: string }[] = []
  for (const t of building?.tariffs ?? []) {
    serviceItems.push({
      index: String(serviceItems.length + 1),
      name: t.name,
      tariff: `${formatMoney(t.rate)} ₸/${t.unit}`,
      amount: "",
    })
  }
  if (tenant.needsCleaning && tenant.cleaningFee > 0) {
    serviceItems.push({
      index: String(serviceItems.length + 1),
      name: "Уборка помещения",
      tariff: `${formatMoney(tenant.cleaningFee)} ₸/мес`,
      amount: formatMoney(tenant.cleaningFee),
    })
  }

  const customTemplate = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: "CONTRACT", isActive: true },
    orderBy: { uploadedAt: "desc" },
  }).catch(() => null)

  if (customTemplate) {
    const data: Record<string, unknown> = {
      items: serviceItems,
      contract_number: contractNumber,
      contract_date: contractDate,
      contract_date_long: fmtDate(today),
      contract_start: startDate,
      contract_end: endDate,
      start_date: startDate,
      end_date: endDate,
      start_date_long: fmtDate(start),
      end_date_long: fmtDate(end),

      landlord_name: landlord.fullName,
      landlord_full_name: landlord.fullName, // alias: уже включает «ТОО/АО/ИП»
      landlord_short: landlord.shortName,
      landlord_director: landlord.director,
      // Готовая шапка арендодателя с правильной грамматикой (склонение,
      // отсутствие «в лице» для ИП/ЧСИ). Подставляется как {landlord_intro}.
      landlord_intro: buildSignerIntro({
        legalType: landlord.legalType ?? "TOO",
        fullName: landlord.fullName,
        directorName: landlord.director,
        // landlord.directorPosition приходит из Organization (редактируется в /admin/settings),
        // если пусто — fallback на «директора». Раньше был хардкод (см. AUDIT_2026-05-26.md).
        directorPosition: landlord.directorPosition || "директора",
        basisText: landlord.basis || "Устава",
        calledAs: "Арендодатель",
      }),
      landlord_basis_number: "",  // Заполняется вручную владельцем в реквизитах (если потребуется)
      landlord_basis_date: "",    // Аналогично
      landlord_iin: landlord.iin,
      landlord_bin: landlord.bin || landlord.taxId,
      landlord_basis: landlord.basis,
      landlord_address: landlord.legalAddress,
      landlord_bank: landlord.bank,
      landlord_iik: landlord.iik,
      landlord_bik: landlord.bik,
      landlord_second_bank: landlord.secondBank,
      landlord_second_iik: landlord.secondIik,
      landlord_second_bik: landlord.secondBik,
      landlord_phone: landlord.phone,
      landlord_email: landlord.email,
      landlord_signatory: landlord.directorShort,

      tenant_name: tenant.companyName,
      // Полное имя с префиксом ИП/ТОО/ЧСИ — автоматически из legalType.
      // Не дублирует {tenant_name} — он только название, без формы.
      tenant_full_name: buildLegalEntityFullName({
        legalType: tenant.legalType,
        companyName: tenant.companyName,
        directorName: tenant.directorName ?? tenant.user.name,
      }),
      // Готовая шапка арендатора (без «в лице» для ИП/ЧСИ, со склонением
      // фамилии директора для ТОО/АО).
      tenant_intro: buildSignerIntro({
        legalType: tenant.legalType,
        fullName: buildLegalEntityFullName({
          legalType: tenant.legalType,
          companyName: tenant.companyName,
          directorName: tenant.directorName ?? tenant.user.name,
        }),
        directorName: tenant.directorName ?? tenant.user.name,
        directorPosition: tenant.directorPosition || "директора",
        basisText: tenantBasis || "Устава",
        calledAs: "Арендатор",
      }),
      tenant_legal_type: tenant.legalType,
      tenant_director: tenant.directorName ?? tenant.user.name,
      tenant_director_short: shortenFio(tenant.directorName ?? tenant.user.name),
      tenant_position: tenant.directorPosition ?? "",
      tenant_basis: tenantBasis,
      tenant_basis_document: tenantBasis,
      tenant_basis_number: "", // Можно добавить в реквизиты арендатора отдельно
      tenant_basis_date: "",   // Аналогично
      // Целевое использование помещения. Если арендатор не задал — generic-фраза.
      tenant_use_purpose: tenant.usePurpose?.trim() || "по согласованному Сторонами назначению",
      tenant_bin: tenant.bin ?? tenant.iin ?? "",
      tenant_iin: tenant.iin ?? "",
      tenant_address: tenant.legalAddress ?? "",
      tenant_actual_address: tenant.actualAddress ?? "",
      tenant_phone: tenant.user.phone ?? "",
      tenant_email: tenant.user.email ?? "",
      tenant_bank: tenantBankName,
      tenant_iik: tenantIik,
      tenant_bik: tenantBik,
      tenant_bank_accounts: tenantBankAccountsText,
      tenant_is_vat_payer: tenant.isVatPayer ? "да" : "нет",
      tenant_vat_rate: tenant.isVatPayer ? `${tenantVatRate}` : "",
      tenant_vat_status: tenant.isVatPayer ? `плательщик НДС, ставка ${tenantVatRate}%` : "не является плательщиком НДС",

      placement,
      space_number: assignedSpaces.map((space) => space.number).join(", "),
      floor_name: fullFloors.length > 0
        ? fullFloors.map((floor) => floor.name).filter(Boolean).join(", ")
        : [...new Set(assignedSpaces.map((space) => space.floor.name))].join(", "),
      area,
      area_num: area,
      area_str: `${formatArea(area)} м²`,
      space_area: formatArea(area),

      monthly_rent: formatMoney(monthlyRent),
      monthly_rent_num: monthlyRent,
      monthly_rent_words: rentWords,
      monthly_rent_with_words: rentWithWords,
      rent_in_words: rentWords,
      rate_per_sqm: formatMoney(ratePerSqm),
      rate_per_sqm_num: ratePerSqm,
      rent_clause: rentClause,
      rent_terms_clause: rentClause,
      rent_basis: getLeaseRentBasisLabel(tenant),
      payment_due_day: tenant.paymentDueDay ?? 10,
      // Приоритет: значение у тенанта → дефолт организации → 0.5%. Используем
      // `||` (не `??`) — 0 трактуется как «не задано, используй дефолт»;
      // реальную нулевую пеню никто не пишет (это противоречит смыслу пени).
      // Заменяем `.` на `,` для русской записи (РК-стандарт: «0,5%», не «0.5%»).
      penalty_percent: String(tenant.penaltyPercent || orgPenaltyDefault).replace(".", ","),

      // Каникулы и депозит — добавлены 2026-05-27.
      // rent_free_months: число месяцев каникул (0 = нет каникул)
      // deposit_amount: явная сумма депозита; если NULL — = monthlyRent
      rent_free_months: tenant.rentFreeMonths ?? 0,
      deposit_amount: formatMoney(tenant.depositAmount ?? monthlyRent),
      deposit_in_words: numberToWords(tenant.depositAmount ?? monthlyRent),

      prolongation_clause: LEASE_PROLONGATION_CLAUSE,
      contract_prolongation_clause: LEASE_PROLONGATION_CLAUSE,
      esf_clause: LEASE_ESF_CLAUSE,
      invoice_clause: LEASE_ESF_CLAUSE,
      additional_services_clause: LEASE_ADDITIONAL_SERVICES_CLAUSE,
      utilities_clause: UTILITIES_CLAUSE,
      signage_clause: SIGNAGE_CLAUSE,
      building_name: building?.name ?? "",
      building_address: objectAddress,

      contract_city: contractCity,
      contract_day: String(today.getDate()).padStart(2, "0"),
      contract_month: MONTH[today.getMonth()],
      contract_year: String(today.getFullYear()),
      cleaning_fee: cleaningFeeText,

      // Депозит: новые плейсхолдеры выше (deposit_amount/deposit_in_words)
      // учитывают tenant.depositAmount; здесь старые алиасы для совместимости.
      deposit_amount_words: numberToWords(tenant.depositAmount ?? monthlyRent),
      deposit_amount_with_words: `${formatMoney(tenant.depositAmount ?? monthlyRent)} (${numberToWords(tenant.depositAmount ?? monthlyRent)})`,

      // Подсудность: по умолчанию совпадает с городом договора.
      // Владелец может изменить вручную в шаблоне.
      court_region: "",
      court_city: contractCity,

      // Эксплуатационный сбор (Приложение №3 к договору).
      // Площадь и тарифы автоматически подставляются из настроек здания + площади арендатора.
      tenant_area_sqm: formatArea(area),
      service_fee_winter_rate: serviceFeeSettings.winterRate ? formatMoney(serviceFeeSettings.winterRate) : "",
      service_fee_summer_rate: serviceFeeSettings.summerRate ? formatMoney(serviceFeeSettings.summerRate) : "",
      service_fee_winter_total: serviceFeeWinterTotal > 0 ? formatMoney(serviceFeeWinterTotal) : "",
      service_fee_summer_total: serviceFeeSummerTotal > 0 ? formatMoney(serviceFeeSummerTotal) : "",
      service_fee_winter_months: winterMonthsLabel,
      service_fee_summer_months: summerMonthsLabel,
      service_fee_indexation_pct: String(serviceFeeSettings.indexationPct),
      annex_number: "3",
    }

    let bytes: Buffer
    try {
      const templateBytes = Buffer.from(customTemplate.fileBytes)
      if (customTemplate.format === "DOCX") {
        const placeholders = extractDocxPlaceholders(templateBytes)
        bytes = placeholders.length > 0 ? renderDocx(templateBytes, data) : templateBytes
      } else if (customTemplate.format === "XLSX") {
        const placeholders = await extractXlsxPlaceholders(templateBytes)
        bytes = placeholders.length > 0 ? await renderXlsx(templateBytes, data) : templateBytes
      } else {
        bytes = templateBytes
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "render failed"
      return NextResponse.json({
        error: `Не удалось заполнить загруженный шаблон: ${msg}. Проверьте, что метки написаны в формате {tenant_name}, {monthly_rent_with_words}, {start_date}.`,
      }, { status: 500 })
    }

    try {
      await db.generatedDocument.create({
        data: {
          organizationId: orgId,
          documentType: "CONTRACT",
          number: contractNumber,
          tenantId: tenant.id,
          tenantName: tenant.companyName,
          totalAmount: monthlyRent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fileBytes: bytes as any,
          fileName: `Договор_${contractNumber}_${tenant.companyName.replace(/[\\/:*?"<>|]/g, "_")}.${customTemplate.format.toLowerCase()}`,
          fileSize: bytes.length,
          format: customTemplate.format,
          generatedById: session.user.id,
          templateUsedId: customTemplate.id,
        },
      })
      // Инвалидируем /admin/documents, чтобы созданный договор появился
      // в списке без перезагрузки страницы.
      revalidatePath("/admin/documents")
      revalidatePath("/admin/contracts")
      if (tenant.id) revalidatePath(`/admin/tenants/${tenant.id}`)
    } catch {}

    const ext = customTemplate.format === "DOCX" ? "docx" : customTemplate.format === "XLSX" ? "xlsx" : "pdf"
    const mime = customTemplate.format === "DOCX"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : customTemplate.format === "XLSX"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf"
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="contract_${contractNumber}.${ext}"`,
        "Content-Length": String(bytes.length),
      },
    })
  }

  const p = (
    text: string,
    opts?: {
      bold?: boolean
      align?: (typeof AlignmentType)[keyof typeof AlignmentType]
      size?: number
      spaceAfter?: number
      indent?: boolean
    },
  ) => new Paragraph({
    alignment: opts?.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts?.spaceAfter ?? 100 },
    indent: opts?.indent !== false ? { firstLine: 567 } : undefined,
    children: [new TextRun({ text, bold: opts?.bold, size: opts?.size ?? 22 })],
  })
  const heading = (text: string) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22 })],
  })
  const center = (text: string, opts?: { bold?: boolean; size?: number }) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: opts?.bold ?? true, size: opts?.size ?? 24 })],
  })

  // Полное имя арендатора с автопрефиксом (ИП/ТОО/ЧСИ) — без дублирования,
  // если префикс уже есть в companyName.
  const tenantName = buildLegalEntityFullName({
    legalType: tenant.legalType,
    companyName: tenant.companyName,
    directorName: tenant.directorName ?? tenant.user.name,
  })
  const tenantDir = tenant.directorName ?? tenant.user.name
  const tenantDirShort = shortName(tenantDir)

  const children = [
    center(`Договор № ${contractNumber} аренды нежилого помещения`),
    new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } }),

    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: "г. Усть-Каменогорск", size: 22 }),
        new TextRun({ text: "                                                            ", size: 22 }),
        new TextRun({ text: fmtDate(today), size: 22 }),
      ],
      spacing: { after: 200 },
    }),

    p(`${buildSignerIntro({
      legalType: landlord.legalType ?? "TOO",
      fullName: landlord.fullName,
      directorName: landlord.director,
      directorPosition: landlord.directorPosition || "директора",
      basisText: landlord.basis || "Устава",
      calledAs: "Арендодатель",
    })}, с одной стороны, и ${buildSignerIntro({
      legalType: tenant.legalType,
      fullName: tenantName,
      directorName: tenantDir,
      directorPosition: tenant.directorPosition || "директора",
      basisText: tenantBasis || "Устава",
      calledAs: "Арендатор",
    })}, с другой стороны, заключили настоящий Договор аренды нежилого помещения о нижеследующем:`),

    heading("1. Предмет договора"),
    p(`1.1. Арендодатель обязуется передать, а Арендатор принять во временное владение и пользование (аренду) за плату на срок настоящего Договора нежилое помещение, расположенное по адресу: ${objectAddress}${placement ? `, ${placement}` : ""}, площадью ${formatArea(area)} кв.м., именуемое в дальнейшем «Помещение», в здании, принадлежащем Арендодателю на праве собственности.`),
    p(`1.2. ${UTILITIES_CLAUSE}`),
    p(`1.3. ${SIGNAGE_CLAUSE}`),

    heading("2. Срок аренды"),
    p(`2.1. Договор вступает в силу с ${fmtDate(start)} и действует по ${fmtDate(end)}.`),
    p(LEASE_PROLONGATION_CLAUSE),

    heading("3. Арендная плата и порядок расчётов"),
    p(rentClause),
    p(`3.2. Оплата производится не позднее ${tenant.paymentDueDay} числа каждого месяца на условиях предоплаты, независимо от фактического количества дней в месяце.`),
    p("3.3. Оплата производится путём перечисления на счёт Арендодателя, внесением наличных в кассу или иным согласованным способом."),
    p("3.4. Арендная плата подлежит ежегодной индексации с 1 января на величину официального уровня инфляции, публикуемого Национальным банком Республики Казахстан."),
    p(LEASE_ESF_CLAUSE),
    p(LEASE_ADDITIONAL_SERVICES_CLAUSE),

    heading("4. Права и обязанности Арендодателя"),
    p("4.1. Передать Помещение в трёхдневный срок с момента подписания настоящего договора по Акту приёма-передачи."),
    p("4.2. Производить капитальный ремонт Помещения и обеспечивать беспрепятственное пользование."),
    p("4.3. Своевременно выставлять счета на оплату с предоставлением счёта-фактуры и акта оказанных услуг."),

    heading("5. Права и обязанности Арендатора"),
    p("5.1. В 10-дневный срок с момента подписания принять Помещение."),
    p("5.2. Использовать Помещение по целевому назначению."),
    p("5.3. Своевременно производить арендные платежи."),
    p("5.4. Содержать Помещение в порядке, предусмотренном санитарными и противопожарными правилами."),
    p("5.5. Не осуществлять перестройку и перепланировку без письменного согласия Арендодателя."),
    p("5.6. Возвратить Помещение после прекращения договора в состоянии, пригодном для дальнейшего использования с учётом нормального износа."),

    heading("6. Ответственность сторон"),
    p(`6.1. В случае просрочки уплаты арендных платежей Арендатор обязан уплатить пеню в размере ${tenant.penaltyPercent}% от суммы долга за каждый день просрочки, но не более 10% от суммы Договора.`),

    heading("7. Прочие условия"),
    p("7.1. Споры разрешаются путём переговоров, в претензионном порядке, а впоследствии в суде."),
    p("7.2. Все изменения и дополнения действительны лишь в письменной форме при подписании обеими Сторонами."),
    p("7.3. Договор составлен на русском языке в двух экземплярах, имеющих одинаковую юридическую силу."),

    heading("8. Реквизиты сторон"),
    new Paragraph({ children: [new TextRun("")] }),
    requisitesTable(
      {
        title: "Арендодатель:",
        lines: [
          landlord.fullName,
          `Адрес: ${landlord.legalAddress}`,
          `${landlord.taxIdLabel}: ${landlord.taxId}`,
          `ИИК: ${landlord.iik}`,
          `БИК: ${landlord.bik}`,
          `Банк: ${landlord.bank}`,
          ...(landlord.secondIik
            ? [
                `ИИК 2: ${landlord.secondIik}`,
                `БИК 2: ${landlord.secondBik}`,
                `Банк 2: ${landlord.secondBank}`,
              ]
            : []),
        ],
        signature: landlord.directorShort,
      },
      {
        title: "Арендатор:",
        lines: [
          tenantName,
          tenant.legalAddress ? `Адрес: ${tenant.legalAddress}` : null,
          tenant.iin ? `ИИН: ${tenant.iin}` : null,
          tenant.bin ? `БИН: ${tenant.bin}` : null,
          tenantIik ? `ИИК: ${tenantIik}` : null,
          tenantBik ? `БИК: ${tenantBik}` : null,
          tenantBankName ? `Банк: ${tenantBankName}` : null,
          tenantBankAccounts.length > 1 ? `Все счета: ${tenantBankAccountsText.replace(/\n/g, "; ")}` : null,
          tenant.user.phone ? `Тел: ${tenant.user.phone}` : null,
          tenant.user.email ? `Email: ${tenant.user.email}` : null,
        ].filter(Boolean) as string[],
        signature: tenantDirShort,
      },
    ),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: { run: { size: 22, font: "Times New Roman" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1000 } } },
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeTenant = tenantName.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")
  const safeNumber = contractNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
  const fileName = `Договор_${safeNumber}_${safeTenant}.docx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}

function requisitesTable(left: SideData, right: SideData): Table {
  const cellChildren = (s: SideData) => [
    new Paragraph({
      children: [new TextRun({ text: s.title, bold: true, size: 22 })],
      spacing: { after: 100 },
    }),
    ...s.lines.map((l) => new Paragraph({
      children: [new TextRun({ text: l, size: 20 })],
      spacing: { after: 60 },
    })),
    new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `___________________ ${s.signature}`, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "М.П.", size: 18 })],
    }),
  ]

  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: cellChildren(left), width: { size: 50, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: cellChildren(right), width: { size: 50, type: WidthType.PERCENTAGE } }),
        ],
      }),
    ],
  })
}

type SideData = { title: string; lines: string[]; signature: string }

type TenantBasisInput = {
  legalType?: string | null
  category?: string | null
  companyName?: string | null
  bin?: string | null
  iin?: string | null
}

const UTILITIES_CLAUSE = "Отопление, электроэнергия и водоснабжение предоставляются в рамках эксплуатации здания. За отдельную плату и/или по отдельному соглашению Арендодатель может предоставлять Арендатору телефонную линию, доступ в интернет и иные дополнительные услуги, которые не относятся к арендным платежам и оплачиваются Арендатором отдельно."

const SIGNAGE_CLAUSE = "По согласованию сторон Арендодатель может предоставить Арендатору место для размещения видеокамеры, наружной вывески для рекламы на фасаде здания арендуемого Помещения. Арендатор самостоятельно несёт ответственность за получение разрешения на размещение наружной рекламы и за осуществление платы за её размещение."

const MONTH = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
]

function fmtDate(d: Date) {
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTH[d.getMonth()]} ${d.getFullYear()} г.`
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u00a0\u202f]/g, " ")
}

function formatArea(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u00a0\u202f]/g, " ")
}

// \u0418\u0437\u0432\u043b\u0435\u043a\u0430\u0435\u0442 \u0433\u043e\u0440\u043e\u0434 \u0438\u0437 \u0430\u0434\u0440\u0435\u0441\u0430 \u043e\u0431\u044a\u0435\u043a\u0442\u0430 ("\u0433. \u0423\u0441\u0442\u044c-\u041a\u0430\u043c\u0435\u043d\u043e\u0433\u043e\u0440\u0441\u043a, \u0443\u043b. ..." \u2192 "\u0423\u0441\u0442\u044c-\u041a\u0430\u043c\u0435\u043d\u043e\u0433\u043e\u0440\u0441\u043a").
// \u041d\u0443\u0436\u043d\u043e \u0434\u043b\u044f \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432 \u0441 \u043c\u0435\u0442\u043a\u043e\u0439 {contract_city}; \u0435\u0441\u043b\u0438 \u0433\u043e\u0440\u043e\u0434 \u043d\u0435 \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d \u2014 \u043f\u0443\u0441\u0442\u043e.
function extractCity(address: string): string {
  const m = address.match(/\u0433\.?\s*([\u0410-\u042f\u0401][\u0410-\u042f\u0430-\u044f\u0451\u0401-]+(?:[-\s][\u0410-\u042f\u0401][\u0410-\u042f\u0430-\u044f\u0451\u0401-]+){0,2})/)
  return m ? m[1].trim() : ""
}

/**
 * Fallback фразы «действует на основании …» по форме собственности.
 * Используется когда tenant.basisDocument не заполнен. Источник — Законодательство
 * РК на 2026 год:
 *
 *   ИП       — Уведомление о начале деятельности (в обиходе «Талон»),
 *              ст. 35 Предпринимательского кодекса РК
 *   ТОО/АО   — Устав (ст. 17 Закона «О товариществах с ограниченной…»)
 *   ЧСИ      — Лицензия Министерства юстиции РК (Закон «Об исполнительном
 *              производстве и статусе судебных исполнителей»)
 *   Адвокат  — Лицензия МЮ РК (Закон «Об адвокатской деятельности и
 *              юридической помощи»)
 *   Нотариус — Лицензия МЮ РК (Закон «О нотариате»)
 *   Физлицо  — Документ, удостоверяющий личность
 *
 * Если у тенанта есть собственный basisDocument — он используется напрямую
 * (см. tenantBasis в route.ts), сюда мы попадаем только когда поле пусто.
 */
function inferTenantBasis(tenant: TenantBasisInput) {
  const legalType = (tenant.legalType ?? "").trim().toUpperCase()
  const name = `${tenant.companyName ?? ""} ${tenant.category ?? ""}`.toLowerCase()

  if (legalType === "CHSI" || legalType === "ЧСИ" || name.includes("чси") || name.includes("судебн")) {
    return "лицензии частного судебного исполнителя"
  }

  if (legalType === "ADVOKAT" || legalType === "АДВОКАТ" || name.includes("адвокат")) {
    return "лицензии на занятие адвокатской деятельностью"
  }

  if (legalType === "NOTARIUS" || legalType === "НОТАРИУС" || name.includes("нотариус")) {
    return "лицензии на занятие нотариальной деятельностью"
  }

  if (legalType === "TOO" || legalType === "ТОО" || legalType === "AO" || legalType === "АО") {
    return "Устава"
  }

  if (legalType === "IP" || legalType === "ИП") {
    // «Талон» — терминология, принятая владельцем (см. карточку арендатора).
    // Юридически называется «Уведомление о начале деятельности», в обиходе —
    // «Талон». Если у тенанта заполнен basisDocument с номером — этот fallback
    // не сработает.
    return "Талона о начале деятельности в качестве индивидуального предпринимателя"
  }

  if (legalType === "FIZ" || legalType === "PHYSICAL" || legalType === "INDIVIDUAL" || legalType === "ФИЗ") {
    return "документа, удостоверяющего личность"
  }

  return "регистрационных документов"
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

function numberToWords(value: number): string {
  const rounded = Math.trunc(Math.abs(value))
  if (rounded === 0) return "ноль"

  const groups = [
    { value: 1_000_000_000, forms: ["миллиард", "миллиарда", "миллиардов"] as const, gender: "male" as const },
    { value: 1_000_000, forms: ["миллион", "миллиона", "миллионов"] as const, gender: "male" as const },
    { value: 1_000, forms: ["тысяча", "тысячи", "тысяч"] as const, gender: "female" as const },
  ]
  let rest = rounded
  const parts: string[] = []

  for (const group of groups) {
    const chunk = Math.floor(rest / group.value)
    if (chunk > 0) {
      parts.push(`${chunkToWords(chunk, group.gender)} ${plural(chunk, group.forms)}`)
      rest %= group.value
    }
  }

  if (rest > 0) {
    parts.push(chunkToWords(rest, "male"))
  }

  return parts.join(" ")
}

function chunkToWords(value: number, gender: "male" | "female") {
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
  const maleOnes = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
  const femaleOnes = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]

  const words: string[] = []
  const h = Math.floor(value / 100)
  const t = Math.floor((value % 100) / 10)
  const o = value % 10

  if (h) words.push(hundreds[h])
  if (t === 1) {
    words.push(teens[o])
  } else {
    if (t) words.push(tens[t])
    if (o) words.push((gender === "female" ? femaleOnes : maleOnes)[o])
  }

  return words.join(" ")
}

function plural(value: number, forms: readonly [string, string, string]) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
