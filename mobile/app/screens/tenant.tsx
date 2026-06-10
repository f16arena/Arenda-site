import { useEffect, useState } from "react"
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import * as Sharing from "expo-sharing"
import {
  createTenantRequest,
  deleteTenantUploadedDocument,
  downloadAuthorizedFile,
  getTenantMessages,
  getTenantPaymentQr,
  reportTenantPayment,
  respondToSignatureRequest,
  sendTenantMessage,
  submitTenantMeterReading,
  uploadTenantDocument,
  type PaymentQrPayload,
  type TenantAdminContact,
  type TenantMessageDto,
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
import { formatDate, formatDateFull, formatDateTime, formatFileSize, formatMoney, todayDate } from "@/app/utils/formatters"
import { haptic } from "@/app/utils/haptics"
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
  const [qrBusy, setQrBusy] = useState(false)
  const [qr, setQr] = useState<PaymentQrPayload | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)

  async function showQr() {
    if (qrBusy) return
    setQrBusy(true)
    setQrError(null)
    try {
      const numeric = Number(amount.replace(/\s/g, "").replace(",", "."))
      const data = await getTenantPaymentQr(Number.isFinite(numeric) && numeric > 0 ? numeric : undefined)
      setQr(data)
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Не удалось получить QR")
    } finally {
      setQrBusy(false)
    }
  }

  async function submit() {
    haptic.medium()
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
      haptic.success()
      onChanged()
    } catch (e) {
      haptic.error()
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
        <SecondaryButton title={qrBusy ? "Готовим QR..." : qr ? "Скрыть QR" : "Показать QR для перевода"} icon="qrcode" onPress={() => (qr ? setQr(null) : showQr())} />
        {qr ? (
          <View style={{ alignItems: "center", gap: 8 }}>
            <Image source={{ uri: qr.qrDataUrl }} style={{ width: 240, height: 240, borderRadius: 8, backgroundColor: "#fff" }} />
            <Text selectable style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>Покажите QR в приложении банка или Kaspi для автозаполнения реквизитов.</Text>
            {qr.amount ? <Text selectable style={{ color: colors.text, fontSize: 14, fontFamily: fonts.extraBold, fontWeight: "800" }}>Сумма в QR: {formatMoney(qr.amount)}</Text> : null}
          </View>
        ) : null}
        {qrError ? <InlineMessage message={qrError} tone="error" /> : null}
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
          <PaymentReportRow key={report.id} report={report} />
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

function PaymentReportRow({ report }: { report: TenantFinances["paymentReports"][number] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const tone = report.status === "REJECTED" ? colors.red : report.status === "CONFIRMED" ? colors.green : colors.blue
  const hasReceipt = !!(report.receiptUrl && report.receiptName)
  const subtitle = `${formatDate(report.paymentDate)} · ${report.method} · ${report.status}`

  async function openReceipt() {
    if (!report.receiptUrl || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const file = await downloadAuthorizedFile(report.receiptUrl, report.receiptName ?? `Чек ${formatDate(report.paymentDate)}`)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: report.receiptName ?? "Чек оплаты" })
      } else {
        await Linking.openURL(file.uri)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось открыть чек")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
        <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: tone }} />
        <View style={{ flex: 1 }}>
          <Text selectable style={{ color: colors.text, fontSize: 16, fontFamily: fonts.extraBold, fontWeight: "800" }}>{formatMoney(report.amount)}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 14, fontFamily: fonts.regular }}>{subtitle}</Text>
        </View>
        {hasReceipt ? (
          <Pressable
            focusable={false}
            accessibilityRole="button"
            accessibilityLabel={busy ? "Скачиваем чек" : "Открыть чек"}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={openReceipt}
            style={({ pressed }) => ({
              minHeight: 36,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              opacity: busy ? 0.6 : 1,
            })}
          >
            <AppIcon name={busy ? "arrow.down.circle" : "doc.richtext"} size={14} color={colors.blue} />
            <Text style={{ color: colors.blue, fontSize: 13, fontFamily: fonts.bold, fontWeight: "700" }}>{busy ? "..." : "чек"}</Text>
          </Pressable>
        ) : null}
      </View>
      {message ? <InlineMessage message={message} tone="error" /> : null}
    </View>
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
    haptic.medium()
    setBusy(true)
    setMessage(null)
    try {
      await createTenantRequest({ title, description, type, priority, attachment })
      setTitle("")
      setDescription("")
      setAttachment(null)
      setMessage("Заявка создана")
      haptic.success()
      onChanged()
    } catch (e) {
      haptic.error()
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
    haptic.medium()
    setBusy(true)
    setMessage(null)
    try {
      await submitTenantMeterReading({ meterId: meter.id, value: Number(value.replace(",", ".")), period })
      setValue("")
      setMessage("Показание принято")
      haptic.success()
      onChanged()
    } catch (e) {
      haptic.error()
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

export function TenantDocuments({ documents, onChanged }: { documents: TenantDocumentsPayload; onChanged?: () => void }) {
  const [documentFilter, setDocumentFilter] = useState("ALL")
  const pendingRequests = documents.signatureRequests.filter((item) => ["PENDING", "VIEWED"].includes(item.status))
  const pendingContracts = documents.contractLinks.filter((item) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(item.status))
  const pending = pendingRequests.length + pendingContracts.length
  const visibleGenerated = documents.generated.filter((document) => documentFilter === "ALL" || documentTypeCategory(document.documentType) === documentFilter)
  const invoices = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "INVOICE").length
  const acts = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "ACT").length
  const reconciliations = documents.generated.filter((document) => documentTypeCategory(document.documentType) === "RECONCILIATION").length

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState("OTHER")
  const [uploadName, setUploadName] = useState("")
  const [uploadFile, setUploadFile] = useState<PickedUploadFile | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function submitUpload() {
    if (uploadBusy) return
    if (!uploadName.trim()) {
      setUploadMessage({ text: "Укажите название документа", tone: "error" })
      return
    }
    if (!uploadFile) {
      setUploadMessage({ text: "Прикрепите файл", tone: "error" })
      return
    }
    setUploadBusy(true)
    setUploadMessage(null)
    try {
      await uploadTenantDocument({ type: uploadType, name: uploadName.trim(), file: uploadFile })
      setUploadFile(null)
      setUploadName("")
      setUploadOpen(false)
      setUploadMessage({ text: "Документ загружен", tone: "success" })
      onChanged?.()
    } catch (e) {
      setUploadMessage({ text: e instanceof Error ? e.message : "Не удалось загрузить", tone: "error" })
    } finally {
      setUploadBusy(false)
    }
  }

  async function removeDocument(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteTenantUploadedDocument(id)
      onChanged?.()
    } catch (e) {
      setUploadMessage({ text: e instanceof Error ? e.message : "Не удалось удалить", tone: "error" })
    } finally {
      setDeletingId(null)
    }
  }

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
        <SecondaryButton title={uploadOpen ? "Скрыть форму" : "Загрузить документ"} icon="paperclip" onPress={() => setUploadOpen((open) => !open)} />
        {uploadOpen ? (
          <View style={{ gap: 8 }}>
            <ChoiceRow
              options={[
                ["ID_CARD", "Удостоверение"],
                ["CHARTER", "Устав"],
                ["IP_CERTIFICATE", "ИП"],
                ["OTHER", "Прочее"],
              ]}
              value={uploadType}
              onChange={setUploadType}
            />
            <Field label="Название" value={uploadName} onChangeText={setUploadName} placeholder="Например: Удостоверение директора" />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <SecondaryButton title={uploadFile ? uploadFile.name : "Выбрать файл"} icon="paperclip" onPress={async () => setUploadFile(await pickUploadFile("document"))} />
              {uploadFile ? <SecondaryButton title="Убрать" icon="xmark" onPress={() => setUploadFile(null)} /> : null}
            </View>
            <PrimaryButton title={uploadBusy ? "Загружаем..." : "Загрузить"} onPress={submitUpload} disabled={uploadBusy} />
          </View>
        ) : null}
        {uploadMessage ? <InlineMessage message={uploadMessage.text} tone={uploadMessage.tone} /> : null}
        {documents.tenantDocuments.map((document) => (
          <View key={document.id} style={{ gap: 4 }}>
            <DocumentRow
              title={document.name}
              subtitle={`${documentTypeLabel(document.type)} · ${formatDate(document.createdAt)}`}
              url={document.downloadUrl ?? document.fileUrl}
            />
            <SecondaryButton
              title={deletingId === document.id ? "Удаляем..." : "Удалить"}
              icon="trash"
              onPress={() => removeDocument(document.id)}
            />
          </View>
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
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectBusy, setRejectBusy] = useState(false)

  async function reject() {
    if (rejectBusy) return
    if (rejectReason.trim().length < 5) {
      setMessage("Опишите причину отказа (минимум 5 символов)")
      return
    }
    setRejectBusy(true)
    setMessage(null)
    try {
      await respondToSignatureRequest(request.id, { action: "REJECT", reason: rejectReason.trim() })
      setMessage("Документ отклонён")
      setRejectOpen(false)
      setRejectReason("")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось отклонить")
    } finally {
      setRejectBusy(false)
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
      {/* Черновики SMS/ЭЦП скрыты до готовности интеграции (аудит 2026-06-10, п.18):
          подпись ЭЦП работает в веб-кабинете — туда и ведём. */}
      <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
        Подписание ЭЦП доступно в веб-кабинете (раздел «Документы»). Подпись прямо в приложении появится позже.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <SecondaryButton title={rejectOpen ? "Отмена" : "Отказаться"} icon="xmark.circle.fill" onPress={() => setRejectOpen((open) => !open)} />
      </View>
      {rejectOpen ? (
        <View style={{ gap: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10, backgroundColor: "#fff" }}>
          <Field label="Причина отказа" value={rejectReason} onChangeText={setRejectReason} placeholder="Например: ошибка в реквизитах" multiline />
          <PrimaryButton title={rejectBusy ? "Отправляем..." : "Подтвердить отказ"} onPress={reject} disabled={rejectBusy} />
        </View>
      ) : null}
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

// Чат-экран арендатора <-> администратор. Использует /api/mobile/tenant/messages.
// Минимально-рабочая версия: список + поле ввода + выбор адресата.
export function TenantMessages() {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<TenantMessageDto[]>([])
  const [admins, setAdmins] = useState<TenantAdminContact[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await getTenantMessages()
      setMessages(res.data)
      setAdmins(res.admins)
      setSelectedAdminId((current) => {
        if (current && res.admins.some((a) => a.id === current)) return current
        if (res.admins.length === 1) return res.admins[0].id
        // Если есть переписка — выбираем "другую сторону" последнего сообщения.
        const last = res.data[0]
        if (last) {
          const otherId = last.direction === "in" ? last.from.id : last.to.id
          if (res.admins.some((a) => a.id === otherId)) return otherId
        }
        return current ?? res.admins[0]?.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить сообщения")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const res = await getTenantMessages()
        if (!mounted) return
        setMessages(res.data)
        setAdmins(res.admins)
        if (res.admins.length === 1) setSelectedAdminId(res.admins[0].id)
        else if (res.data[0]) {
          const otherId = res.data[0].direction === "in" ? res.data[0].from.id : res.data[0].to.id
          if (res.admins.some((a) => a.id === otherId)) setSelectedAdminId(otherId)
          else if (res.admins[0]) setSelectedAdminId(res.admins[0].id)
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Не удалось загрузить сообщения")
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function send() {
    const body = text.trim()
    if (!body || !selectedAdminId || sending) return
    setSending(true)
    setError(null)
    setInfo(null)
    try {
      await sendTenantMessage({ toUserId: selectedAdminId, body })
      setText("")
      haptic.success()
      setInfo("Сообщение отправлено")
      await load(true)
    } catch (e) {
      haptic.error()
      setError(e instanceof Error ? e.message : "Не удалось отправить сообщение")
    } finally {
      setSending(false)
    }
  }

  // Сообщения от API приходят DESC по createdAt — переворачиваем для отображения снизу вверх.
  const ordered = [...messages].reverse()

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <SectionTitle title="Сообщения" />
      {admins.length === 0 && !loading ? (
        <EmptyState
          icon="message.fill"
          title="Администратор не назначен"
          subtitle="Когда здание получит ответственного администратора, вы сможете написать ему отсюда."
        />
      ) : (
        <Card>
          {admins.length > 1 ? (
            <ChoiceRow
              options={admins.map((a) => [a.id, a.name] as [string, string])}
              value={selectedAdminId ?? admins[0].id}
              onChange={setSelectedAdminId}
            />
          ) : null}

          {loading ? (
            <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>Загружаем сообщения...</Text>
          ) : ordered.length === 0 ? (
            <EmptyState
              inline
              icon="message.fill"
              title="Сообщений пока нет"
              subtitle="Напишите первым — администратор получит уведомление."
            />
          ) : (
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {ordered.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={selectedAdminId ? "Сообщение администратору" : "Выберите администратора"}
              placeholderTextColor="#94a3b8"
              multiline
              editable={!!selectedAdminId && !sending}
              style={{
                flex: 1,
                minHeight: 46,
                maxHeight: 140,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: "#ffffff",
                color: colors.text,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 16,
                fontFamily: fonts.regular,
                textAlignVertical: "top",
              }}
            />
            <Pressable
              focusable={false}
              accessibilityRole="button"
              accessibilityLabel="Отправить сообщение"
              accessibilityState={{ disabled: !text.trim() || !selectedAdminId || sending }}
              disabled={!text.trim() || !selectedAdminId || sending}
              onPress={send}
              style={({ pressed }) => ({
                minHeight: 46,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: !text.trim() || !selectedAdminId ? colors.faint : colors.blue,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed || sending ? 0.75 : 1,
              })}
            >
              <AppIcon name="send.fill" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {error ? <InlineMessage message={error} tone="error" /> : null}
          {info ? <InlineMessage message={info} tone="success" /> : null}
        </Card>
      )}
    </KeyboardAvoidingView>
  )
}

function MessageBubble({ message }: { message: TenantMessageDto }) {
  const isOut = message.direction === "out"
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  async function openAttachment() {
    if (!message.attachmentUrl || attachmentBusy) return
    setAttachmentBusy(true)
    setAttachmentError(null)
    try {
      const title = message.subject || `Вложение от ${message.from.name}`
      const file = await downloadAuthorizedFile(message.attachmentUrl, title)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: title })
      } else {
        await Linking.openURL(file.uri)
      }
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : "Не удалось открыть вложение")
    } finally {
      setAttachmentBusy(false)
    }
  }

  return (
    <View style={{ alignItems: isOut ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "86%",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: isOut ? colors.blue : colors.surfaceMuted,
          borderWidth: 1,
          borderColor: isOut ? colors.blue : colors.border,
          gap: 4,
        }}
      >
        <Text
          selectable
          style={{
            color: isOut ? "#ffffff" : colors.text,
            fontSize: 11,
            fontFamily: fonts.bold,
            fontWeight: "700",
            opacity: 0.85,
          }}
        >
          {isOut ? "Вы" : message.from.name}
        </Text>
        {message.subject ? (
          <Text
            selectable
            style={{
              color: isOut ? "#ffffff" : colors.text,
              fontSize: 13,
              fontFamily: fonts.extraBold,
              fontWeight: "800",
            }}
          >
            {message.subject}
          </Text>
        ) : null}
        <Text
          selectable
          style={{
            color: isOut ? "#ffffff" : colors.text,
            fontSize: 15,
            fontFamily: fonts.regular,
            lineHeight: 20,
          }}
        >
          {message.body}
        </Text>
        {message.attachmentUrl ? (
          <Pressable
            onPress={openAttachment}
            disabled={attachmentBusy}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              paddingVertical: 4,
              paddingHorizontal: 8,
              marginTop: 2,
              borderRadius: 8,
              backgroundColor: isOut ? "rgba(255,255,255,0.15)" : colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 14 }}>📎</Text>
            <Text
              style={{
                color: isOut ? "#ffffff" : colors.blue,
                fontSize: 13,
                fontFamily: fonts.medium,
                fontWeight: "600",
              }}
            >
              {attachmentBusy ? "Скачиваем..." : "Открыть вложение"}
            </Text>
          </Pressable>
        ) : null}
        {attachmentError ? (
          <Text
            style={{
              color: isOut ? "#fecaca" : colors.red,
              fontSize: 11,
              fontFamily: fonts.medium,
            }}
          >
            {attachmentError}
          </Text>
        ) : null}
        <Text
          style={{
            color: isOut ? "#ffffff" : colors.muted,
            fontSize: 11,
            fontFamily: fonts.medium,
            opacity: isOut ? 0.85 : 1,
            alignSelf: "flex-end",
          }}
        >
          {formatDateTime(message.createdAt)}
        </Text>
      </View>
    </View>
  )
}
