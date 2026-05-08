import { useState } from "react"
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from "react-native"
import * as Sharing from "expo-sharing"
import {
  createTenantRequest,
  downloadAuthorizedFile,
  reportTenantPayment,
  startDocumentSignatureDraft,
  submitTenantMeterReading,
} from "@/lib/api"
import {
  colors,
  contractStatusColor,
  contractStatusLabel,
  contractTypeLabel,
  documentTypeCategory,
  documentTypeLabel,
  fonts,
  isPendingContractStatus,
  openExternalUrl,
  signatureStatusLabel,
} from "@/app/utils/colors"
import { formatDate, formatDateFull, formatFileSize, formatMoney, todayDate } from "@/app/utils/formatters"
import { pickUploadFile } from "@/app/utils/types"
import {
  AppIcon,
  Card,
  ChoiceRow,
  CompactRow,
  EmptyState,
  Field,
  IconBox,
  InlineMessage,
  MetricGrid,
  NoticeList,
  PrimaryButton,
  QuickActionGrid,
  RequestList,
  SecondaryButton,
  SectionTitle,
  StatusPill,
} from "@/app/components/ui"
import type {
  BuildingNotice,
  MobileContractSummary,
  PickedUploadFile,
  TenantDocumentsPayload,
  TenantFinances,
  TenantMetersPayload,
  TenantOverview,
  TenantRequestsPayload,
  TenantSignatureRequest,
} from "@/types/mobile"

export function TenantHome({ overview, notices, onNavigate }: { overview: TenantOverview; notices: BuildingNotice[]; onNavigate: (tab: string) => void }) {
  return (
    <>
      <SectionTitle title="Главная" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconBox icon="key.fill" color={colors.teal} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{overview.tenant.companyName}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{overview.tenant.placement}</Text>
          </View>
        </View>
        <MetricGrid
          variant="row"
          items={[
            {
              label: "Долг",
              value: formatMoney(overview.finances.totalDebt),
              color: overview.finances.totalDebt > 0 ? colors.red : colors.green,
              onPress: () => onNavigate("payments"),
            },
            {
              label: "Аренда",
              value: formatMoney(overview.tenant.monthlyRent),
              color: colors.slate,
            },
            {
              label: "Заявки",
              value: String(overview.counters.activeRequests),
              color: colors.blue,
              onPress: () => onNavigate("requests"),
              badge: overview.counters.activeRequests,
            },
            {
              label: "Документы на подпись",
              value: String(overview.counters.pendingDocuments),
              color: overview.counters.pendingDocuments > 0 ? colors.orange : colors.green,
              onPress: () => onNavigate("documents"),
              badge: overview.counters.pendingDocuments,
            },
          ]}
        />
      </Card>
      <SectionTitle title="Объявления" />
      <NoticeList notices={notices.slice(0, 6)} />
      <SectionTitle title="Ближайшие действия" />
      <QuickActionGrid
        actions={[
          {
            icon: "creditcard.fill",
            title: overview.finances.totalDebt > 0 ? "Оплатить" : "Оплаты",
            subtitle: formatMoney(overview.finances.totalDebt),
            color: overview.finances.totalDebt > 0 ? colors.red : colors.green,
            onPress: () => onNavigate("payments"),
          },
          {
            icon: "signature",
            title: "Подпись",
            subtitle: `${overview.counters.pendingDocuments} документов`,
            color: overview.counters.pendingDocuments > 0 ? colors.orange : colors.blue,
            onPress: () => onNavigate("documents"),
          },
          {
            icon: "tray.full.fill",
            title: "Заявка",
            subtitle: `${overview.counters.activeRequests} активных`,
            color: colors.teal,
            onPress: () => onNavigate("requests"),
          },
          {
            icon: "gauge.with.dots.needle.50percent",
            title: "Счетчики",
            subtitle: `${overview.counters.meters} приборов`,
            color: colors.blue,
            onPress: () => onNavigate("meters"),
          },
        ]}
      />
    </>
  )
}

export function TenantPayments({ finances, onChanged }: { finances: TenantFinances; onChanged: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(finances.summary.payableAmount || finances.tenant.monthlyRent || 0)))
  const [method, setMethod] = useState("KASPI")
  const [note, setNote] = useState("")
  const [receipt, setReceipt] = useState<PickedUploadFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setMessage(null)
    try {
      await reportTenantPayment({
        amount: Number(amount.replace(/\s/g, "").replace(",", ".")),
        paymentDate: todayDate(),
        method,
        paymentPurpose: finances.summary.paymentPurpose,
        note,
        receipt,
      })
      setReceipt(null)
      setNote("")
      setMessage("Оплата отправлена на проверку")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось отправить оплату")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title="Оплата" />
      <Card>
        <MetricGrid
          items={[
            { label: "Долг", value: formatMoney(finances.summary.totalDebt), color: finances.summary.totalDebt > 0 ? colors.red : colors.green },
            { label: "К оплате", value: formatMoney(finances.summary.payableAmount), color: colors.slate },
          ]}
        />
        <View style={{ gap: 5 }}>
          <Text selectable style={{ color: colors.text, fontWeight: "800" }}>{finances.requisites.recipient}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{finances.requisites.taxIdLabel}: {finances.requisites.taxId}</Text>
        </View>
        {finances.requisites.accounts.map((account) => (
          <View key={account.account} style={{ borderRadius: 8, backgroundColor: "#f8fafc", padding: 12, gap: 3 }}>
            <Text selectable style={{ color: colors.text, fontWeight: "800" }}>{account.bank}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 12 }}>ИИК: {account.account}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 12 }}>БИК: {account.bik}</Text>
          </View>
        ))}
        <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Назначение: {finances.summary.paymentPurpose}</Text>
      </Card>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <Card>
          <Field label="Сумма" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <ChoiceRow options={[["KASPI", "Kaspi"], ["TRANSFER", "Банк"], ["CASH", "Нал."], ["CARD", "Карта"]]} value={method} onChange={setMethod} />
          <Field label="Комментарий" value={note} onChangeText={setNote} placeholder="Номер чека или коротко" multiline />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <SecondaryButton title={receipt ? receipt.name : "Прикрепить чек"} icon="paperclip" onPress={async () => setReceipt(await pickUploadFile("receipt"))} />
            {receipt ? <SecondaryButton title="Убрать" icon="xmark" onPress={() => setReceipt(null)} /> : null}
          </View>
          {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
          <PrimaryButton title={busy ? "Отправляем..." : "Я оплатил"} disabled={busy || !amount.trim()} onPress={submit} />
        </Card>
      </KeyboardAvoidingView>
      <SectionTitle title="История" />
      <Card>
        {finances.paymentReports.slice(0, 8).map((report) => (
          <CompactRow key={report.id} title={formatMoney(report.amount)} subtitle={`${formatDate(report.paymentDate)} · ${report.method} · ${report.status}${report.receiptName ? " · чек" : ""}`} tone={report.status === "REJECTED" ? colors.red : report.status === "CONFIRMED" ? colors.green : colors.blue} />
        ))}
        {finances.paymentReports.length === 0 ? <EmptyState inline icon="creditcard.fill" title="Отправленных оплат пока нет" subtitle="Когда арендатор отправит чек, он появится в истории." /> : null}
      </Card>
      <SectionTitle title="Начисления" />
      <Card>
        {finances.charges.slice(0, 12).map((charge) => (
          <CompactRow key={charge.id} title={`${charge.period} · ${charge.type}`} subtitle={charge.description ?? (charge.isPaid ? "Оплачено" : "Долг")} value={formatMoney(charge.amount)} tone={charge.isPaid ? colors.green : colors.red} />
        ))}
      </Card>
    </>
  )
}

export function TenantRequests({ requests, onChanged }: { requests: TenantRequestsPayload; onChanged: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState("TECHNICAL")
  const [priority, setPriority] = useState("MEDIUM")
  const [attachment, setAttachment] = useState<PickedUploadFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setMessage(null)
    try {
      await createTenantRequest({ title, description, type, priority, attachment })
      setTitle("")
      setDescription("")
      setAttachment(null)
      setMessage("Заявка создана")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось создать заявку")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title="Новая заявка" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <Card>
          <ChoiceRow options={[["TECHNICAL", "Техника"], ["INTERNET", "Интернет"], ["CLEANING", "Уборка"], ["QUESTION", "Вопрос"]]} value={type} onChange={setType} />
          <ChoiceRow options={[["MEDIUM", "Обычная"], ["HIGH", "Срочно"], ["URGENT", "Критично"]]} value={priority} onChange={setPriority} />
          <Field label="Тема" value={title} onChangeText={setTitle} placeholder="Например: не работает свет" />
          <Field label="Описание" value={description} onChangeText={setDescription} placeholder="Где и что произошло" multiline />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <SecondaryButton title={attachment ? attachment.name : "Фото/файл"} icon="camera.fill" onPress={async () => setAttachment(await pickUploadFile("request"))} />
            {attachment ? <SecondaryButton title="Убрать" icon="xmark" onPress={() => setAttachment(null)} /> : null}
          </View>
          {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
          <PrimaryButton title={busy ? "Создаем..." : "Создать заявку"} disabled={busy || title.trim().length < 3 || description.trim().length < 5} onPress={submit} />
        </Card>
      </KeyboardAvoidingView>
      <SectionTitle title="Мои заявки" />
      <RequestList requests={requests.data} />
    </>
  )
}

export function TenantMeters({ meters, onChanged }: { meters: TenantMetersPayload; onChanged: () => void }) {
  return (
    <>
      <SectionTitle title={`Счетчики · ${meters.period}`} />
      {meters.data.length === 0 ? <EmptyState title="Счетчики не установлены" /> : meters.data.map((meter) => (
        <MeterCard key={meter.id} meter={meter} period={meters.period} onChanged={onChanged} />
      ))}
    </>
  )
}

function MeterCard({ meter, period, onChanged }: { meter: TenantMetersPayload["data"][number]; period: string; onChanged: () => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setMessage(null)
    try {
      await submitTenantMeterReading({ meterId: meter.id, value: Number(value.replace(",", ".")), period })
      setValue("")
      setMessage("Показание принято")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось передать показание")
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconBox icon="gauge.with.dots.needle.50percent" color={meter.type === "WATER" ? colors.blue : colors.orange} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{meter.type} #{meter.number}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Каб. {meter.space.number} · предыдущее {meter.previousValue.toLocaleString("ru-RU")}</Text>
          </View>
          {meter.hasCurrent ? <StatusPill label="Внесено" color={colors.green} /> : null}
        </View>
        {meter.hasCurrent ? (
          <Text selectable style={{ color: colors.muted, fontSize: 13 }}>Текущее: {meter.currentValue?.toLocaleString("ru-RU")} · расход: {meter.consumption?.toLocaleString("ru-RU")}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="Текущее" placeholderTextColor="#94a3b8" style={{ flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.text }} />
            <Pressable focusable={false} accessibilityRole="button" accessibilityLabel="Отправить показание" accessibilityState={{ disabled: busy || !value.trim() }} disabled={busy || !value.trim()} onPress={submit} style={{ minHeight: 44, borderRadius: 8, paddingHorizontal: 16, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
              <Text style={{ color: "#ffffff", fontWeight: "900" }}>ОК</Text>
            </Pressable>
          </View>
        )}
        {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
      </Card>
    </KeyboardAvoidingView>
  )
}

export function TenantDocuments({ documents }: { documents: TenantDocumentsPayload }) {
  const [documentFilter, setDocumentFilter] = useState("ALL")
  const pendingRequests = documents.signatureRequests.filter((item) => ["PENDING", "VIEWED"].includes(item.status))
  const pendingContracts = documents.contractLinks.filter((item) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(item.status))
  const pending = pendingRequests.length + pendingContracts.length
  const visibleGenerated = documents.generated.filter((document) => documentFilter === "ALL" || documentTypeCategory(document.documentType) === documentFilter)
  const invoices = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "INVOICE").length
  const acts = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "ACT").length
  const reconciliations = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "RECONCILIATION").length

  return (
    <>
      <SectionTitle title="Документы" />
      <Card>
        <MetricGrid
          items={[
            { label: "На подпись", value: String(pending), color: pending > 0 ? colors.orange : colors.green },
            { label: "Договоры", value: String(documents.contractLinks.length), color: colors.blue },
            { label: "Счета", value: String(invoices), color: colors.teal },
            { label: "АВР", value: String(acts), color: colors.orange },
            { label: "Сверки", value: String(reconciliations), color: colors.slate },
            { label: "Файлы", value: String(documents.tenantDocuments.length), color: colors.blue },
          ]}
        />
      </Card>
      <SectionTitle title="На подпись" />
      {pending > 0 ? (
        <Card>
          {pendingRequests.map((request) => <SignatureRequestCard key={request.id} request={request} />)}
          {pendingContracts.map((contract) => <ContractSignPrompt key={contract.id} contract={contract} />)}
        </Card>
      ) : (
        <EmptyState icon="signature" title="Документов на подпись нет" subtitle="Когда появится договор, АВР или другой документ, кнопка подписи будет здесь." />
      )}
      <SectionTitle title="Договоры" />
      <Card>
        {documents.contractLinks.map((contract) => <ContractSignPrompt key={contract.id} contract={contract} />)}
        {documents.contractLinks.length === 0 ? <EmptyState inline icon="doc.on.doc.fill" title="Договоров пока нет" subtitle="После отправки договора он появится в этом разделе." /> : null}
      </Card>
      <SectionTitle title="Счета, АВР и сверки" />
      <Card>
        <ChoiceRow
          options={[
            ["ALL", "Все"],
            ["INVOICE", "Счета"],
            ["ACT", "АВР"],
            ["RECONCILIATION", "Сверки"],
          ]}
          value={documentFilter}
          onChange={setDocumentFilter}
        />
        {visibleGenerated.map((document) => (
          <DocumentRow
            key={document.id}
            title={document.fileName}
            subtitle={`${documentTypeLabel(document.documentType)} · ${document.period ?? "без периода"} · ${formatFileSize(document.fileSize)}`}
            url={document.downloadUrl}
          />
        ))}
        {visibleGenerated.length === 0 ? <EmptyState inline icon="doc.text.fill" title="Документов по фильтру нет" subtitle="Счет, АВР или акт сверки появится здесь после генерации на сайте." /> : null}
      </Card>
      <SectionTitle title="Файлы арендатора" />
      <Card>
        {documents.tenantDocuments.map((document) => (
          <DocumentRow
            key={document.id}
            title={document.name}
            subtitle={`${documentTypeLabel(document.type)} · ${formatDate(document.createdAt)}`}
            url={document.downloadUrl ?? document.fileUrl}
          />
        ))}
        {documents.tenantDocuments.length === 0 ? <EmptyState inline icon="paperclip" title="Файлов пока нет" subtitle="Сюда попадут загруженные договоры, приложения и вложения арендатора." /> : null}
      </Card>
    </>
  )
}

export function DocumentRow({ title, subtitle, url }: { title: string; subtitle: string; url?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function openDocument() {
    if (!url || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const file = await downloadAuthorizedFile(url, title)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mimeType,
          dialogTitle: title,
        })
      } else {
        await Linking.openURL(file.uri)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось открыть документ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        focusable={false}
        accessibilityRole="button"
        accessibilityLabel={url ? `Открыть документ ${title}` : `Документ ${title} недоступен`}
        accessibilityState={{ disabled: !url || busy }}
        disabled={!url || busy}
        onPress={openDocument}
        style={({ pressed }) => ({
          minHeight: 54,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: pressed ? 8 : 0,
          paddingVertical: 6,
          backgroundColor: pressed ? colors.surfaceMuted : "transparent",
          opacity: url ? 1 : 0.55,
        })}
      >
        <AppIcon name="doc.text.fill" size={20} color={colors.blue} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontFamily: fonts.extraBold, fontWeight: "800" }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{busy ? "Скачиваем..." : subtitle}</Text>
        </View>
        <AppIcon name={busy ? "arrow.down.circle" : "square.and.arrow.up"} size={18} color={colors.muted} />
      </Pressable>
      {message ? <InlineMessage message={message} tone="error" /> : null}
    </View>
  )
}

export function OpenAuthorizedFileButton({ title, url }: { title: string; url?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function openDocument() {
    if (!url || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const file = await downloadAuthorizedFile(url, title)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mimeType,
          dialogTitle: title,
        })
      } else {
        await Linking.openURL(file.uri)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось открыть документ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <SecondaryButton title={busy ? "Скачиваем..." : "Открыть / поделиться"} icon="square.and.arrow.up" onPress={openDocument} />
      {message ? <InlineMessage message={message} tone="error" /> : null}
    </View>
  )
}

export function SignatureRequestCard({ request }: { request: TenantSignatureRequest }) {
  const [message, setMessage] = useState<string | null>(null)

  async function startDraft(method: "SMS_OTP_DRAFT" | "NCA_LAYER_DRAFT") {
    setMessage(null)
    try {
      const result = await startDocumentSignatureDraft({ requestId: request.id, method })
      setMessage(result.message ?? "Черновик подписания подготовлен")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось подготовить подписание")
    }
  }

  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fffaf0", padding: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppIcon name="doc.badge.arrow.up.fill" size={19} color={colors.orange} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={2} style={{ color: colors.text, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{request.title}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{documentTypeLabel(request.documentType)} · {request.expiresAt ? `до ${formatDateFull(request.expiresAt)}` : "без срока"}</Text>
        </View>
        <StatusPill label={signatureStatusLabel(request.status)} color={colors.orange} />
      </View>
      {request.message ? <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{request.message}</Text> : null}
      <Text selectable style={{ color: colors.orange, fontSize: 13, lineHeight: 18, fontFamily: fonts.bold, fontWeight: "700" }}>
        SMS и ЭЦП сейчас работают как черновик: приложение подготовит заявку на подпись, финальная интеграция подключается позже.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <SecondaryButton title="SMS черновик" icon="message.fill" onPress={() => startDraft("SMS_OTP_DRAFT")} />
        <SecondaryButton title="ЭЦП черновик" icon="checkmark.seal.fill" onPress={() => startDraft("NCA_LAYER_DRAFT")} />
      </View>
      {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
    </View>
  )
}

export function ContractSignPrompt({ contract }: { contract: MobileContractSummary | TenantDocumentsPayload["contractLinks"][number] }) {
  const webUrl = "webUrl" in contract ? contract.webUrl : null
  const status = contract.status
  const color = contractStatusColor(status)
  const title = "number" in contract ? `${contractTypeLabel(contract.type)} № ${contract.number}` : contract.title

  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppIcon name="doc.on.doc.fill" size={19} color={color} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={2} style={{ color: colors.text, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{contractStatusLabel(status)}</Text>
        </View>
        <StatusPill label={contractStatusLabel(status)} color={color} />
      </View>
      {webUrl ? <SecondaryButton title={isPendingContractStatus(status) ? "Открыть подписание" : "Открыть документ"} icon="arrow.up.right.square" onPress={() => openExternalUrl(webUrl)} /> : null}
    </View>
  )
}
