import { useEffect, useRef, useState } from "react"
import { Linking, Pressable, Text, View } from "react-native"
import {
  createBuildingNotice,
  getAdminDocuments,
  getAdminRequests,
  getAdminTenants,
  reviewAdminPaymentReport,
  updateAdminRequest,
} from "@/lib/api"
import {
  categoryTitle,
  colors,
  contractStatusColor,
  contractStatusLabel,
  contractTypeLabel,
  documentTypeLabel,
  exactRequestPriority,
  exactRequestStatus,
  fonts,
  isPendingContractStatus,
  isPendingSignatureStatus,
  legalTypeLabel,
  matchesRequestPriority,
  matchesRequestStatus,
  openExternalUrl,
  paymentReviewDefaultReason,
  paymentReviewTitle,
  paymentStatusColor,
  paymentStatusLabel,
  requestLocation,
  requestPriorityColor,
  requestPriorityLabel,
  requestStatusColor,
  requestStatusLabel,
} from "@/app/utils/colors"
import {
  formatArea,
  formatDate,
  formatDateFull,
  formatDateTime,
  formatFileSize,
  formatMoney,
} from "@/app/utils/formatters"
import { dedupeById } from "@/app/utils/types"
import {
  ActionRow,
  AppIcon,
  Card,
  ChoiceRow,
  CompactRow,
  EmptyState,
  Field,
  FlatListPage,
  IconBox,
  InlineMessage,
  MetricGrid,
  NoticeList,
  PrimaryButton,
  QuickActionGrid,
  RequestList,
  SearchField,
  SecondaryButton,
  SectionTitle,
  StatusPill,
} from "@/app/components/ui"
import type { ReactNode } from "react"

export type AdminListVirtualization = {
  pageHeader: ReactNode
  refreshing: boolean
  onRefresh: () => void
  bottomPadding: number
  maxWidth?: number
  alignSelf: "center" | "stretch"
}
import {
  ContractSignPrompt,
  DocumentRow,
  OpenAuthorizedFileButton,
  SignatureRequestCard,
} from "@/app/screens/tenant"
import type {
  AdminBuildingsPayload,
  AdminDocumentsPayload,
  AdminExpectedPayment,
  AdminPaymentReportsPayload,
  AdminRequestsPayload,
  AdminTenantDetailPayload,
  AdminTenantListItem,
  AdminTenantsPayload,
  AdminTodayPayload,
  BuildingNotice,
  MobileBootstrap,
  MobileContractSummary,
  MobileGeneratedDocumentSummary,
  OwnerOverviewPayload,
} from "@/types/mobile"

export function AdminTenants({ payload, buildingId, onNavigate, virtualization }: { payload: AdminTenantsPayload; buildingId?: string; onNavigate: (tab: string) => void; virtualization?: AdminListVirtualization }) {
  const [query, setQuery] = useState("")
  const [localPayload, setLocalPayload] = useState(payload)
  const [busy, setBusy] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const skipFirstSearch = useRef(true)

  useEffect(() => {
    setLocalPayload(payload)
  }, [payload])

  useEffect(() => {
    if (skipFirstSearch.current) {
      skipFirstSearch.current = false
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      fetchPage({ reset: true }).finally(() => setIsSearching(false))
    }, 360)
    return () => clearTimeout(timer)
  }, [query])

  async function fetchPage({ reset }: { reset: boolean }) {
    setBusy(true)
    setMessage(null)
    try {
      const pageInfo = localPayload.pageInfo ?? { limit: 25, nextOffset: localPayload.data.length }
      const nextOffset = reset ? 0 : pageInfo.nextOffset ?? localPayload.data.length
      const next = await getAdminTenants({
        q: query.trim(),
        buildingId,
        offset: nextOffset,
        limit: pageInfo.limit || 25,
      })
      setLocalPayload((current) => ({
        ...next,
        data: reset ? next.data : dedupeById([...current.data, ...next.data]),
      }))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось загрузить арендаторов")
    } finally {
      setBusy(false)
    }
  }

  const filterCard = (
    <>
      <SectionTitle title={buildingId ? "Арендаторы объекта" : "Арендаторы"} />
      <Card>
        <MetricGrid
          variant="row"
          items={[
            { label: "Найдено", value: String(localPayload.counters.total), color: colors.blue },
            { label: "Загружено", value: String(localPayload.data.length), color: colors.teal },
            { label: "С долгом", value: String(localPayload.counters.withDebt), color: localPayload.counters.withDebt > 0 ? colors.red : colors.green },
            { label: "Долг", value: formatMoney(localPayload.counters.debtAmount), color: localPayload.counters.debtAmount > 0 ? colors.orange : colors.green },
          ]}
        />
        <SearchField value={query} onChangeText={setQuery} placeholder="Название, БИН, кабинет" loading={isSearching} />
        {message ? <InlineMessage message={message} tone="error" /> : null}
      </Card>
    </>
  )

  const renderTenantCard = (tenant: AdminTenantListItem) => (
    <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть арендатора ${tenant.companyName}`} onPress={() => onNavigate(`tenant:${tenant.id}`)}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconBox icon="person.2.fill" color={tenant.totalDebt > 0 ? colors.orange : colors.teal} />
          <View style={{ flex: 1 }}>
            <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{tenant.companyName}</Text>
            <Text selectable numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular }}>{tenant.placement}</Text>
          </View>
          <StatusPill label={tenant.totalDebt > 0 ? "Долг" : "ОК"} color={tenant.totalDebt > 0 ? colors.orange : colors.green} />
        </View>
        <MetricGrid
          items={[
            { label: "Площадь", value: formatArea(tenant.area), color: colors.slate },
            { label: "Аренда", value: formatMoney(tenant.monthlyRent), color: colors.blue },
            { label: "Долг", value: formatMoney(tenant.totalDebt), color: tenant.totalDebt > 0 ? colors.red : colors.green },
            { label: "Договоры", value: String(tenant.contracts.total), color: colors.teal },
          ]}
        />
        <CompactRow title="Заявки и документы" subtitle={`${tenant.activeRequests} активных заявок · ${tenant.documents} файлов`} value={tenant.contractEnd ? formatDate(tenant.contractEnd) : undefined} tone={tenant.contracts.expiringSoon > 0 ? colors.red : colors.blue} />
      </Card>
    </Pressable>
  )

  const loadMoreFooter = localPayload.pageInfo?.hasMore ? (
    <PrimaryButton title={busy ? "Загружаем..." : "Загрузить еще"} disabled={busy} onPress={() => fetchPage({ reset: false })} />
  ) : null

  if (virtualization) {
    return (
      <FlatListPage<AdminTenantListItem>
        header={
          <>
            {virtualization.pageHeader}
            {filterCard}
          </>
        }
        data={localPayload.data}
        renderItem={({ item }) => renderTenantCard(item)}
        keyExtractor={(item) => item.id}
        empty={!busy ? <EmptyState title="Арендаторы не найдены" /> : null}
        footer={loadMoreFooter}
        refreshing={virtualization.refreshing}
        onRefresh={virtualization.onRefresh}
        bottomPadding={virtualization.bottomPadding}
        maxWidth={virtualization.maxWidth}
        alignSelf={virtualization.alignSelf}
        initialNumToRender={10}
      />
    )
  }

  return (
    <>
      {filterCard}
      {localPayload.data.length === 0 && !busy ? <EmptyState title="Арендаторы не найдены" /> : null}
      {localPayload.data.map((tenant) => (
        <View key={tenant.id}>{renderTenantCard(tenant)}</View>
      ))}
      {loadMoreFooter}
    </>
  )
}

export function AdminTenantDetail({ tenant, detail, onNavigate }: { tenant: AdminTenantListItem; detail?: AdminTenantDetailPayload | null; onNavigate: (tab: string) => void }) {
  const [mode, setMode] = useState("INFO")
  const taxId = tenant.bin ?? tenant.iin ?? "не указан"
  const contactName = tenant.contact.name ?? "Контакт не указан"
  const contractPeriod = [
    tenant.contractStart ? `с ${formatDateFull(tenant.contractStart)}` : null,
    tenant.contractEnd ? `до ${formatDateFull(tenant.contractEnd)}` : null,
  ].filter(Boolean).join(" ")

  return (
    <>
      <SectionTitle title="Арендатор" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconBox icon="person.2.fill" color={tenant.totalDebt > 0 ? colors.orange : colors.teal} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 20, fontFamily: fonts.black, fontWeight: "900" }}>{tenant.companyName}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{legalTypeLabel(tenant.legalType)} · {taxId}</Text>
          </View>
          <StatusPill label={tenant.totalDebt > 0 ? "Есть долг" : "ОК"} color={tenant.totalDebt > 0 ? colors.orange : colors.green} />
        </View>
        <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{tenant.placement}</Text>
        <MetricGrid
          variant="row"
          items={[
            { label: "Занимает", value: formatArea(tenant.area), color: colors.slate },
            { label: "Аренда", value: formatMoney(tenant.monthlyRent), color: colors.blue },
            { label: "К оплате до", value: `${tenant.paymentDueDay} числа`, color: colors.teal },
            {
              label: "Долг",
              value: formatMoney(tenant.totalDebt),
              color: tenant.totalDebt > 0 ? colors.red : colors.green,
              onPress: () => onNavigate("payments"),
            },
          ]}
        />
      </Card>
      <Card>
        <ChoiceRow
          options={[
            ["INFO", "Инфо"],
            ["PAYMENTS", "Оплаты"],
            ["DOCS", "Документы"],
            ["REQUESTS", "Заявки"],
            ["CONTACTS", "Контакты"],
          ]}
          value={mode}
          onChange={setMode}
        />
      </Card>
      {mode === "INFO" ? (
        <>
          <SectionTitle title="Договор и платежи" />
          <Card>
            <CompactRow
              title={contractPeriod || "Период договора не указан"}
              subtitle={`${tenant.contracts.active} активных · ${tenant.contracts.signed} подписанных · ${tenant.contracts.total} всего`}
              value={tenant.contracts.expiringSoon > 0 ? "истекает" : undefined}
              tone={tenant.contracts.expiringSoon > 0 ? colors.red : colors.slate}
            />
            <CompactRow title="Просрочено" subtitle="Начисления с прошедшим сроком оплаты" value={formatMoney(tenant.overdueDebt)} tone={tenant.overdueDebt > 0 ? colors.red : colors.green} />
            <CompactRow title="Активные заявки" subtitle="Открытые обращения арендатора" value={String(tenant.activeRequests)} tone={tenant.activeRequests > 0 ? colors.orange : colors.green} />
          </Card>
        </>
      ) : null}
      {mode === "PAYMENTS" ? (
        <>
          <SectionTitle title="Оплаты" />
          <Card>
            <MetricGrid
              items={[
                { label: "Аренда", value: formatMoney(tenant.monthlyRent), color: colors.blue },
                { label: "Долг", value: formatMoney(tenant.totalDebt), color: tenant.totalDebt > 0 ? colors.red : colors.green },
                { label: "Просрочено", value: formatMoney(tenant.overdueDebt), color: tenant.overdueDebt > 0 ? colors.red : colors.green },
                { label: "Срок", value: `${tenant.paymentDueDay} числа`, color: colors.teal },
              ]}
            />
            <ActionRow icon="creditcard.fill" title="Открыть оплаты" value="проверка" color={colors.green} onPress={() => onNavigate("payments")} />
          </Card>
          {detail ? (
            <>
              <SectionTitle title="Начисления" />
              {detail.charges.slice(0, 8).map((charge) => (
                <Card key={charge.id}>
                  <CompactRow
                    title={`${charge.period} · ${charge.type}`}
                    subtitle={charge.description ?? (charge.isPaid ? "Оплачено" : "Ожидает оплаты")}
                    value={formatMoney(charge.amount)}
                    tone={charge.isPaid ? colors.green : charge.dueDate && new Date(charge.dueDate) < new Date() ? colors.red : colors.blue}
                  />
                  <CompactRow title="Срок" subtitle={charge.dueDate ? formatDateFull(charge.dueDate) : "без срока"} tone={colors.slate} />
                </Card>
              ))}
              <SectionTitle title="Платежи и чеки" />
              {detail.paymentReports.slice(0, 6).map((report) => (
                <Card key={report.id}>
                  <CompactRow title={formatMoney(report.amount)} subtitle={`${paymentStatusLabel(report.status)} · ${formatDateFull(report.paymentDate)}`} value={report.method} tone={paymentStatusColor(report.status)} />
                  {report.receiptUrl ? <OpenAuthorizedFileButton title={report.receiptName ?? "Чек оплаты"} url={report.receiptUrl} /> : null}
                </Card>
              ))}
            </>
          ) : <EmptyState title="Детальные оплаты загружаются" />}
        </>
      ) : null}
      {mode === "DOCS" ? (
        <>
          <SectionTitle title="Документы" />
          <Card>
            <MetricGrid
              items={[
                { label: "Файлы", value: String(tenant.documents), color: colors.blue },
                { label: "Договоры", value: String(tenant.contracts.total), color: colors.teal },
                { label: "Подписано", value: String(tenant.contracts.signed), color: colors.green },
                { label: "Истекает", value: String(tenant.contracts.expiringSoon), color: tenant.contracts.expiringSoon > 0 ? colors.red : colors.green },
              ]}
            />
            <ActionRow icon="doc.text.fill" title="Документы арендатора" value={String(tenant.documents)} color={colors.blue} onPress={() => onNavigate(`documents:tenant:${tenant.id}`)} />
          </Card>
          {detail ? (
            <>
              {detail.signatureRequests.length > 0 ? (
                <>
                  <SectionTitle title="На подпись" />
                  <Card>
                    {detail.signatureRequests.map((request) => <SignatureRequestCard key={request.id} request={request} />)}
                  </Card>
                </>
              ) : null}
              <SectionTitle title="Договоры" />
              <ContractList contracts={detail.contracts} emptyTitle="Договоры не найдены" onNavigate={onNavigate} />
              <SectionTitle title="АВР, счета, сверки" />
              {detail.generatedDocuments.slice(0, 8).map((document) => (
                <Card key={document.id}>
                  <DocumentRow
                    title={document.fileName}
                    subtitle={`${documentTypeLabel(document.documentType)} · ${document.period ?? "без периода"}${document.totalAmount ? ` · ${formatMoney(document.totalAmount)}` : ""}`}
                    url={document.downloadUrl}
                  />
                </Card>
              ))}
              {detail.generatedDocuments.length === 0 ? <EmptyState title="Сгенерированных документов пока нет" /> : null}
              {detail.tenantDocuments.length > 0 ? (
                <>
                  <SectionTitle title="Файлы арендатора" />
                  <Card>
                    {detail.tenantDocuments.map((document) => (
                      <DocumentRow key={document.id} title={document.name} subtitle={`${document.type} · ${formatDateFull(document.createdAt)}`} url={document.downloadUrl ?? document.fileUrl} />
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          ) : <EmptyState title="Детальные документы загружаются" />}
        </>
      ) : null}
      {mode === "REQUESTS" ? (
        <>
          <SectionTitle title="Заявки" />
          <Card>
            <ActionRow icon="tray.full.fill" title="Активные заявки" value={String(tenant.activeRequests)} color={tenant.activeRequests > 0 ? colors.orange : colors.green} onPress={() => onNavigate("requests")} />
          </Card>
          {detail ? <RequestList requests={detail.requests} onNavigate={onNavigate} /> : <EmptyState title="Детальные заявки загружаются" />}
        </>
      ) : null}
      {mode === "CONTACTS" ? (
        <>
          <SectionTitle title="Контакты" />
          <Card>
            <CompactRow title={contactName} subtitle={tenant.category ? `Категория: ${tenant.category}` : "Основной контакт"} tone={colors.blue} />
            {tenant.contact.phone ? <ActionRow icon="iphone" title="Телефон" value={tenant.contact.phone} color={colors.teal} onPress={() => Linking.openURL(`tel:${tenant.contact.phone}`)} /> : null}
            {tenant.contact.email ? <ActionRow icon="message.fill" title="Email" value={tenant.contact.email} color={colors.blue} onPress={() => Linking.openURL(`mailto:${tenant.contact.email}`)} /> : null}
            {!tenant.contact.phone && !tenant.contact.email ? <Text selectable style={{ color: colors.muted, fontSize: 14 }}>Телефон и email не указаны</Text> : null}
          </Card>
        </>
      ) : null}
      <SectionTitle title="Действия" />
      <Card>
        <ActionRow icon="doc.text.fill" title="Документы арендатора" value={String(tenant.documents)} color={colors.blue} onPress={() => onNavigate(`documents:tenant:${tenant.id}`)} />
        <ActionRow icon="creditcard.fill" title="Оплаты на проверке" value="открыть" color={colors.green} onPress={() => onNavigate("payments")} />
        <ActionRow icon="tray.full.fill" title="Заявки" value={String(tenant.activeRequests)} color={colors.orange} onPress={() => onNavigate("requests")} />
      </Card>
    </>
  )
}

type DocumentListItem =
  | { kind: "contract"; data: MobileContractSummary }
  | { kind: "generated"; data: MobileGeneratedDocumentSummary }

export function AdminDocuments({ payload, tenantId, buildingId, onNavigate, virtualization }: { payload: AdminDocumentsPayload; tenantId?: string; buildingId?: string; onNavigate: (tab: string) => void; virtualization?: AdminListVirtualization }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("ALL")
  const [stage, setStage] = useState("ALL")
  const [localPayload, setLocalPayload] = useState(payload)
  const [busy, setBusy] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const skipFirstFilters = useRef(true)
  const skipFirstQuery = useRef(true)

  useEffect(() => {
    setLocalPayload(payload)
  }, [payload])

  useEffect(() => {
    if (skipFirstFilters.current) {
      skipFirstFilters.current = false
      if (!tenantId) return
    }
    fetchPage({ reset: true, nextCategory: category }).catch(() => null)
  }, [tenantId, category])

  useEffect(() => {
    if (skipFirstQuery.current) {
      skipFirstQuery.current = false
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      fetchPage({ reset: true }).finally(() => setIsSearching(false))
    }, 360)
    return () => clearTimeout(timer)
  }, [query])

  async function fetchPage({ reset, nextCategory = category }: { reset: boolean; nextCategory?: string }) {
    setBusy(true)
    setMessage(null)
    try {
      const pageInfo = localPayload.pageInfo ?? { limit: 30, nextOffset: Math.max(localPayload.contracts.length, localPayload.generated.length) }
      const nextOffset = reset ? 0 : pageInfo.nextOffset ?? Math.max(localPayload.contracts.length, localPayload.generated.length)
      const next = await getAdminDocuments({
        q: query.trim(),
        category: nextCategory,
        tenantId,
        buildingId,
        offset: nextOffset,
        limit: pageInfo.limit || 30,
      })
      setLocalPayload((current) => ({
        ...next,
        contracts: reset ? next.contracts : dedupeById([...current.contracts, ...next.contracts]),
        generated: reset ? next.generated : dedupeById([...current.generated, ...next.generated]),
      }))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось загрузить документы")
    } finally {
      setBusy(false)
    }
  }

  const tenantName = tenantId
    ? localPayload.contracts.find((contract) => contract.tenantId === tenantId)?.tenantName
      ?? localPayload.generated.find((document) => document.tenantId === tenantId)?.tenantName
    : null
  const visibleGenerated = stage === "SIGN" ? [] : localPayload.generated
  const showContracts = category === "ALL" || category === "CONTRACT"
  const visibleContracts = showContracts
    ? localPayload.contracts.filter((contract) => {
        if (stage === "SIGN") return false
        if (stage === "SIGNED") return contract.status === "SIGNED"
        if (stage === "DRAFT") return contract.status === "DRAFT"
        return true
      })
    : []
  const visibleCount = visibleContracts.length + visibleGenerated.length
  const signatureRequests = (localPayload.signatureRequests ?? []).filter((request) => isPendingSignatureStatus(request.status))
  const signatureContracts = showContracts
    ? localPayload.contracts.filter((contract) => isPendingContractStatus(contract.status))
    : []
  const signatureCount = signatureRequests.length + signatureContracts.length
  const showSignatureSection = (stage === "ALL" || stage === "SIGN") && signatureCount > 0

  const filterCard = (
    <>
      <SectionTitle title={tenantName ? `Документы: ${tenantName}` : buildingId ? "Документы объекта" : "Документы"} />
      <Card>
        <MetricGrid
          items={[
            { label: "Всего", value: String(localPayload.counters.total), color: colors.blue },
            { label: "Договоры", value: String(localPayload.counters.contracts), color: colors.teal },
            { label: "Счета", value: String(localPayload.counters.invoices), color: colors.orange },
            { label: "На подпись", value: String(localPayload.counters.pendingSignatures), color: localPayload.counters.pendingSignatures > 0 ? colors.orange : colors.green },
          ]}
        />
        <ChoiceRow
          options={[
            ["ALL", "Все"],
            ["CONTRACT", "Договор"],
            ["ACT", "АВР"],
            ["INVOICE", "Счет"],
            ["RECONCILIATION", "Сверка"],
          ]}
          value={category}
          onChange={setCategory}
        />
        <ChoiceRow
          options={[
            ["ALL", "Все статусы"],
            ["SIGN", "На подпись"],
            ["SIGNED", "Подписано"],
            ["DRAFT", "Черновики"],
          ]}
          value={stage}
          onChange={setStage}
        />
        <SearchField value={query} onChangeText={setQuery} placeholder="Арендатор, номер, период" loading={isSearching} />
        {message ? <InlineMessage message={message} tone="error" /> : null}
      </Card>
      {showSignatureSection ? (
        <>
          <SectionTitle title="На подпись" />
          <Card>
            {signatureRequests.map((request) => <SignatureRequestCard key={request.id} request={request} />)}
            {signatureContracts.slice(0, 6).map((contract) => <ContractSignPrompt key={contract.id} contract={contract} />)}
          </Card>
        </>
      ) : null}
    </>
  )

  const loadMoreFooter = localPayload.pageInfo?.hasMore ? (
    <PrimaryButton title={busy ? "Загружаем..." : "Загрузить еще"} disabled={busy} onPress={() => fetchPage({ reset: false })} />
  ) : null

  if (virtualization) {
    const items: DocumentListItem[] = []
    if (showContracts && visibleContracts.length > 0) {
      items.push(...visibleContracts.map((contract) => ({ kind: "contract", data: contract } as DocumentListItem)))
    }
    if (visibleGenerated.length > 0) {
      items.push(...visibleGenerated.map((doc) => ({ kind: "generated", data: doc } as DocumentListItem)))
    }

    const headerWithSections = (
      <>
        {virtualization.pageHeader}
        {filterCard}
        {showContracts && localPayload.contracts.length > 0 && visibleContracts.length > 0 ? (
          <SectionTitle title="Договоры" />
        ) : null}
      </>
    )

    return (
      <FlatListPage<DocumentListItem>
        header={headerWithSections}
        data={items}
        renderItem={({ item, index }) => {
          // When transitioning from contracts to generated, render the generated SectionTitle.
          const prev = index > 0 ? items[index - 1] : null
          const isFirstGenerated = item.kind === "generated" && (!prev || prev.kind !== "generated")
          return (
            <>
              {isFirstGenerated ? <View style={{ marginBottom: 14 }}><SectionTitle title={categoryTitle(category)} /></View> : null}
              {item.kind === "contract"
                ? <ContractRow contract={item.data} onNavigate={onNavigate} />
                : <GeneratedDocumentRow document={item.data} onNavigate={onNavigate} />}
            </>
          )
        }}
        keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        empty={visibleCount + (showSignatureSection ? signatureCount : 0) === 0 && !busy ? <EmptyState title="Документы не найдены" /> : null}
        footer={loadMoreFooter}
        refreshing={virtualization.refreshing}
        onRefresh={virtualization.onRefresh}
        bottomPadding={virtualization.bottomPadding}
        maxWidth={virtualization.maxWidth}
        alignSelf={virtualization.alignSelf}
        initialNumToRender={10}
      />
    )
  }

  return (
    <>
      {filterCard}
      {visibleCount + (showSignatureSection ? signatureCount : 0) === 0 && !busy ? <EmptyState title="Документы не найдены" /> : null}
      {showContracts && localPayload.contracts.length > 0 ? (
        <>
          <SectionTitle title="Договоры" />
          <ContractList contracts={visibleContracts} emptyTitle="Договоры не найдены" onNavigate={onNavigate} />
        </>
      ) : null}
      {visibleGenerated.length > 0 ? (
        <>
          <SectionTitle title={categoryTitle(category)} />
          <GeneratedDocumentList documents={visibleGenerated} onNavigate={onNavigate} />
        </>
      ) : null}
      {loadMoreFooter}
    </>
  )
}

function ContractList({ contracts, emptyTitle, onNavigate }: { contracts: MobileContractSummary[]; emptyTitle: string; onNavigate?: (tab: string) => void }) {
  if (contracts.length === 0) return <EmptyState title={emptyTitle} />
  return (
    <>
      {contracts.map((contract) => (
        <ContractRow key={contract.id} contract={contract} onNavigate={onNavigate} />
      ))}
    </>
  )
}

function ContractRow({ contract, onNavigate }: { contract: MobileContractSummary; onNavigate?: (tab: string) => void }) {
  const color = contractStatusColor(contract.status)
  const canOpen = !!contract.webUrl
  const content = (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: canOpen ? 1 : 0.72 }}>
        <IconBox icon="doc.on.doc.fill" color={color} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{contractTypeLabel(contract.type)} № {contract.number}</Text>
          <Text selectable numberOfLines={1} style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{contract.tenantName}</Text>
        </View>
        <StatusPill label={contractStatusLabel(contract.status)} color={color} />
      </View>
      <CompactRow
        title={contract.startDate ? `С ${formatDate(contract.startDate)}` : "Дата начала не указана"}
        subtitle={contract.endDate ? `до ${formatDate(contract.endDate)}` : "без даты окончания"}
        value={contract.signedAt ? "подписан" : undefined}
        tone={color}
      />
      {canOpen ? <SecondaryButton title={isPendingContractStatus(contract.status) ? "Открыть подписание" : "Открыть"} icon="arrow.up.right.square" onPress={() => openExternalUrl(contract.webUrl!)} /> : null}
    </Card>
  )
  return onNavigate ? (
    <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть договор ${contract.number}`} onPress={() => onNavigate(`contract:${contract.id}`)}>
      {content}
    </Pressable>
  ) : content
}

function GeneratedDocumentRow({ document, onNavigate }: { document: MobileGeneratedDocumentSummary; onNavigate?: (tab: string) => void }) {
  return (
    <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть документ ${document.fileName}`} onPress={() => onNavigate ? onNavigate(`document:generated:${document.id}`) : null}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconBox icon="doc.text.fill" color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontFamily: fonts.black, fontWeight: "900" }}>{document.fileName}</Text>
            <Text selectable numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{document.tenantName} · {documentTypeLabel(document.documentType)}</Text>
          </View>
          <AppIcon name="chevron.right" size={18} color={colors.muted} />
        </View>
        <MetricGrid
          items={[
            { label: "Период", value: document.period ?? "без периода", color: colors.slate },
            { label: "Сумма", value: document.totalAmount ? formatMoney(document.totalAmount) : "без суммы", color: colors.green },
          ]}
        />
      </Card>
    </Pressable>
  )
}

function GeneratedDocumentList({ documents, onNavigate }: { documents: MobileGeneratedDocumentSummary[]; onNavigate?: (tab: string) => void }) {
  return (
    <>
      {documents.map((document) => (
        <GeneratedDocumentRow key={document.id} document={document} onNavigate={onNavigate} />
      ))}
    </>
  )
}

export function AdminDocumentDetail({
  payload,
  kind,
  id,
  onNavigate,
}: {
  payload: AdminDocumentsPayload
  kind?: string
  id?: string
  onNavigate: (tab: string) => void
}) {
  const contract = kind === "contract" ? payload.contracts.find((item) => item.id === id) : null
  const document = kind === "generated" ? payload.generated.find((item) => item.id === id) : null

  if (contract) {
    const color = contractStatusColor(contract.status)
    return (
      <>
        <SectionTitle title="Документ" />
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconBox icon="doc.on.doc.fill" color={color} />
            <View style={{ flex: 1 }}>
              <Text selectable style={{ color: colors.text, fontSize: 19, fontFamily: fonts.black, fontWeight: "900" }}>{contractTypeLabel(contract.type)} № {contract.number}</Text>
              <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{contract.tenantName}</Text>
            </View>
            <StatusPill label={contractStatusLabel(contract.status)} color={color} />
          </View>
          <MetricGrid
            items={[
              { label: "Начало", value: contract.startDate ? formatDateFull(contract.startDate) : "не указано", color: colors.slate },
              { label: "Окончание", value: contract.endDate ? formatDateFull(contract.endDate) : "без даты", color: colors.blue },
              { label: "Статус", value: contractStatusLabel(contract.status), color },
              { label: "Подписан", value: contract.signedAt ? formatDateFull(contract.signedAt) : "нет", color: contract.signedAt ? colors.green : colors.orange },
            ]}
          />
        </Card>
        <SectionTitle title="Действия" />
        <Card>
          {contract.webUrl ? <ActionRow icon="arrow.up.right.square" title={isPendingContractStatus(contract.status) ? "Открыть подписание" : "Открыть документ"} value="web" color={colors.blue} onPress={() => openExternalUrl(contract.webUrl!)} /> : null}
          <ActionRow icon="person.2.fill" title="Арендатор" value="открыть" color={colors.teal} onPress={() => onNavigate(`tenant:${contract.tenantId}`)} />
          <ActionRow icon="doc.text.fill" title="Все документы арендатора" value="открыть" color={colors.blue} onPress={() => onNavigate(`documents:tenant:${contract.tenantId}`)} />
        </Card>
      </>
    )
  }

  if (document) {
    return (
      <>
        <SectionTitle title="Документ" />
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconBox icon="doc.text.fill" color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text selectable style={{ color: colors.text, fontSize: 19, fontFamily: fonts.black, fontWeight: "900" }}>{documentTypeLabel(document.documentType)}</Text>
              <Text selectable numberOfLines={2} style={{ color: colors.muted, fontSize: 13 }}>{document.fileName}</Text>
            </View>
            <StatusPill label={document.format.toUpperCase()} color={colors.blue} />
          </View>
          <MetricGrid
            items={[
              { label: "Арендатор", value: document.tenantName, color: colors.teal },
              { label: "Период", value: document.period ?? "не указан", color: colors.slate },
              { label: "Сумма", value: document.totalAmount ? formatMoney(document.totalAmount) : "без суммы", color: colors.green },
              { label: "Дата", value: formatDateFull(document.generatedAt), color: colors.blue },
            ]}
          />
          <CompactRow title="Номер" subtitle={document.number ?? "номер не указан"} value={formatFileSize(document.fileSize)} tone={colors.slate} />
        </Card>
        <SectionTitle title="Действия" />
        <Card>
          <OpenAuthorizedFileButton title={document.fileName} url={document.downloadUrl} />
          {document.tenantId ? <ActionRow icon="person.2.fill" title="Арендатор" value="открыть" color={colors.teal} onPress={() => onNavigate(`tenant:${document.tenantId}`)} /> : null}
          {document.tenantId ? <ActionRow icon="doc.text.fill" title="Документы арендатора" value="открыть" color={colors.blue} onPress={() => onNavigate(`documents:tenant:${document.tenantId}`)} /> : null}
          <ActionRow icon="signature" title="Подписание" value="черновик" color={colors.orange} onPress={() => onNavigate("documents")} />
        </Card>
      </>
    )
  }

  return <EmptyState title="Документ не найден в загруженном списке" />
}

export function AdminToday({ payload, notices, bootstrap, onChanged, onNavigate }: { payload: AdminTodayPayload; notices: BuildingNotice[]; bootstrap: MobileBootstrap; onChanged: () => void; onNavigate: (tab: string) => void }) {
  const canNotice = ["OWNER", "ADMIN", "FACILITY_MANAGER"].includes(bootstrap.user.role ?? "")
  return (
    <>
      <SectionTitle title="Сегодня" />
      <Card>
        <MetricGrid
          variant="row"
          items={[
            {
              label: "Открытые заявки",
              value: String(payload.counters.openRequests),
              color: colors.blue,
              onPress: () => onNavigate("requests"),
              badge: payload.counters.openRequests,
            },
            {
              label: "Срочные заявки",
              value: String(payload.counters.urgentRequests),
              color: colors.red,
              onPress: () => onNavigate("requests"),
              badge: payload.counters.urgentRequests,
            },
            {
              label: "Оплаты на проверке",
              value: String(payload.counters.pendingPayments),
              color: colors.green,
              onPress: () => onNavigate("payments"),
              badge: payload.counters.pendingPayments,
            },
            {
              label: "Просроченный долг",
              value: formatMoney(payload.counters.overdueAmount),
              color: payload.counters.overdueAmount > 0 ? colors.orange : colors.green,
              onPress: () => onNavigate("payments"),
            },
          ]}
        />
      </Card>
      <SectionTitle title="Быстрый доступ" />
      <QuickActionGrid
        actions={[
          {
            icon: "building.2.fill",
            title: "Объекты",
            subtitle: `${payload.buildings.length} зданий`,
            color: colors.blue,
            onPress: () => onNavigate("buildings"),
          },
          {
            icon: "person.2.fill",
            title: "Арендаторы",
            subtitle: "список и долги",
            color: colors.teal,
            onPress: () => onNavigate("tenants"),
          },
          {
            icon: "doc.on.doc.fill",
            title: "Документы",
            subtitle: `${payload.counters.pendingSignatures} на подпись`,
            color: payload.counters.pendingSignatures > 0 ? colors.orange : colors.blue,
            onPress: () => onNavigate("documents"),
          },
          {
            icon: "creditcard.fill",
            title: "Оплаты",
            subtitle: `${payload.counters.pendingPayments} на проверке`,
            color: colors.green,
            onPress: () => onNavigate("payments"),
          },
        ]}
      />
      <StaffQuickSearch onNavigate={onNavigate} />
      {canNotice ? <NoticeComposer buildings={payload.buildings} onChanged={onChanged} /> : null}
      <SectionTitle title="Последние заявки" />
      <RequestList requests={payload.recent.requests} onNavigate={onNavigate} />
      <SectionTitle title="Оплаты на проверке" />
      <Card>
        {payload.recent.paymentReports.map((report) => (
          <CompactRow key={report.id} title={report.tenant.companyName} subtitle={`${formatMoney(report.amount)} · ${report.method} · ${formatDate(report.paymentDate)}`} tone={colors.green} />
        ))}
        {payload.recent.paymentReports.length === 0 ? <EmptyState inline icon="creditcard.fill" title="Оплат на проверке нет" subtitle="Новые подтверждения оплат появятся здесь." /> : null}
      </Card>
      <SectionTitle title="Объявления" />
      <NoticeList notices={notices.slice(0, 4)} />
    </>
  )
}

function StaffQuickSearch({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [query, setQuery] = useState("")
  const [tenants, setTenants] = useState<AdminTenantListItem[]>([])
  const [contracts, setContracts] = useState<MobileContractSummary[]>([])
  const [documents, setDocuments] = useState<MobileGeneratedDocumentSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setTenants([])
      setContracts([])
      setDocuments([])
      setMessage(null)
      return
    }

    const timer = setTimeout(async () => {
      setBusy(true)
      setMessage(null)
      try {
        const [tenantResult, documentResult] = await Promise.all([
          getAdminTenants({ q: trimmed, limit: 5 }),
          getAdminDocuments({ q: trimmed, limit: 6 }),
        ])
        setTenants(tenantResult.data)
        setContracts(documentResult.contracts)
        setDocuments(documentResult.generated)
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Не удалось выполнить поиск")
      } finally {
        setBusy(false)
      }
    }, 320)

    return () => clearTimeout(timer)
  }, [query])

  const hasResults = tenants.length > 0 || contracts.length > 0 || documents.length > 0

  return (
    <>
      <SectionTitle title="Быстрый поиск" />
      <Card>
        <SearchField value={query} onChangeText={setQuery} placeholder="Арендатор, БИН, договор, счет" />
        {busy ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ищем...</Text> : null}
        {message ? <InlineMessage message={message} tone="error" /> : null}
        {tenants.slice(0, 3).map((tenant) => (
          <ActionRow key={tenant.id} icon="person.2.fill" title={tenant.companyName} value={formatMoney(tenant.totalDebt)} color={tenant.totalDebt > 0 ? colors.orange : colors.teal} onPress={() => onNavigate(`tenant:${tenant.id}`)} />
        ))}
        {contracts.slice(0, 2).map((contract) => (
          <ActionRow key={contract.id} icon="doc.on.doc.fill" title={`${contractTypeLabel(contract.type)} № ${contract.number}`} value={contractStatusLabel(contract.status)} color={contractStatusColor(contract.status)} onPress={() => onNavigate(`contract:${contract.id}`)} />
        ))}
        {documents.slice(0, 2).map((document) => (
          <ActionRow key={document.id} icon="doc.text.fill" title={document.fileName} value={documentTypeLabel(document.documentType)} color={colors.blue} onPress={() => onNavigate(`document:generated:${document.id}`)} />
        ))}
        {query.trim().length >= 2 && !busy && !hasResults ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Ничего не найдено</Text> : null}
      </Card>
    </>
  )
}

export function AdminRequests({ payload, buildingId, onChanged, onNavigate, virtualization }: { payload: AdminRequestsPayload; buildingId?: string; onChanged: () => void; onNavigate: (tab: string) => void; virtualization?: AdminListVirtualization }) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("ACTIVE")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [localPayload, setLocalPayload] = useState(payload)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setLocalPayload(payload)
  }, [payload])

  useEffect(() => {
    fetchFilteredRequests().catch(() => null)
  }, [statusFilter, priorityFilter])

  async function fetchFilteredRequests() {
    setBusy(true)
    setMessage(null)
    try {
      const next = await getAdminRequests({
        status: exactRequestStatus(statusFilter),
        priority: exactRequestPriority(priorityFilter),
        buildingId,
      })
      setLocalPayload(next)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось загрузить заявки")
    } finally {
      setBusy(false)
    }
  }

  const visibleRequests = localPayload.data.filter((request) => {
    const haystack = `${request.title} ${request.description} ${request.tenant.companyName} ${request.type}`.toLowerCase()
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase())
    return matchesQuery && matchesRequestStatus(request.status, statusFilter) && matchesRequestPriority(request.priority, priorityFilter)
  })

  const filterCard = (
    <>
      <SectionTitle title={buildingId ? "Заявки объекта" : "Заявки"} />
      <Card>
        <MetricGrid
          items={[
            { label: "Открыто", value: String(localPayload.counters.open), color: colors.blue },
            { label: "Срочно", value: String(localPayload.counters.urgent), color: colors.red },
            { label: "Закрыто", value: String(localPayload.counters.done), color: colors.green },
          ]}
        />
        <ChoiceRow
          options={[
            ["ACTIVE", "Активные"],
            ["NEW", "Новые"],
            ["IN_PROGRESS", "В работе"],
            ["DONE", "Готово"],
            ["ALL", "Все"],
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <ChoiceRow
          options={[
            ["ALL", "Все"],
            ["URGENT", "Срочные"],
            ["HIGH", "Высокий"],
            ["NORMAL", "Обычные"],
            ["LOW", "Низкий"],
          ]}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />
        <SearchField value={query} onChangeText={setQuery} placeholder="Арендатор, заявка, описание" />
        {message ? <InlineMessage message={message} tone="error" /> : null}
      </Card>
    </>
  )

  type RequestItem = AdminRequestsPayload["data"][number]
  const renderRequestCard = (request: RequestItem) => (
    <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть заявку ${request.title}`} onPress={() => onNavigate(`request:${request.id}`)}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconBox icon="tray.full.fill" color={requestPriorityColor(request.priority)} />
          <View style={{ flex: 1 }}>
            <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{request.title}</Text>
            <Text selectable numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{request.tenant.companyName} · {requestStatusLabel(request.status)}</Text>
          </View>
          <StatusPill label={requestPriorityLabel(request.priority)} color={requestPriorityColor(request.priority)} />
        </View>
        <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
        <CompactRow title="Локация" subtitle={requestLocation(request)} value={`${request._count?.comments ?? 0}`} tone={colors.blue} />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton title="В работу" icon="play.fill" onPress={async () => { await updateAdminRequest({ requestId: request.id, status: "IN_PROGRESS" }); onChanged(); await fetchFilteredRequests() }} />
          <SecondaryButton title="Готово" icon="checkmark" onPress={async () => { await updateAdminRequest({ requestId: request.id, status: "DONE" }); onChanged(); await fetchFilteredRequests() }} />
        </View>
      </Card>
    </Pressable>
  )

  if (virtualization) {
    return (
      <FlatListPage<RequestItem>
        header={
          <>
            {virtualization.pageHeader}
            {filterCard}
          </>
        }
        data={visibleRequests}
        renderItem={({ item }) => renderRequestCard(item)}
        keyExtractor={(item) => item.id}
        empty={!busy ? <EmptyState title="Заявки не найдены" /> : null}
        refreshing={virtualization.refreshing}
        onRefresh={virtualization.onRefresh}
        bottomPadding={virtualization.bottomPadding}
        maxWidth={virtualization.maxWidth}
        alignSelf={virtualization.alignSelf}
        initialNumToRender={8}
      />
    )
  }

  return (
    <>
      {filterCard}
      {visibleRequests.map((request) => (
        <View key={request.id}>{renderRequestCard(request)}</View>
      ))}
      {visibleRequests.length === 0 && !busy ? <EmptyState title="Заявки не найдены" /> : null}
    </>
  )
}

export function AdminRequestDetail({
  request,
  onChanged,
  onNavigate,
}: {
  request: AdminRequestsPayload["data"][number]
  onChanged: () => void
  onNavigate: (tab: string) => void
}) {
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function changeStatus(status: string) {
    setBusy(true)
    setMessage(null)
    try {
      await updateAdminRequest({ requestId: request.id, status, comment: comment.trim() || undefined })
      setComment("")
      setMessage("Заявка обновлена")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось обновить заявку")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title="Заявка" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconBox icon="tray.full.fill" color={requestPriorityColor(request.priority)} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 19, fontFamily: fonts.black, fontWeight: "900" }}>{request.title}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{formatDateTime(request.createdAt)} · {request.type}</Text>
          </View>
          <StatusPill label={requestStatusLabel(request.status)} color={requestStatusColor(request.status)} />
        </View>
        <MetricGrid
          items={[
            { label: "Приоритет", value: requestPriorityLabel(request.priority), color: requestPriorityColor(request.priority) },
            { label: "Комментарии", value: String(request._count?.comments ?? 0), color: colors.blue },
            { label: "Обновлена", value: formatDate(request.updatedAt), color: colors.teal },
          ]}
        />
        <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{request.description}</Text>
      </Card>
      <SectionTitle title="Арендатор" />
      <Card>
        <ActionRow icon="person.2.fill" title={request.tenant.companyName} value="открыть" color={colors.teal} onPress={() => onNavigate(`tenant:${request.tenant.id}`)} />
        <CompactRow title="Локация" subtitle={requestLocation(request)} tone={colors.blue} />
      </Card>
      <SectionTitle title="Работа" />
      <Card>
        <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Что сделали или что нужно уточнить" multiline />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton title={busy ? "..." : "В работу"} icon="play.fill" onPress={() => changeStatus("IN_PROGRESS")} />
          <SecondaryButton title={busy ? "..." : "Готово"} icon="checkmark" onPress={() => changeStatus("DONE")} />
          <SecondaryButton title={busy ? "..." : "Закрыть"} icon="xmark" onPress={() => changeStatus("CLOSED")} />
        </View>
        {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
      </Card>
      <SectionTitle title="Комментарии" />
      <Card>
        {(request.comments ?? []).map((item) => (
          <CompactRow
            key={item.id}
            title={item.author.name ?? item.author.email ?? "Сотрудник"}
            subtitle={item.text}
            value={formatDate(item.createdAt)}
            tone={colors.blue}
          />
        ))}
        {(request.comments ?? []).length === 0 ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Комментариев пока нет</Text> : null}
      </Card>
    </>
  )
}

export function AdminPayments({ payload, buildingId, onChanged }: { payload: AdminPaymentReportsPayload; buildingId?: string; onChanged: () => void }) {
  const [mode, setMode] = useState("ALL")
  const [pendingReview, setPendingReview] = useState<{
    report: AdminPaymentReportsPayload["data"][number]
    action: "confirm" | "dispute" | "reject"
  } | null>(null)
  const [reviewReason, setReviewReason] = useState("")
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)
  const expectedPayments = payload.expectedPayments ?? []
  const expectedAmount = payload.counters.expectedAmount ?? expectedPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const overdueAmount = payload.counters.overdueAmount ?? expectedPayments.filter((payment) => payment.isOverdue).reduce((sum, payment) => sum + payment.amount, 0)
  const visibleExpectedPayments = expectedPayments.filter((payment) => {
    if (mode === "OVERDUE") return payment.isOverdue
    if (mode === "EXPECTED") return !payment.isOverdue
    return true
  })
  const visibleReports = payload.data.filter((report) => {
    if (mode === "PENDING") return report.status === "PENDING"
    if (mode === "DISPUTED") return report.status === "DISPUTED"
    return true
  })

  function openPaymentReview(report: AdminPaymentReportsPayload["data"][number], action: "confirm" | "dispute" | "reject") {
    setPendingReview({ report, action })
    setReviewReason(action === "confirm" ? "Поступление найдено" : action === "dispute" ? "Уточнить оплату" : "Не найдено поступление")
    setReviewMessage(null)
  }

  async function submitPaymentReview() {
    if (!pendingReview || reviewBusy) return
    setReviewBusy(true)
    setReviewMessage(null)
    try {
      if (pendingReview.action === "confirm") {
        await reviewAdminPaymentReport({
          reportId: pendingReview.report.id,
          action: "confirm",
          method: pendingReview.report.method,
        })
      } else {
        await reviewAdminPaymentReport({
          reportId: pendingReview.report.id,
          action: pendingReview.action,
          reason: reviewReason.trim() || paymentReviewDefaultReason(pendingReview.action),
        })
      }
      setPendingReview(null)
      onChanged()
    } catch (e) {
      setReviewMessage(e instanceof Error ? e.message : "Не удалось сохранить решение")
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title={buildingId ? "Оплаты объекта" : "Оплаты"} />
      <Card>
        <MetricGrid
          items={[
            { label: "Ожидают", value: String(payload.counters.pending), color: colors.blue },
            { label: "Уточнить", value: String(payload.counters.disputed), color: colors.orange },
            { label: "Сумма", value: formatMoney(payload.counters.amount), color: colors.green },
            { label: "Ожидается", value: formatMoney(expectedAmount), color: colors.teal },
            { label: "Просрочено", value: formatMoney(overdueAmount), color: overdueAmount > 0 ? colors.red : colors.green },
          ]}
        />
        <ChoiceRow
          options={[
            ["ALL", "Все"],
            ["OVERDUE", "Просрочено"],
            ["EXPECTED", "Ожидается"],
            ["PENDING", "На проверке"],
            ["DISPUTED", "Уточнить"],
          ]}
          value={mode}
          onChange={setMode}
        />
      </Card>
      <SectionTitle title="Календарь оплат" />
      {visibleExpectedPayments.slice(0, 8).map((payment) => (
        <ExpectedPaymentCard key={payment.id} payment={payment} />
      ))}
      {visibleExpectedPayments.length === 0 ? <EmptyState title="Ожидаемых оплат по фильтру нет" /> : null}
      <SectionTitle title="На проверке" />
      {visibleReports.map((report) => (
        <Card key={report.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconBox icon="creditcard.fill" color={paymentStatusColor(report.status)} />
            <View style={{ flex: 1 }}>
              <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{report.tenant.companyName}</Text>
              <Text selectable style={{ color: colors.muted, fontSize: 13 }}>Отправлено {formatDateTime(report.createdAt)}</Text>
            </View>
            <StatusPill label={paymentStatusLabel(report.status)} color={paymentStatusColor(report.status)} />
          </View>
          <MetricGrid
            items={[
              { label: "Ожидаемая оплата", value: formatMoney(report.amount), color: colors.green },
              { label: "Дата оплаты", value: formatDateFull(report.paymentDate), color: colors.blue },
            ]}
          />
          <CompactRow title="Метод" subtitle={report.paymentPurpose ?? "Назначение не указано"} value={report.method} tone={colors.slate} />
          {report.note ? <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{report.note}</Text> : null}
          {report.receiptUrl ? <SecondaryButton title="Открыть чек" icon="doc.richtext" onPress={() => Linking.openURL(report.receiptUrl!)} /> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <SecondaryButton title="Подтвердить" icon="checkmark.circle.fill" onPress={() => openPaymentReview(report, "confirm")} />
            <SecondaryButton title="Уточнить" icon="exclamationmark.triangle.fill" onPress={() => openPaymentReview(report, "dispute")} />
            <SecondaryButton title="Отклонить" icon="xmark.circle.fill" onPress={() => openPaymentReview(report, "reject")} />
          </View>
          {pendingReview?.report.id === report.id ? (
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 10, gap: 8 }}>
              <Text selectable style={{ color: colors.text, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{paymentReviewTitle(pendingReview.action)}</Text>
              {pendingReview.action === "confirm" ? (
                <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium }}>
                  Проверьте чек и банковское поступление. После подтверждения платеж закроет ожидание по арендатору.
                </Text>
              ) : (
                <Field label="Комментарий" value={reviewReason} onChangeText={setReviewReason} multiline placeholder="Коротко укажите причину" />
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <SecondaryButton title="Отмена" icon="xmark" onPress={() => setPendingReview(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title={reviewBusy ? "Сохраняем..." : "Сохранить"} disabled={reviewBusy} onPress={submitPaymentReview} />
                </View>
              </View>
              {reviewMessage ? <InlineMessage message={reviewMessage} tone="error" /> : null}
            </View>
          ) : null}
        </Card>
      ))}
      {visibleReports.length === 0 ? <EmptyState title="Оплат на проверке по фильтру нет" /> : null}
    </>
  )
}

function ExpectedPaymentCard({ payment }: { payment: AdminExpectedPayment }) {
  const dueDate = payment.dueDate ? new Date(payment.dueDate) : null
  const today = new Date()
  const isToday = dueDate ? dueDate.toDateString() === today.toDateString() : false
  const tone = payment.isOverdue ? colors.red : isToday ? colors.orange : colors.blue
  const status = payment.isOverdue ? "Просрочено" : isToday ? "Сегодня" : "Ожидается"

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <IconBox icon="calendar" color={tone} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{payment.tenant.companyName}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{payment.period} · {payment.type}</Text>
        </View>
        <StatusPill label={status} color={tone} />
      </View>
      <MetricGrid
        items={[
          { label: "Сумма", value: formatMoney(payment.amount), color: colors.green },
          { label: "Когда", value: payment.dueDate ? formatDateFull(payment.dueDate) : "без срока", color: tone },
        ]}
      />
      <CompactRow
        title={payment.description ?? "Начисление"}
        subtitle={payment.isOverdue ? "Требует контроля администратора" : "Ожидаем поступление или подтверждение"}
        value={payment.dueDate ? formatDate(payment.dueDate) : undefined}
        tone={tone}
      />
    </Card>
  )
}

export function AdminBuildings({ payload, onNavigate }: { payload: AdminBuildingsPayload; onNavigate: (tab: string) => void }) {
  return (
    <>
      <SectionTitle title="Объекты" />
      {payload.data.map((building) => (
        <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть объект ${building.name}`} key={building.id} onPress={() => onNavigate(`building:${building.id}`)}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconBox icon="building.2.fill" color={colors.blue} />
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{building.name}</Text>
                <Text selectable numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{building.address}</Text>
              </View>
              <AppIcon name="chevron.right" size={18} color={colors.muted} />
            </View>
            <MetricGrid
              items={[
                { label: "Арендаторы", value: String(building.counters.tenants), color: colors.blue },
                { label: "Заполнено", value: `${building.counters.occupancyPercent ?? 0}%`, color: colors.teal },
                { label: "Занято", value: formatArea(building.counters.occupiedArea ?? 0), color: colors.slate },
                { label: "Долг", value: formatMoney(building.counters.debtAmount), color: building.counters.debtAmount > 0 ? colors.red : colors.green },
                { label: "Заявки", value: String(building.counters.openRequests), color: colors.orange },
                { label: "Push", value: String(building.counters.activeNotices), color: colors.blue },
              ]}
            />
          </Card>
        </Pressable>
      ))}
    </>
  )
}

export function AdminBuildingDetail({
  building,
  onNavigate,
}: {
  building: AdminBuildingsPayload["data"][number]
  onNavigate: (tab: string) => void
}) {
  const floors = building.floors ?? []
  const tenants = building.recentTenants ?? []
  const notices = building.notices ?? []

  return (
    <>
      <SectionTitle title="Объект" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconBox icon="building.2.fill" color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 20, fontFamily: fonts.black, fontWeight: "900" }}>{building.name}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{building.address}</Text>
          </View>
        </View>
        <MetricGrid
          items={[
            { label: "Площадь", value: formatArea(building.counters.totalArea ?? 0), color: colors.slate },
            { label: "Занято", value: formatArea(building.counters.occupiedArea ?? 0), color: colors.teal },
            { label: "Свободно", value: formatArea(building.counters.vacantArea ?? 0), color: colors.blue },
            { label: "Заполнено", value: `${building.counters.occupancyPercent ?? 0}%`, color: colors.green },
            { label: "Арендаторы", value: String(building.counters.tenants), color: colors.blue },
            { label: "Долг", value: formatMoney(building.counters.debtAmount), color: building.counters.debtAmount > 0 ? colors.red : colors.green },
          ]}
        />
      </Card>
      <SectionTitle title="Быстрые действия" />
      <Card>
        <ActionRow icon="person.2.fill" title="Арендаторы" value={String(building.counters.tenants)} color={colors.teal} onPress={() => onNavigate(`tenants:${building.id}`)} />
        <ActionRow icon="doc.text.fill" title="Документы" value="открыть" color={colors.blue} onPress={() => onNavigate(`documents:building:${building.id}`)} />
        <ActionRow icon="tray.full.fill" title="Заявки" value={String(building.counters.openRequests)} color={colors.orange} onPress={() => onNavigate(`requests:${building.id}`)} />
        <ActionRow icon="creditcard.fill" title="Оплаты" value="открыть" color={colors.green} onPress={() => onNavigate(`payments:${building.id}`)} />
        <ActionRow icon="bell.fill" title="Push объявления" value={String(building.counters.activeNotices)} color={colors.blue} onPress={() => onNavigate("home")} />
      </Card>
      <SectionTitle title="Этажи" />
      <Card>
        {floors.map((floor) => (
          <CompactRow
            key={floor.id}
            title={floor.name}
            subtitle={`${formatArea(floor.occupiedArea)} занято · ${formatArea(floor.vacantArea)} свободно · ${floor.spaces} помещений`}
            value={`${floor.occupancyPercent}%`}
            tone={floor.occupancyPercent >= 90 ? colors.green : floor.occupancyPercent >= 60 ? colors.blue : colors.orange}
          />
        ))}
        {floors.length === 0 ? <Text selectable style={{ color: colors.muted, fontSize: 14 }}>Этажи и помещения пока не заведены</Text> : null}
      </Card>
      <SectionTitle title="Арендаторы объекта" />
      {tenants.map((tenant) => (
        <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть арендатора ${tenant.companyName}`} key={tenant.id} onPress={() => onNavigate(`tenant:${tenant.id}`)}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconBox icon="person.2.fill" color={colors.teal} />
              <View style={{ flex: 1 }}>
                <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{tenant.companyName}</Text>
                <Text selectable numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{tenant.placement}</Text>
              </View>
              <AppIcon name="chevron.right" size={18} color={colors.muted} />
            </View>
            <MetricGrid
              items={[
                { label: "Площадь", value: formatArea(tenant.area), color: colors.slate },
                { label: "Аренда", value: formatMoney(tenant.monthlyRent), color: colors.blue },
                { label: "Оплата до", value: `${tenant.paymentDueDay} числа`, color: colors.teal },
                { label: "Договор", value: tenant.contractEnd ? formatDate(tenant.contractEnd) : "без даты", color: colors.orange },
              ]}
            />
          </Card>
        </Pressable>
      ))}
      {tenants.length === 0 ? <EmptyState title="По объекту пока нет арендаторов" /> : null}
      <SectionTitle title="Активные push" />
      <NoticeList notices={notices} />
    </>
  )
}

export function OwnerOverview({ data, onNavigate }: { data: OwnerOverviewPayload; onNavigate: (tab: string) => void }) {
  return (
    <>
      <SectionTitle title="Объекты" />
      <Card>
        <MetricGrid
          items={[
            { label: "Объекты", value: String(data.counters.buildings), color: colors.blue },
            { label: "Арендаторы", value: String(data.counters.tenants), color: colors.teal },
            { label: "Поступления", value: formatMoney(data.counters.paymentsMonth), color: colors.green },
            { label: "Долг", value: formatMoney(data.counters.totalDebt), color: data.counters.totalDebt > 0 ? colors.red : colors.green },
            { label: "Заявки", value: String(data.counters.openRequests), color: colors.orange },
            { label: "Договоры", value: String(data.counters.expiringContracts), color: colors.blue },
          ]}
        />
      </Card>
      <SectionTitle title="Работа" />
      <QuickActionGrid
        actions={[
          {
            icon: "building.2.fill",
            title: "Объекты",
            subtitle: "карточки зданий",
            color: colors.blue,
            onPress: () => onNavigate("buildings"),
          },
          {
            icon: "person.2.fill",
            title: "Арендаторы",
            subtitle: `${data.counters.tenants} в базе`,
            color: colors.teal,
            onPress: () => onNavigate("tenants"),
          },
          {
            icon: "doc.on.doc.fill",
            title: "Документы",
            subtitle: `${data.counters.pendingSignatures} на подпись`,
            color: data.counters.pendingSignatures > 0 ? colors.orange : colors.blue,
            onPress: () => onNavigate("documents"),
          },
          {
            icon: "creditcard.fill",
            title: "Оплаты",
            subtitle: `${data.counters.pendingPayments} на проверке`,
            color: colors.green,
            onPress: () => onNavigate("payments"),
          },
        ]}
      />
      <SectionTitle title="Здания" />
      {data.buildings.map((building) => (
        <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть объект ${building.name}`} key={building.id} onPress={() => onNavigate(`building:${building.id}`)}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconBox icon="building.2.fill" color={colors.blue} />
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{building.name}</Text>
                <Text selectable numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{building.address}</Text>
              </View>
              <AppIcon name="chevron.right" size={18} color={colors.muted} />
            </View>
            <MetricGrid
              items={[
                { label: "Арендаторы", value: String(building.tenants), color: colors.blue },
                { label: "Долг", value: formatMoney(building.debtAmount), color: building.debtAmount > 0 ? colors.red : colors.green },
                { label: "Заявки", value: String(building.openRequests), color: colors.orange },
              ]}
            />
          </Card>
        </Pressable>
      ))}
    </>
  )
}

function NoticeComposer({ buildings, onChanged }: { buildings: MobileBootstrap["buildings"]; onChanged: () => void }) {
  const noticeTemplates = [
    { key: "LIGHT_OFF", label: "Свет", type: "ELECTRICITY", severity: "CRITICAL", title: "Отключение света", message: "Сегодня будет временное отключение электроэнергии. Просим заранее сохранить работу и отключить чувствительное оборудование." },
    { key: "HOT_WATER_OFF", label: "Горячая вода", type: "HOT_WATER", severity: "WARNING", title: "Отключение горячей воды", message: "По зданию ожидается временное отключение горячей воды. После завершения работ направим отдельное уведомление." },
    { key: "REPAIR", label: "Ремонт", type: "REPAIR", severity: "INFO", title: "Ремонтные работы", message: "В здании будут проводиться ремонтные работы. Возможны кратковременный шум и ограничение доступа к отдельным зонам." },
    { key: "CHECK", label: "Проверка", type: "INFO", severity: "INFO", title: "Плановая проверка", message: "Запланирована проверка инженерных систем здания. При необходимости администратор свяжется с арендаторами дополнительно." },
  ]
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "")
  const [templateKey, setTemplateKey] = useState("")
  const [type, setType] = useState("ELECTRICITY")
  const [severity, setSeverity] = useState("WARNING")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  function applyTemplate(key: string) {
    const template = noticeTemplates.find((item) => item.key === key)
    setTemplateKey(key)
    if (!template) return
    setType(template.type)
    setSeverity(template.severity)
    setTitle(template.title)
    setMessage(template.message)
  }

  async function submit() {
    setBusy(true)
    setResult(null)
    try {
      await createBuildingNotice({ buildingId, type, severity, title, message })
      setTemplateKey("")
      setTitle("")
      setMessage("")
      setResult("Push отправлен")
      onChanged()
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Не удалось отправить")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title="Push по зданию" />
      <Card>
        <ChoiceRow options={buildings.map((building) => [building.id, building.name])} value={buildingId} onChange={setBuildingId} />
        <ChoiceRow options={noticeTemplates.map((template) => [template.key, template.label])} value={templateKey} onChange={applyTemplate} />
        <ChoiceRow options={[["ELECTRICITY", "Свет"], ["HOT_WATER", "Гор. вода"], ["REPAIR", "Ремонт"], ["INFO", "Инфо"]]} value={type} onChange={setType} />
        <ChoiceRow options={[["INFO", "Обыч."], ["WARNING", "Важно"], ["CRITICAL", "Критично"]]} value={severity} onChange={setSeverity} />
        <Field label="Заголовок" value={title} onChangeText={setTitle} placeholder="Отключение света" />
        <Field label="Сообщение" value={message} onChangeText={setMessage} placeholder="Сегодня с 15:00 до 17:00..." multiline />
        {result ? <InlineMessage message={result} tone={result.includes("Не ") ? "error" : "success"} /> : null}
        <PrimaryButton title={busy ? "Отправляем..." : "Отправить push"} disabled={busy || title.trim().length < 3 || message.trim().length < 5} onPress={submit} />
      </Card>
    </>
  )
}
