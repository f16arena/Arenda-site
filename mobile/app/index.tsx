import { Image } from "expo-image"
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import * as Notifications from "expo-notifications"
import * as Sharing from "expo-sharing"
import type { ComponentProps } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import {
  ApiError,
  createBuildingNotice,
  createTenantRequest,
  downloadAuthorizedFile,
  getAdminBuildings,
  getAdminPaymentReports,
  getAdminRequests,
  getAdminToday,
  getBuildingNotices,
  getDeviceAuthAvailability,
  getMobileBootstrap,
  getMobileNotificationSettings,
  getMobileNotifications,
  getMobileSessions,
  getOwnerOverview,
  getTenantDocuments,
  getTenantFinances,
  getTenantMeters,
  getTenantOverview,
  getTenantRequests,
  hasStoredSession,
  loginMobile,
  logoutMobile,
  markMobileNotificationsRead,
  registerPushDevice,
  reportTenantPayment,
  reviewAdminPaymentReport,
  revokeMobileSession,
  startDocumentSignatureDraft,
  submitTenantMeterReading,
  unregisterPushDevice,
  updateMobileNotificationSettings,
  updateAdminRequest,
  unlockStoredSessionWithDeviceAuth,
} from "@/lib/api"
import { clearMobileCache, readCache, writeCache } from "@/lib/cache"
import { getLocalPushPreferences, isQuietHoursNow, saveLocalPushPreferences, type LocalPushPreferences } from "@/lib/preferences"
import { setMobileSentryUser } from "@/lib/sentry"
import type {
  AdminBuildingsPayload,
  AdminPaymentReportsPayload,
  AdminRequestsPayload,
  AdminTodayPayload,
  BuildingNotice,
  MobileBootstrap,
  MobileNotification,
  MobileNotificationSettingsPayload,
  MobileNotificationsPayload,
  MobileSessionInfo,
  OwnerOverviewPayload,
  PickedUploadFile,
  TenantDocumentsPayload,
  TenantFinances,
  TenantMetersPayload,
  TenantOverview,
  TenantRequestsPayload,
} from "@/types/mobile"

const colors = {
  background: "#f6f8fb",
  surface: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  blue: "#2563eb",
  teal: "#0f766e",
  orange: "#ea580c",
  red: "#dc2626",
  green: "#059669",
  slate: "#0f172a",
}

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const preferences = await getLocalPushPreferences()
    const quiet = isQuietHoursNow(preferences)
    return {
      shouldShowBanner: !quiet,
      shouldShowList: true,
      shouldPlaySound: !quiet,
      shouldSetBadge: true,
    }
  },
})

type AppData = {
  notices: BuildingNotice[]
  tenantOverview: TenantOverview | null
  tenantFinances: TenantFinances | null
  tenantRequests: TenantRequestsPayload | null
  tenantMeters: TenantMetersPayload | null
  tenantDocuments: TenantDocumentsPayload | null
  adminToday: AdminTodayPayload | null
  adminRequests: AdminRequestsPayload | null
  adminPayments: AdminPaymentReportsPayload | null
  adminBuildings: AdminBuildingsPayload | null
  ownerOverview: OwnerOverviewPayload | null
  notifications: MobileNotificationsPayload | null
  notificationSettings: MobileNotificationSettingsPayload | null
}

const emptyData: AppData = {
  notices: [],
  tenantOverview: null,
  tenantFinances: null,
  tenantRequests: null,
  tenantMeters: null,
  tenantDocuments: null,
  adminToday: null,
  adminRequests: null,
  adminPayments: null,
  adminBuildings: null,
  ownerOverview: null,
  notifications: null,
  notificationSettings: null,
}

type CachedDashboard = {
  bootstrap: MobileBootstrap
  data: AppData
}

type CacheState = {
  fromCache: boolean
  savedAt?: string
  error?: string | null
}

const DASHBOARD_CACHE_KEY = "dashboard"

export default function HomeScreen() {
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null)
  const [data, setData] = useState<AppData>(emptyData)
  const [activeTab, setActiveTab] = useState("home")
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [hasSavedSession, setHasSavedSession] = useState(false)
  const [canUseDeviceAuth, setCanUseDeviceAuth] = useState(false)
  const [deviceAuthLabel, setDeviceAuthLabel] = useState("Face ID / отпечаток / код телефона")
  const [cacheState, setCacheState] = useState<CacheState>({ fromCache: false })

  async function load(options: { allowCache?: boolean } = {}) {
    const allowCache = options.allowCache !== false

    try {
      const next = await getMobileBootstrap()
      const role = next.user.role ?? ""
      const isTenant = role === "TENANT"
      const isOwner = role === "OWNER"
      const isStaff = !isTenant
      const canReviewPayments = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)

      const [
        notices,
        tenantOverview,
        tenantFinances,
        tenantRequests,
        tenantMeters,
        tenantDocuments,
        adminToday,
        adminRequests,
        adminPayments,
        adminBuildings,
        ownerOverview,
        notifications,
        notificationSettings,
      ] = await Promise.all([
        getBuildingNotices(),
        isTenant ? getTenantOverview() : Promise.resolve(null),
        isTenant ? getTenantFinances() : Promise.resolve(null),
        isTenant ? getTenantRequests() : Promise.resolve(null),
        isTenant ? getTenantMeters() : Promise.resolve(null),
        isTenant ? getTenantDocuments() : Promise.resolve(null),
        isStaff ? getAdminToday() : Promise.resolve(null),
        isStaff ? getAdminRequests() : Promise.resolve(null),
        canReviewPayments ? getAdminPaymentReports() : Promise.resolve(null),
        isStaff ? getAdminBuildings() : Promise.resolve(null),
        isOwner ? getOwnerOverview() : Promise.resolve(null),
        getMobileNotifications(),
        getMobileNotificationSettings(),
      ])

      const nextData: AppData = {
        notices,
        tenantOverview,
        tenantFinances,
        tenantRequests,
        tenantMeters,
        tenantDocuments,
        adminToday,
        adminRequests,
        adminPayments,
        adminBuildings,
        ownerOverview,
        notifications,
        notificationSettings,
      }

      setBootstrap(next)
      setData(nextData)
      setMobileSentryUser({
        id: next.user.id,
        role: next.user.role,
        organizationId: next.organization.id,
      })
      setCacheState({ fromCache: false, savedAt: new Date().toISOString() })
      await writeCache<CachedDashboard>(DASHBOARD_CACHE_KEY, { bootstrap: next, data: nextData })

      const tabs = tabsForRole(role)
      if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab(tabs[0]?.key ?? "home")
    } catch (e) {
      if (allowCache) {
        const cached = await readCache<CachedDashboard>(DASHBOARD_CACHE_KEY)
        if (cached) {
          setBootstrap(cached.value.bootstrap)
          setData(cached.value.data)
          setMobileSentryUser({
            id: cached.value.bootstrap.user.id,
            role: cached.value.bootstrap.user.role,
            organizationId: cached.value.bootstrap.organization.id,
          })
          setCacheState({
            fromCache: true,
            savedAt: cached.savedAt,
            error: e instanceof Error ? e.message : "Нет связи с сервером",
          })

          const tabs = tabsForRole(cached.value.bootstrap.user.role)
          if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab(tabs[0]?.key ?? "home")
          return
        }
      }

      throw e
    }
  }

  async function boot() {
    const hasSession = await hasStoredSession()
    setHasSavedSession(hasSession)

    if (hasSession) {
      const availability = await getDeviceAuthAvailability()
      setCanUseDeviceAuth(availability.available)
      setDeviceAuthLabel(availability.label)
      if (!availability.available && availability.reason) setAuthError(availability.reason)
    }

    setReady(true)
  }

  async function onDeviceAuthLogin() {
    setAuthError(null)
    try {
      await unlockStoredSessionWithDeviceAuth({ refreshSession: false })
      await load()
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Не удалось подтвердить быстрый вход")
      setBootstrap(null)
      setData(emptyData)
    } finally {
      setReady(true)
    }
  }

  async function refresh() {
    if (!bootstrap) return
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  async function onLoggedIn() {
    setAuthError(null)
    try {
      await load()
      setHasSavedSession(true)
      const availability = await getDeviceAuthAvailability()
      setCanUseDeviceAuth(availability.available)
      setDeviceAuthLabel(availability.label)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Не удалось загрузить кабинет")
    }
  }

  async function onLogout() {
    await logoutMobile()
    setBootstrap(null)
    setData(emptyData)
    setActiveTab("home")
    setHasSavedSession(false)
    setCanUseDeviceAuth(false)
    setMobileSentryUser(null)
    setCacheState({ fromCache: false })
    await clearMobileCache()
  }

  useEffect(() => {
    boot()
  }, [])

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type
      if (typeof type !== "string") return
      if (type.includes("PAYMENT")) setActiveTab("payments")
      else if (type.includes("REQUEST")) setActiveTab("requests")
      else if (type.includes("DOCUMENT")) setActiveTab("documents")
      else setActiveTab("home")
    })
    return () => subscription.remove()
  }, [])

  if (!ready) return <CenteredLoader />
  if (!bootstrap) {
    return (
      <LoginScreen
        error={authError}
        hasSavedSession={hasSavedSession}
        canUseDeviceAuth={canUseDeviceAuth}
        deviceAuthLabel={deviceAuthLabel}
        onLoggedIn={onLoggedIn}
        onDeviceAuthLogin={onDeviceAuthLogin}
      />
    )
  }

  return (
    <Dashboard
      bootstrap={bootstrap}
      data={data}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      cacheState={cacheState}
      refreshing={refreshing}
      onRefresh={refresh}
      onLogout={onLogout}
    />
  )
}

function LoginScreen({
  error,
  hasSavedSession,
  canUseDeviceAuth,
  deviceAuthLabel,
  onLoggedIn,
  onDeviceAuthLogin,
}: {
  error: string | null
  hasSavedSession: boolean
  canUseDeviceAuth: boolean
  deviceAuthLabel: string
  onLoggedIn: () => Promise<void>
  onDeviceAuthLogin: () => Promise<void>
}) {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [totp, setTotp] = useState("")
  const [needsTotp, setNeedsTotp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deviceAuthBusy, setDeviceAuthBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(error)

  useEffect(() => {
    setMessage(error)
  }, [error])

  async function submitDeviceAuth() {
    setDeviceAuthBusy(true)
    setMessage(null)
    try {
      await onDeviceAuthLogin()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось подтвердить быстрый вход")
    } finally {
      setDeviceAuthBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setMessage(null)
    try {
      await loginMobile({ login, password, totp: needsTotp ? totp : undefined })
      await onLoggedIn()
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOTP_REQUIRED") {
        setNeedsTotp(true)
        setMessage("Введите код 2FA")
      } else {
        setMessage(e instanceof Error ? e.message : "Не удалось войти")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 18, gap: 14 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconBox icon="building.2.fill" color={colors.blue} />
            <View>
              <Text style={{ color: colors.text, fontSize: 25, fontWeight: "900" }}>Commrent</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Мобильный кабинет</Text>
            </View>
          </View>
          {hasSavedSession ? (
            <DeviceAuthButton
              title={deviceAuthBusy ? "Проверяем..." : `Войти через ${deviceAuthLabel}`}
              disabled={deviceAuthBusy || busy || !canUseDeviceAuth}
              onPress={submitDeviceAuth}
            />
          ) : null}
          <Field
            label="Телефон или email"
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoComplete="username"
            importantForAutofill="yes"
            keyboardType="email-address"
            placeholder="+7 700 000 00 00"
            textContentType="username"
          />
          <Field
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            importantForAutofill="yes"
            secureTextEntry
            placeholder="Введите пароль"
            textContentType="password"
          />
          {needsTotp ? <Field label="Код 2FA" value={totp} onChangeText={setTotp} keyboardType="number-pad" placeholder="000000" /> : null}
          {message ? <InlineMessage message={message} tone="error" /> : null}
          <PrimaryButton title={busy ? "Входим..." : "Войти"} disabled={busy || !login.trim() || !password.trim()} onPress={submit} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Dashboard({
  bootstrap,
  data,
  activeTab,
  setActiveTab,
  cacheState,
  refreshing,
  onRefresh,
  onLogout,
}: {
  bootstrap: MobileBootstrap
  data: AppData
  activeTab: string
  setActiveTab: (tab: string) => void
  cacheState: CacheState
  refreshing: boolean
  onRefresh: () => void
  onLogout: () => void
}) {
  const role = bootstrap.user.role ?? ""
  const tabs = tabsForRole(role)
  const { width } = useWindowDimensions()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 108, gap: 14, maxWidth: width >= 900 ? 860 : undefined, alignSelf: width >= 900 ? "center" : "stretch" }}
      >
        <HeaderCard bootstrap={bootstrap} onLogout={onLogout} />
        {cacheState.fromCache ? <OfflineBanner savedAt={cacheState.savedAt} error={cacheState.error} /> : null}
        <TabContent role={role} tab={activeTab} bootstrap={bootstrap} data={data} onChanged={onRefresh} />
      </ScrollView>
      <BottomTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
    </View>
  )
}

function TabContent({
  role,
  tab,
  bootstrap,
  data,
  onChanged,
}: {
  role: string
  tab: string
  bootstrap: MobileBootstrap
  data: AppData
  onChanged: () => void
}) {
  if (tab === "notifications") {
    return data.notifications && data.notificationSettings
      ? <NotificationsScreen payload={data.notifications} settings={data.notificationSettings} notices={data.notices} onChanged={onChanged} />
      : <CenteredLoader />
  }

  if (role === "TENANT") {
    if (!data.tenantOverview || !data.tenantFinances || !data.tenantRequests || !data.tenantMeters || !data.tenantDocuments) {
      return <CenteredLoader />
    }
    if (tab === "payments") return <TenantPayments finances={data.tenantFinances} onChanged={onChanged} />
    if (tab === "requests") return <TenantRequests requests={data.tenantRequests} onChanged={onChanged} />
    if (tab === "meters") return <TenantMeters meters={data.tenantMeters} onChanged={onChanged} />
    if (tab === "documents") return <TenantDocuments documents={data.tenantDocuments} />
    if (tab === "more") return <More bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} />
    return <TenantHome overview={data.tenantOverview} notices={data.notices} />
  }

  if (role === "OWNER" && tab === "owner") {
    return data.ownerOverview ? <OwnerOverview data={data.ownerOverview} /> : <CenteredLoader />
  }
  if (tab === "requests") return data.adminRequests ? <AdminRequests payload={data.adminRequests} onChanged={onChanged} /> : <CenteredLoader />
  if (tab === "payments") return data.adminPayments ? <AdminPayments payload={data.adminPayments} onChanged={onChanged} /> : <NoAccess title="Оплаты доступны владельцу, админу и бухгалтеру" />
  if (tab === "buildings") return data.adminBuildings ? <AdminBuildings payload={data.adminBuildings} /> : <CenteredLoader />
  if (tab === "more") return <More bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} />
  return data.adminToday ? <AdminToday payload={data.adminToday} notices={data.notices} bootstrap={bootstrap} onChanged={onChanged} /> : <CenteredLoader />
}

function TenantHome({ overview, notices }: { overview: TenantOverview; notices: BuildingNotice[] }) {
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
          items={[
            { label: "Долг", value: formatMoney(overview.finances.totalDebt), color: overview.finances.totalDebt > 0 ? colors.red : colors.green },
            { label: "Аренда", value: formatMoney(overview.tenant.monthlyRent), color: colors.slate },
            { label: "Заявки", value: String(overview.counters.activeRequests), color: colors.blue },
            { label: "Документы", value: String(overview.counters.pendingDocuments), color: colors.orange },
          ]}
        />
      </Card>
      <SectionTitle title="Объявления" />
      <NoticeList notices={notices.slice(0, 6)} />
      <SectionTitle title="Ближайшие действия" />
      <Card>
        <ActionRow icon="creditcard.fill" title="К оплате" value={formatMoney(overview.finances.totalDebt)} color={overview.finances.totalDebt > 0 ? colors.red : colors.green} />
        <ActionRow icon="signature" title="На подпись" value={`${overview.counters.pendingDocuments}`} color={colors.blue} />
        <ActionRow icon="gauge.with.dots.needle.50percent" title="Счетчики" value={`${overview.counters.meters}`} color={colors.teal} />
      </Card>
    </>
  )
}

function TenantPayments({ finances, onChanged }: { finances: TenantFinances; onChanged: () => void }) {
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
      <SectionTitle title="История" />
      <Card>
        {finances.paymentReports.slice(0, 8).map((report) => (
          <CompactRow key={report.id} title={formatMoney(report.amount)} subtitle={`${formatDate(report.paymentDate)} · ${report.method} · ${report.status}${report.receiptName ? " · чек" : ""}`} tone={report.status === "REJECTED" ? colors.red : report.status === "CONFIRMED" ? colors.green : colors.blue} />
        ))}
        {finances.paymentReports.length === 0 ? <EmptyState title="Отправленных оплат пока нет" /> : null}
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

function TenantRequests({ requests, onChanged }: { requests: TenantRequestsPayload; onChanged: () => void }) {
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
      <SectionTitle title="Мои заявки" />
      <RequestList requests={requests.data} />
    </>
  )
}

function TenantMeters({ meters, onChanged }: { meters: TenantMetersPayload; onChanged: () => void }) {
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
          <Pressable disabled={busy || !value.trim()} onPress={submit} style={{ minHeight: 44, borderRadius: 8, paddingHorizontal: 16, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
            <Text style={{ color: "#ffffff", fontWeight: "900" }}>ОК</Text>
          </Pressable>
        </View>
      )}
      {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
    </Card>
  )
}

function TenantDocuments({ documents }: { documents: TenantDocumentsPayload }) {
  const [message, setMessage] = useState<string | null>(null)
  const pendingRequests = documents.signatureRequests.filter((item) => ["PENDING", "VIEWED"].includes(item.status))
  const pendingContracts = documents.contractLinks.filter((item) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(item.status))
  const pending = pendingRequests.length + pendingContracts.length

  async function startDraft(requestId: string, method: "SMS_OTP_DRAFT" | "NCA_LAYER_DRAFT") {
    setMessage(null)
    try {
      const result = await startDocumentSignatureDraft({ requestId, method })
      setMessage(result.message ?? "Черновик подписания подготовлен")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось подготовить подписание")
    }
  }

  return (
    <>
      <SectionTitle title="Документы" />
      <Card>
        <ActionRow icon="signature" title="Ожидают подписи" value={String(pending)} color={pending > 0 ? colors.orange : colors.green} />
        {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
        {pendingRequests.map((request) => (
          <View key={request.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image source="sf:doc.badge.arrow.up.fill" style={{ width: 18, height: 18, tintColor: colors.orange }} />
              <Text selectable style={{ flex: 1, color: colors.text, fontWeight: "900" }}>{request.title}</Text>
              <StatusPill label={request.status} color={colors.orange} />
            </View>
            {request.message ? <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{request.message}</Text> : null}
            <Text style={{ color: colors.muted, fontSize: 12 }}>{documentTypeLabel(request.documentType)} · {request.expiresAt ? `до ${formatDate(request.expiresAt)}` : "без срока"}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <SecondaryButton title="SMS draft" icon="message.fill" onPress={() => startDraft(request.id, "SMS_OTP_DRAFT")} />
              <SecondaryButton title="ЭЦП draft" icon="checkmark.seal.fill" onPress={() => startDraft(request.id, "NCA_LAYER_DRAFT")} />
            </View>
          </View>
        ))}
        {documents.contractLinks.map((contract) => (
          <Pressable key={contract.id} onPress={() => Linking.openURL(contract.webUrl)} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 }}>
            <Text selectable style={{ color: colors.text, fontWeight: "900" }}>{contract.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{contract.status} · открыть подписание</Text>
          </Pressable>
        ))}
        {pending === 0 ? <EmptyState title="Документов на подпись нет" /> : null}
      </Card>
      <SectionTitle title="Счета и акты" />
      <Card>
        {documents.generated.map((document) => (
          <DocumentRow
            key={document.id}
            title={document.fileName}
            subtitle={`${documentTypeLabel(document.documentType)} · ${document.period ?? "без периода"} · ${formatFileSize(document.fileSize)}`}
            url={document.downloadUrl}
          />
        ))}
        {documents.generated.length === 0 ? <EmptyState title="Счетов и актов пока нет" /> : null}
      </Card>
      <SectionTitle title="Архив арендатора" />
      <Card>
        {documents.tenantDocuments.map((document) => (
          <DocumentRow
            key={document.id}
            title={document.name}
            subtitle={`${documentTypeLabel(document.type)} · ${formatDate(document.createdAt)}`}
            url={document.downloadUrl ?? document.fileUrl}
          />
        ))}
        {documents.tenantDocuments.length === 0 ? <EmptyState title="Файлов пока нет" /> : null}
      </Card>
    </>
  )
}

function DocumentRow({ title, subtitle, url }: { title: string; subtitle: string; url?: string | null }) {
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
        disabled={!url || busy}
        onPress={openDocument}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5, opacity: url ? 1 : 0.55 }}
      >
        <Image source="sf:doc.text.fill" style={{ width: 19, height: 19, tintColor: colors.blue }} />
        <View style={{ flex: 1 }}>
          <Text selectable numberOfLines={1} style={{ color: colors.text, fontWeight: "800" }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{busy ? "Скачиваем..." : subtitle}</Text>
        </View>
        <Image source={busy ? "sf:arrow.down.circle" : "sf:square.and.arrow.up"} style={{ width: 17, height: 17, tintColor: colors.muted }} />
      </Pressable>
      {message ? <InlineMessage message={message} tone="error" /> : null}
    </View>
  )
}

function AdminToday({ payload, notices, bootstrap, onChanged }: { payload: AdminTodayPayload; notices: BuildingNotice[]; bootstrap: MobileBootstrap; onChanged: () => void }) {
  const canNotice = ["OWNER", "ADMIN", "FACILITY_MANAGER"].includes(bootstrap.user.role ?? "")
  return (
    <>
      <SectionTitle title="Сегодня" />
      <Card>
        <MetricGrid
          items={[
            { label: "Заявки", value: String(payload.counters.openRequests), color: colors.blue },
            { label: "Срочные", value: String(payload.counters.urgentRequests), color: colors.red },
            { label: "Оплаты", value: String(payload.counters.pendingPayments), color: colors.green },
            { label: "Долг", value: formatMoney(payload.counters.overdueAmount), color: colors.orange },
          ]}
        />
      </Card>
      {canNotice ? <NoticeComposer buildings={payload.buildings} onChanged={onChanged} /> : null}
      <SectionTitle title="Последние заявки" />
      <RequestList requests={payload.recent.requests} />
      <SectionTitle title="Оплаты на проверке" />
      <Card>
        {payload.recent.paymentReports.map((report) => (
          <CompactRow key={report.id} title={report.tenant.companyName} subtitle={`${formatMoney(report.amount)} · ${report.method} · ${formatDate(report.paymentDate)}`} tone={colors.green} />
        ))}
        {payload.recent.paymentReports.length === 0 ? <EmptyState title="Оплат на проверке нет" /> : null}
      </Card>
      <SectionTitle title="Объявления" />
      <NoticeList notices={notices.slice(0, 4)} />
    </>
  )
}

function AdminRequests({ payload, onChanged }: { payload: AdminRequestsPayload; onChanged: () => void }) {
  return (
    <>
      <SectionTitle title="Заявки" />
      <Card>
        <MetricGrid
          items={[
            { label: "Открыто", value: String(payload.counters.open), color: colors.blue },
            { label: "Срочно", value: String(payload.counters.urgent), color: colors.red },
            { label: "Закрыто", value: String(payload.counters.done), color: colors.green },
          ]}
        />
      </Card>
      {payload.data.map((request) => (
        <Card key={request.id}>
          <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{request.title}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{request.tenant.companyName} · {request.priority} · {request.status}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <SecondaryButton title="В работу" icon="play.fill" onPress={async () => { await updateAdminRequest({ requestId: request.id, status: "IN_PROGRESS" }); onChanged() }} />
            <SecondaryButton title="Готово" icon="checkmark" onPress={async () => { await updateAdminRequest({ requestId: request.id, status: "DONE" }); onChanged() }} />
            <SecondaryButton title="Закрыть" icon="xmark" onPress={async () => { await updateAdminRequest({ requestId: request.id, status: "CLOSED" }); onChanged() }} />
          </View>
        </Card>
      ))}
    </>
  )
}

function AdminPayments({ payload, onChanged }: { payload: AdminPaymentReportsPayload; onChanged: () => void }) {
  return (
    <>
      <SectionTitle title="Оплаты" />
      <Card>
        <MetricGrid
          items={[
            { label: "На проверке", value: String(payload.counters.pending), color: colors.blue },
            { label: "Спорные", value: String(payload.counters.disputed), color: colors.orange },
            { label: "Сумма", value: formatMoney(payload.counters.amount), color: colors.green },
          ]}
        />
      </Card>
      {payload.data.map((report) => (
        <Card key={report.id}>
          <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{report.tenant.companyName}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{formatMoney(report.amount)} · {report.method} · {formatDate(report.paymentDate)} · {report.status}</Text>
          {report.note ? <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{report.note}</Text> : null}
          {report.receiptUrl ? <SecondaryButton title="Открыть чек" icon="doc.richtext" onPress={() => Linking.openURL(report.receiptUrl!)} /> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <SecondaryButton title="Подтвердить" icon="checkmark.circle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "confirm", method: report.method }); onChanged() }} />
            <SecondaryButton title="Спорная" icon="exclamationmark.triangle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "dispute", reason: "Уточнить оплату" }); onChanged() }} />
            <SecondaryButton title="Отклонить" icon="xmark.circle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "reject", reason: "Не найдено поступление" }); onChanged() }} />
          </View>
        </Card>
      ))}
      {payload.data.length === 0 ? <EmptyState title="Оплат на проверке нет" /> : null}
    </>
  )
}

function AdminBuildings({ payload }: { payload: AdminBuildingsPayload }) {
  return (
    <>
      <SectionTitle title="Объекты" />
      {payload.data.map((building) => (
        <Card key={building.id}>
          <Text selectable style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{building.name}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{building.address}</Text>
          <MetricGrid
            items={[
              { label: "Арендаторы", value: String(building.counters.tenants), color: colors.blue },
              { label: "Долг", value: formatMoney(building.counters.debtAmount), color: building.counters.debtAmount > 0 ? colors.red : colors.green },
              { label: "Заявки", value: String(building.counters.openRequests), color: colors.orange },
            ]}
          />
        </Card>
      ))}
    </>
  )
}

function OwnerOverview({ data }: { data: OwnerOverviewPayload }) {
  return (
    <>
      <SectionTitle title="Владелец" />
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
      <SectionTitle title="Здания" />
      {data.buildings.map((building) => (
        <Card key={building.id}>
          <Text selectable style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{building.name}</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{building.address}</Text>
          <MetricGrid
            items={[
              { label: "Арендаторы", value: String(building.tenants), color: colors.blue },
              { label: "Долг", value: formatMoney(building.debtAmount), color: building.debtAmount > 0 ? colors.red : colors.green },
              { label: "Заявки", value: String(building.openRequests), color: colors.orange },
            ]}
          />
        </Card>
      ))}
    </>
  )
}

function NoticeComposer({ buildings, onChanged }: { buildings: MobileBootstrap["buildings"]; onChanged: () => void }) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "")
  const [type, setType] = useState("ELECTRICITY")
  const [severity, setSeverity] = useState("WARNING")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setResult(null)
    try {
      await createBuildingNotice({ buildingId, type, severity, title, message })
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

function NotificationsScreen({
  payload,
  settings,
  notices,
  onChanged,
}: {
  payload: MobileNotificationsPayload
  settings: MobileNotificationSettingsPayload
  notices: BuildingNotice[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const eventLabels = Object.fromEntries(settings.settings.eventTypes.map((item) => [item.key, item.label]))

  async function markAllRead() {
    setBusy(true)
    setMessage(null)
    try {
      await markMobileNotificationsRead({ markAllRead: true })
      setMessage("Уведомления отмечены прочитанными")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось обновить уведомления")
    } finally {
      setBusy(false)
    }
  }

  async function openNotification(notification: MobileNotification) {
    if (!notification.isRead) {
      await markMobileNotificationsRead({ ids: [notification.id] }).catch(() => null)
      onChanged()
    }
    if (notification.link) openExternalUrl(notification.link).catch(() => null)
  }

  return (
    <>
      <SectionTitle title="Уведомления" />
      <Card>
        <MetricGrid
          items={[
            { label: "Новые", value: String(payload.unreadCount), color: payload.unreadCount > 0 ? colors.orange : colors.green },
            { label: "Всего", value: String(payload.data.length), color: colors.blue },
            { label: "Объявления", value: String(notices.length), color: colors.teal },
            { label: "Типы", value: String(settings.settings.eventTypes.length), color: colors.slate },
          ]}
        />
        <PrimaryButton title={busy ? "Обновляем..." : "Отметить все прочитанными"} disabled={busy || payload.unreadCount === 0} onPress={markAllRead} />
        {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
      </Card>
      <SectionTitle title="История" />
      {payload.data.length === 0 ? <Card><EmptyState title="Уведомлений пока нет" /></Card> : null}
      {payload.data.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          label={eventLabels[notification.type] ?? notification.type}
          onPress={() => openNotification(notification)}
        />
      ))}
      <SectionTitle title="Объявления по зданиям" />
      <NoticeList notices={notices.slice(0, 8)} />
    </>
  )
}

function NotificationRow({ notification, label, onPress }: { notification: MobileNotification; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={notification.isRead ? "sf:bell" : "sf:bell.badge.fill"} style={{ width: 20, height: 20, tintColor: notification.isRead ? colors.muted : colors.orange }} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{notification.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{label} · {formatDateTime(notification.createdAt)}</Text>
          </View>
          {!notification.isRead ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange }} /> : null}
        </View>
        <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{notification.message}</Text>
      </Card>
    </Pressable>
  )
}

function More({ bootstrap, buildings, settings, onChanged }: { bootstrap: MobileBootstrap; buildings: MobileBootstrap["buildings"]; settings: MobileNotificationSettingsPayload | null; onChanged: () => void }) {
  const [pushBusy, setPushBusy] = useState(false)
  const [pushState, setPushState] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState<MobileNotificationSettingsPayload | null>(settings)
  const [pushPreferences, setPushPreferences] = useState<LocalPushPreferences | null>(null)
  const [sessions, setSessions] = useState<MobileSessionInfo[]>([])
  const [sessionsBusy, setSessionsBusy] = useState(false)

  useEffect(() => {
    setLocalSettings(settings)
    if (settings) {
      setPushPreferences({
        quietHoursEnabled: settings.settings.quietHoursEnabled,
        quietFrom: settings.settings.quietFrom,
        quietTo: settings.settings.quietTo,
      })
    }
  }, [settings])

  useEffect(() => {
    if (!settings) getLocalPushPreferences().then(setPushPreferences).catch(() => null)
    loadSessions()
  }, [])

  async function enablePush() {
    setPushBusy(true)
    setPushState(null)
    try {
      await registerPushDevice()
      setPushState("Уведомления подключены")
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось подключить push")
    } finally {
      setPushBusy(false)
    }
  }

  async function disablePush() {
    setPushBusy(true)
    setPushState(null)
    try {
      await unregisterPushDevice()
      setPushState("Push отключен на этом устройстве")
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось отключить push")
    } finally {
      setPushBusy(false)
    }
  }

  async function toggleMutedType(type: string) {
    if (!localSettings) return
    const muted = new Set(localSettings.settings.mutedTypes)
    if (muted.has(type)) muted.delete(type)
    else muted.add(type)

    const nextMutedTypes = [...muted]
    setLocalSettings({
      ...localSettings,
      settings: {
        ...localSettings.settings,
        mutedTypes: nextMutedTypes,
      },
    })

    try {
      await updateMobileNotificationSettings({ mutedTypes: nextMutedTypes })
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось сохранить настройки")
    }
  }

  async function updateQuietHours(next: LocalPushPreferences) {
    setPushPreferences(next)
    await saveLocalPushPreferences(next)
    setLocalSettings((current) => current
      ? {
          ...current,
          settings: {
            ...current.settings,
            quietHoursEnabled: next.quietHoursEnabled,
            quietFrom: next.quietFrom,
            quietTo: next.quietTo,
          },
        }
      : current)
    try {
      await updateMobileNotificationSettings({
        quietHoursEnabled: next.quietHoursEnabled,
        quietFrom: next.quietFrom,
        quietTo: next.quietTo,
      })
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось сохранить тихие часы")
    }
  }

  async function loadSessions() {
    setSessionsBusy(true)
    try {
      const payload = await getMobileSessions()
      setSessions(payload.data)
    } catch {
      setSessions([])
    } finally {
      setSessionsBusy(false)
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionsBusy(true)
    setPushState(null)
    try {
      await revokeMobileSession(sessionId)
      await loadSessions()
      setPushState("Сессия отключена")
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось отключить сессию")
    } finally {
      setSessionsBusy(false)
    }
  }

  return (
    <>
      <SectionTitle title="Еще" />
      <Card>
        <Text selectable style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{bootstrap.organization.name} · {bootstrap.user.role}</Text>
        <PrimaryButton title={pushBusy ? "Подключаем..." : "Включить push"} disabled={pushBusy} onPress={enablePush} />
        <SecondaryButton title="Отключить push" icon="bell.slash.fill" onPress={disablePush} />
        {pushState ? <InlineMessage message={pushState} tone={pushState.includes("Не ") ? "error" : "success"} /> : null}
      </Card>
      <SectionTitle title="Настройки push" />
      <Card>
        <ActionRow icon="iphone" title="Активные устройства" value={String(localSettings?.devices.length ?? 0)} color={colors.blue} />
        {pushPreferences ? (
          <>
            <ToggleRow
              title="Тихие часы"
              subtitle={`${pushPreferences.quietFrom} - ${pushPreferences.quietTo}`}
              value={pushPreferences.quietHoursEnabled}
              onValueChange={(value) => updateQuietHours({ ...pushPreferences, quietHoursEnabled: value })}
            />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Начало</Text>
            <ChoiceRow options={[["21:00", "21:00"], ["22:00", "22:00"], ["23:00", "23:00"]]} value={pushPreferences.quietFrom} onChange={(quietFrom) => updateQuietHours({ ...pushPreferences, quietFrom })} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Окончание</Text>
            <ChoiceRow options={[["07:00", "07:00"], ["08:00", "08:00"], ["09:00", "09:00"]]} value={pushPreferences.quietTo} onChange={(quietTo) => updateQuietHours({ ...pushPreferences, quietTo })} />
          </>
        ) : null}
        {localSettings?.settings.eventTypes.map((eventType) => {
          const enabled = !localSettings.settings.mutedTypes.includes(eventType.key)
          return (
            <ToggleRow
              key={eventType.key}
              title={eventType.label}
              subtitle={enabled ? "Push включен" : "Push выключен"}
              value={enabled}
              onValueChange={() => toggleMutedType(eventType.key)}
            />
          )
        })}
      </Card>
      <SectionTitle title="Безопасность" />
      <Card>
        <ActionRow icon="lock.shield.fill" title="Активные входы" value={sessionsBusy ? "..." : String(sessions.length)} color={colors.slate} />
        {sessions.map((session) => (
          <View key={session.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8 }}>
            <CompactRow
              title={session.deviceName ?? session.platform ?? "Мобильное устройство"}
              subtitle={`${session.platform ?? "APP"} · ${session.ip ?? "IP скрыт"} · ${formatDateTime(session.lastUsedAt)}`}
              tone={colors.slate}
            />
            <SecondaryButton title="Отключить вход" icon="xmark.circle.fill" onPress={() => revokeSession(session.id)} />
          </View>
        ))}
        {sessions.length === 0 && !sessionsBusy ? <EmptyState title="Активных мобильных входов нет" /> : null}
      </Card>
      <SectionTitle title="Объекты" />
      <Card>
        {buildings.map((building) => (
          <CompactRow key={building.id} title={building.name} subtitle={building.address} tone={colors.blue} />
        ))}
      </Card>
    </>
  )
}

function HeaderCard({ bootstrap, onLogout }: { bootstrap: MobileBootstrap; onLogout: () => void }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconBox icon="building.2.fill" color={bootstrap.user.role === "TENANT" ? colors.teal : colors.blue} />
        <View style={{ flex: 1 }}>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{bootstrap.organization.name}</Text>
          <Text selectable style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
        </View>
        <Pressable onPress={onLogout} style={{ padding: 8 }}>
          <Image source="sf:rectangle.portrait.and.arrow.right" style={{ width: 22, height: 22, tintColor: colors.muted }} />
        </Pressable>
      </View>
    </Card>
  )
}

function RequestList({ requests }: { requests: Array<{ id: string; title: string; description: string; status: string; priority: string; createdAt: string; tenant?: { companyName: string } }> }) {
  if (requests.length === 0) return <EmptyState title="Заявок пока нет" />
  return (
    <>
      {requests.map((request) => (
        <Card key={request.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text selectable style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" }}>{request.title}</Text>
            <StatusPill label={request.status} color={["DONE", "CLOSED"].includes(request.status) ? colors.green : colors.blue} />
          </View>
          <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{request.tenant?.companyName ? `${request.tenant.companyName} · ` : ""}{request.priority} · {formatDate(request.createdAt)}</Text>
          <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
        </Card>
      ))}
    </>
  )
}

function NoticeList({ notices }: { notices: BuildingNotice[] }) {
  if (notices.length === 0) return <EmptyState title="Активных объявлений нет" />
  return (
    <>
      {notices.map((notice) => (
        <Card key={notice.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source="sf:bell.fill" style={{ width: 20, height: 20, tintColor: notice.severity === "CRITICAL" ? colors.red : notice.severity === "WARNING" ? colors.orange : colors.blue }} />
            <Text selectable style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" }}>{notice.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(notice.createdAt)}</Text>
          </View>
          <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{notice.message}</Text>
        </Card>
      ))}
    </>
  )
}

function BottomTabs({ tabs, activeTab, onChange }: { tabs: Array<{ key: string; label: string; icon: string }>; activeTab: string; onChange: (tab: string) => void }) {
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "#ffffff", flexDirection: "row", padding: 8, gap: 4 }}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={{ flex: 1, minHeight: 54, borderRadius: 8, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: active ? "#eff6ff" : "transparent" }}>
            <Image source={`sf:${tab.icon}`} style={{ width: 21, height: 21, tintColor: active ? colors.blue : colors.muted }} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? colors.blue : colors.muted, fontSize: 11, fontWeight: active ? "900" : "700" }}>{tab.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function OfflineBanner({ savedAt, error }: { savedAt?: string; error?: string | null }) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", padding: 12, gap: 4 }}>
      <Text style={{ color: colors.orange, fontSize: 14, fontWeight: "900" }}>Офлайн-режим</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Показаны сохраненные данные{savedAt ? ` от ${formatDateTime(savedAt)}` : ""}{error ? `. ${error}` : ""}
      </Text>
    </View>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, gap: 12 }}>{children}</View>
}

function ToggleRow({ title, subtitle, value, onValueChange }: { title: string; subtitle?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ color: colors.text, fontSize: 14, fontWeight: "900" }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#cbd5e1", true: "#bfdbfe" }} thumbColor={value ? colors.blue : "#f8fafc"} />
    </View>
  )
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#94a3b8"
        style={[{
          minHeight: props.multiline ? 90 : 46,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "#ffffff",
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          textAlignVertical: props.multiline ? "top" : "center",
        }, props.style]}
      />
    </View>
  )
}

function DeviceAuthButton({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        borderRadius: 8,
        backgroundColor: "#eff6ff",
        borderWidth: 1,
        borderColor: "#bfdbfe",
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Image source="sf:lock.fill" style={{ width: 16, height: 16, tintColor: colors.blue }} />
      <Text numberOfLines={2} style={{ color: colors.blue, fontSize: 14, fontWeight: "900", textAlign: "center" }}>{title}</Text>
    </Pressable>
  )
}

function PrimaryButton({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={{ minHeight: 46, borderRadius: 8, backgroundColor: colors.slate, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "900" }}>{title}</Text>
    </Pressable>
  )
}

function SecondaryButton({ title, icon, onPress }: { title: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#ffffff" }}>
      <Image source={`sf:${icon}`} style={{ width: 15, height: 15, tintColor: colors.blue }} />
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  )
}

function ChoiceRow({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (value: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map(([key, label]) => (
        <Pressable key={key} onPress={() => onChange(key)} style={{ borderRadius: 999, borderWidth: 1, borderColor: value === key ? colors.blue : colors.border, backgroundColor: value === key ? "#eff6ff" : "#ffffff", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ color: value === key ? colors.blue : colors.muted, fontSize: 13, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

function MetricGrid({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexGrow: 1, flexBasis: "42%", minHeight: 78, borderRadius: 8, backgroundColor: "#f8fafc", padding: 10, justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{item.label}</Text>
          <Text selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: item.color, fontSize: 19, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

function ActionRow({ icon, title, value, color }: { icon: string; title: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconBox icon={icon} color={color} />
      <Text selectable style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "900" }}>{title}</Text>
      <Text selectable style={{ color, fontSize: 16, fontWeight: "900" }}>{value}</Text>
    </View>
  )
}

function CompactRow({ title, subtitle, value, tone }: { title: string; subtitle?: string | null; value?: string; tone: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
      <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Text selectable style={{ color: colors.text, fontWeight: "800" }}>{title}</Text>
        {subtitle ? <Text selectable style={{ color: colors.muted, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text selectable style={{ color: tone, fontWeight: "900" }}>{value}</Text> : null}
    </View>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderColor: `${color}40`, borderWidth: 1, borderRadius: 999, backgroundColor: `${color}12`, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "900" }}>{label}</Text>
    </View>
  )
}

function IconBox({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${color}14` }}>
      <Image source={`sf:${icon}`} style={{ width: 21, height: 21, tintColor: color }} />
    </View>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 }}>{title}</Text>
}

function EmptyState({ title }: { title: string }) {
  return (
    <Card>
      <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>{title}</Text>
    </Card>
  )
}

function NoAccess({ title }: { title: string }) {
  return <EmptyState title={title} />
}

function InlineMessage({ message, tone }: { message: string; tone: "error" | "success" }) {
  const color = tone === "error" ? colors.red : colors.green
  return (
    <View style={{ borderRadius: 8, borderColor: `${color}44`, borderWidth: 1, backgroundColor: `${color}10`, padding: 10 }}>
      <Text selectable style={{ color, fontSize: 13, fontWeight: "700" }}>{message}</Text>
    </View>
  )
}

function CenteredLoader() {
  return (
    <View style={{ minHeight: 180, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.blue} />
    </View>
  )
}

function tabsForRole(role?: string | null) {
  if (role === "TENANT") {
    return [
      { key: "home", label: "Главная", icon: "house.fill" },
      { key: "payments", label: "Оплата", icon: "creditcard.fill" },
      { key: "requests", label: "Заявки", icon: "wrench.and.screwdriver.fill" },
      { key: "documents", label: "Документы", icon: "doc.text.fill" },
      { key: "notifications", label: "Увед.", icon: "bell.fill" },
      { key: "more", label: "Еще", icon: "ellipsis" },
    ]
  }

  if (role === "OWNER") {
    return [
      { key: "owner", label: "KPI", icon: "chart.line.uptrend.xyaxis" },
      { key: "home", label: "Сегодня", icon: "list.bullet.rectangle.fill" },
      { key: "requests", label: "Заявки", icon: "tray.full.fill" },
      { key: "payments", label: "Оплаты", icon: "creditcard.fill" },
      { key: "notifications", label: "Увед.", icon: "bell.fill" },
      { key: "more", label: "Еще", icon: "ellipsis" },
    ]
  }

  return [
    { key: "home", label: "Сегодня", icon: "list.bullet.rectangle.fill" },
    { key: "requests", label: "Заявки", icon: "tray.full.fill" },
    { key: "payments", label: "Оплаты", icon: "creditcard.fill" },
    { key: "buildings", label: "Объекты", icon: "building.2.fill" },
    { key: "notifications", label: "Увед.", icon: "bell.fill" },
    { key: "more", label: "Еще", icon: "ellipsis" },
  ]
}

async function pickUploadFile(kind: "receipt" | "request"): Promise<PickedUploadFile | null> {
  const photo = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (photo.granted) {
    const image = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
      allowsEditing: false,
    })
    if (!image.canceled && image.assets[0]) {
      const asset = image.assets[0]
      return {
        uri: asset.uri,
        name: asset.fileName ?? `${kind}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      }
    }
  }

  const doc = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    copyToCacheDirectory: true,
  })
  if (doc.canceled || !doc.assets[0]) return null
  return {
    uri: doc.assets[0].uri,
    name: doc.assets[0].name,
    mimeType: doc.assets[0].mimeType ?? "application/octet-stream",
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return "размер не указан"
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function documentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    CONTRACT: "Договор",
    ADDENDUM: "Доп. соглашение",
    INVOICE: "Счет",
    ACT: "Акт выполненных работ",
    RECONCILIATION: "Акт сверки",
    ACCEPTANCE: "Акт приема-передачи",
  }
  return labels[type] ?? type
}

function openExternalUrl(url: string) {
  const fullUrl = url.startsWith("http") ? url : `https://commrent.kz${url.startsWith("/") ? "" : "/"}${url}`
  return Linking.openURL(fullUrl)
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}
