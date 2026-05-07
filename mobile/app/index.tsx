import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import * as Notifications from "expo-notifications"
import * as Sharing from "expo-sharing"
import type { ComponentProps, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import {
  Bell,
  BellOff,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Ellipsis,
  FileSignature,
  FileText,
  Gauge,
  Home,
  Inbox,
  KeyRound,
  ListChecks,
  Lock,
  LogOut,
  MapPinned,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Play,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Signature,
  Smartphone,
  SquareArrowOutUpRight,
  TrendingUp,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wrench,
  X,
  XCircle,
} from "lucide-react-native"
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
  getAdminDocuments,
  getAdminPaymentReports,
  getAdminRequests,
  getAdminTenantDetail,
  getAdminTenants,
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
  TenantSignatureRequest,
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

const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extraBold: "Inter_800ExtraBold",
  black: "Inter_900Black",
}

type AppIconComponent = typeof Bell

const iconByName: Record<string, AppIconComponent> = {
  "arrow.down.circle": Download,
  "arrow.up.right.square": SquareArrowOutUpRight,
  "bell": Bell,
  "bell.badge.fill": Bell,
  "bell.fill": Bell,
  "bell.slash.fill": BellOff,
  "building.2": Building2,
  "building.2.fill": Building2,
  "calendar": CalendarDays,
  "camera.fill": Camera,
  "chart.line.uptrend.xyaxis": TrendingUp,
  "checkmark": Check,
  "checkmark.circle.fill": CheckCircle2,
  "checkmark.seal.fill": ShieldCheck,
  "creditcard.fill": CreditCard,
  "doc.badge.arrow.up.fill": FileSignature,
  "doc.text.fill": FileText,
  "ellipsis": MoreHorizontal,
  "gauge.with.dots.needle.50percent": Gauge,
  "house.fill": Home,
  "iphone": Smartphone,
  "key.fill": KeyRound,
  "list.bullet.rectangle.fill": ListChecks,
  "location.fill": MapPinned,
  "lock.fill": Lock,
  "lock.shield.fill": ShieldCheck,
  "message.fill": MessageCircle,
  "paperclip": Paperclip,
  "person.2.fill": UsersRound,
  "person.fill": UserRound,
  "play.fill": Play,
  "rectangle.portrait.and.arrow.right": LogOut,
  "search": Search,
  "send.fill": Send,
  "settings": Settings,
  "signature": Signature,
  "square.and.arrow.up": SquareArrowOutUpRight,
  "tray.full.fill": Inbox,
  "wrench.and.screwdriver.fill": Wrench,
  "xmark": X,
  "xmark.circle.fill": XCircle,
  "dollarsign.circle.fill": CircleDollarSign,
  "doc.on.doc.fill": ClipboardList,
  "chevron.right": ChevronRight,
  "chevron.left": ChevronLeft,
  "doc.richtext": FileText,
  "exclamationmark.triangle.fill": TriangleAlert,
}

function AppIcon({ name, size = 20, color = colors.text, strokeWidth = 2.4 }: { name: string; size?: number; color?: string; strokeWidth?: number }) {
  const Icon = iconByName[name] ?? Ellipsis
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />
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
  adminTenants: AdminTenantsPayload | null
  adminTenantDetails: Record<string, AdminTenantDetailPayload>
  adminDocuments: AdminDocumentsPayload | null
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
  adminTenants: null,
  adminTenantDetails: {},
  adminDocuments: null,
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
  const [loadingTabs, setLoadingTabs] = useState<Record<string, boolean>>({})
  const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({})

  async function load(options: { allowCache?: boolean } = {}) {
    const allowCache = options.allowCache !== false

    try {
      const next = await getMobileBootstrap()
      const role = next.user.role ?? ""
      const isTenant = role === "TENANT"
      const isOwner = role === "OWNER"
      const isStaff = !isTenant

      const [
        notices,
        tenantOverview,
        adminToday,
        ownerOverview,
        notifications,
        notificationSettings,
      ] = await Promise.all([
        getBuildingNotices(),
        isTenant ? getTenantOverview() : Promise.resolve(null),
        isStaff ? getAdminToday() : Promise.resolve(null),
        isOwner ? getOwnerOverview() : Promise.resolve(null),
        getMobileNotifications(),
        getMobileNotificationSettings(),
      ])

      const nextData: AppData = {
        notices,
        tenantOverview,
        tenantFinances: null,
        tenantRequests: null,
        tenantMeters: null,
        tenantDocuments: null,
        adminToday,
        adminRequests: null,
        adminPayments: null,
        adminBuildings: null,
        adminTenants: null,
        adminTenantDetails: {},
        adminDocuments: null,
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
      if (!tabs.some((tab) => tab.key === rootTab(activeTab))) setActiveTab(tabs[0]?.key ?? "home")
    } catch (e) {
      if (allowCache) {
        const cached = await readCache<CachedDashboard>(DASHBOARD_CACHE_KEY)
        if (cached) {
          const cachedData = {
            ...emptyData,
            ...cached.value.data,
            adminTenantDetails: cached.value.data.adminTenantDetails ?? {},
          }
          setBootstrap(cached.value.bootstrap)
          setData(cachedData)
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
          if (!tabs.some((tab) => tab.key === rootTab(activeTab))) setActiveTab(tabs[0]?.key ?? "home")
          return
        }
      }

      throw e
    }
  }

  async function loadTabData(tab = activeTab, options: { force?: boolean } = {}) {
    if (!bootstrap) return
    const tabKey = rootTab(tab)
    const [, tabParam, tabSubParam] = tab.split(":")
    const role = bootstrap.user.role ?? ""
    const isTenant = role === "TENANT"
    const canReviewPayments = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)
    const scopedStaffTab = !isTenant && !!tabParam && ["tenants", "documents", "requests", "payments"].includes(tabKey)

    if (!options.force && !scopedStaffTab && hasTabData(data, role, tabKey, tabParam)) return

    setLoadingTabs((current) => ({ ...current, [tabKey]: true }))
    setTabErrors((current) => ({ ...current, [tabKey]: null }))

    try {
      let patch: Partial<AppData> = {}

      if (isTenant) {
        if (tabKey === "payments") patch = { tenantFinances: await getTenantFinances() }
        else if (tabKey === "requests") patch = { tenantRequests: await getTenantRequests() }
        else if (tabKey === "meters") patch = { tenantMeters: await getTenantMeters() }
        else if (tabKey === "documents") patch = { tenantDocuments: await getTenantDocuments() }
      } else {
        if (tabKey === "tenant" && tabParam) {
          const detail = await getAdminTenantDetail(tabParam)
          patch = {
            adminTenantDetails: { ...data.adminTenantDetails, [tabParam]: detail },
            adminTenants: data.adminTenants ?? await getAdminTenants(),
          }
        } else if (tabKey === "tenants") patch = { adminTenants: await getAdminTenants({ buildingId: tabParam }) }
        else if (tabKey === "documents" || tabKey === "document" || tabKey === "contract") {
          const buildingId = tabKey === "documents" && tabParam === "building" ? tabSubParam : undefined
          const tenantId = tabKey === "documents" && tabParam && tabParam !== "building" && tabParam !== "tenant" ? tabParam : tabParam === "tenant" ? tabSubParam : undefined
          patch = { adminDocuments: await getAdminDocuments({ buildingId, tenantId }) }
        }
        else if (tabKey === "requests" || tabKey === "request") patch = { adminRequests: await getAdminRequests({ buildingId: tabKey === "requests" ? tabParam : undefined }) }
        else if (tabKey === "payments" && canReviewPayments) patch = { adminPayments: await getAdminPaymentReports({ buildingId: tabParam }) }
        else if (tabKey === "buildings" || tabKey === "building") patch = { adminBuildings: await getAdminBuildings() }
      }

      if (Object.keys(patch).length > 0) {
        setData((current) => {
          const nextData = { ...current, ...patch }
          void writeCache<CachedDashboard>(DASHBOARD_CACHE_KEY, { bootstrap, data: nextData })
          return nextData
        })
      }
    } catch (e) {
      setTabErrors((current) => ({
        ...current,
        [tabKey]: e instanceof Error ? e.message : "Не удалось загрузить раздел",
      }))
    } finally {
      setLoadingTabs((current) => ({ ...current, [tabKey]: false }))
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
      await loadTabData(activeTab, { force: true })
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
    setLoadingTabs({})
    setTabErrors({})
    await clearMobileCache()
  }

  useEffect(() => {
    boot()
  }, [])

  useEffect(() => {
    if (!bootstrap) return
    loadTabData(activeTab).catch(() => null)
  }, [bootstrap?.user.id, activeTab])

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type
      if (typeof type !== "string") return
      const link = response.notification.request.content.data?.link
      const tab = tabForNotification({
        id: "",
        type,
        title: "",
        message: "",
        link: typeof link === "string" ? link : null,
        isRead: false,
        createdAt: "",
      })
      setActiveTab(tab ?? "home")
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
      loadingTabs={loadingTabs}
      tabErrors={tabErrors}
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
  loadingTabs,
  tabErrors,
  refreshing,
  onRefresh,
  onLogout,
}: {
  bootstrap: MobileBootstrap
  data: AppData
  activeTab: string
  setActiveTab: (tab: string) => void
  cacheState: CacheState
  loadingTabs: Record<string, boolean>
  tabErrors: Record<string, string | null>
  refreshing: boolean
  onRefresh: () => void
  onLogout: () => void
}) {
  const role = bootstrap.user.role ?? ""
  const tabs = tabsForRole(role)
  const { width } = useWindowDimensions()
  const safeTab = activeTab || tabs[0]?.key || "home"
  const navigate = (tab: string) => setActiveTab(tab)
  const backTarget = backTargetForTab(safeTab)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 108, gap: 14, maxWidth: width >= 900 ? 860 : undefined, alignSelf: width >= 900 ? "center" : "stretch" }}
      >
        {backTarget ? <BackButton onPress={() => navigate(backTarget)} /> : null}
        <HeaderCard bootstrap={bootstrap} onLogout={onLogout} />
        {cacheState.fromCache ? <OfflineBanner savedAt={cacheState.savedAt} error={cacheState.error} /> : null}
        <TabContent role={role} tab={safeTab} bootstrap={bootstrap} data={data} loadingTabs={loadingTabs} tabErrors={tabErrors} onChanged={onRefresh} onNavigate={navigate} />
      </ScrollView>
      <BottomTabs tabs={tabs} activeTab={safeTab} onChange={navigate} />
    </View>
  )
}

function TabContent({
  role,
  tab,
  bootstrap,
  data,
  loadingTabs,
  tabErrors,
  onChanged,
  onNavigate,
}: {
  role: string
  tab: string
  bootstrap: MobileBootstrap
  data: AppData
  loadingTabs: Record<string, boolean>
  tabErrors: Record<string, string | null>
  onChanged: () => void
  onNavigate: (tab: string) => void
}) {
  const [tabKey, tabParam, tabSubParam] = tab.split(":")
  const tabError = tabErrors[tabKey]

  if (tabKey === "notifications") {
    return data.notifications && data.notificationSettings
      ? <NotificationsScreen payload={data.notifications} settings={data.notificationSettings} notices={data.notices} onChanged={onChanged} onNavigate={onNavigate} />
      : <CenteredLoader />
  }

  if (role === "TENANT") {
    if (!data.tenantOverview) return <CenteredLoader />
    if (tabKey === "payments") return data.tenantFinances ? <TenantPayments finances={data.tenantFinances} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    if (tabKey === "requests") return data.tenantRequests ? <TenantRequests requests={data.tenantRequests} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    if (tabKey === "meters") return data.tenantMeters ? <TenantMeters meters={data.tenantMeters} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    if (tabKey === "documents") return data.tenantDocuments ? <TenantDocuments documents={data.tenantDocuments} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    if (tabKey === "settings") return <More title="Настройки" bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} settingsOnly />
    if (tabKey === "more") return <More bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} />
    return <TenantHome overview={data.tenantOverview} notices={data.notices} onNavigate={onNavigate} />
  }

  if (role === "OWNER" && tabKey === "owner") {
    return data.ownerOverview ? <OwnerOverview data={data.ownerOverview} onNavigate={onNavigate} /> : <CenteredLoader />
  }
  if (tabKey === "building") {
    const building = data.adminBuildings?.data.find((item) => item.id === tabParam)
    if (!data.adminBuildings) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return building ? <AdminBuildingDetail building={building} onNavigate={onNavigate} /> : <EmptyState title="Объект не найден в загруженном списке" />
  }
  if (tabKey === "tenant") {
    const detail = tabParam ? data.adminTenantDetails[tabParam] : null
    const tenant = detail?.tenant ?? data.adminTenants?.data.find((item) => item.id === tabParam)
    if (!tenant) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return <AdminTenantDetail tenant={tenant} detail={detail ?? null} onNavigate={onNavigate} />
  }
  if (tabKey === "tenants") return data.adminTenants ? <AdminTenants payload={data.adminTenants} buildingId={tabParam} onNavigate={onNavigate} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "document") {
    if (!data.adminDocuments) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return <AdminDocumentDetail payload={data.adminDocuments} kind={tabParam} id={tabSubParam} onNavigate={onNavigate} />
  }
  if (tabKey === "contract") {
    if (!data.adminDocuments) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return <AdminDocumentDetail payload={data.adminDocuments} kind="contract" id={tabParam} onNavigate={onNavigate} />
  }
  if (tabKey === "documents") {
    const tenantId = tabParam === "tenant" ? tabSubParam : tabParam && tabParam !== "building" ? tabParam : undefined
    const buildingId = tabParam === "building" ? tabSubParam : undefined
    return data.adminDocuments ? <AdminDocuments payload={data.adminDocuments} tenantId={tenantId} buildingId={buildingId} onNavigate={onNavigate} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  }
  if (tabKey === "request") {
    const request = data.adminRequests?.data.find((item) => item.id === tabParam)
    if (!data.adminRequests) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return request ? <AdminRequestDetail request={request} onChanged={onChanged} onNavigate={onNavigate} /> : <EmptyState title="Заявка не найдена в загруженном списке" />
  }
  if (tabKey === "requests") return data.adminRequests ? <AdminRequests payload={data.adminRequests} buildingId={tabParam} onChanged={onChanged} onNavigate={onNavigate} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "payments") {
    if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) return <NoAccess title="Оплаты доступны владельцу, админу и бухгалтеру" />
    return data.adminPayments ? <AdminPayments payload={data.adminPayments} buildingId={tabParam} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  }
  if (tabKey === "buildings") return data.adminBuildings ? <AdminBuildings payload={data.adminBuildings} onNavigate={onNavigate} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "settings") return <More title="Настройки" bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} settingsOnly />
  if (tabKey === "more") return <More bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} />
  return data.adminToday ? <AdminToday payload={data.adminToday} notices={data.notices} bootstrap={bootstrap} onChanged={onChanged} onNavigate={onNavigate} /> : <CenteredLoader />
}

function TenantHome({ overview, notices, onNavigate }: { overview: TenantOverview; notices: BuildingNotice[]; onNavigate: (tab: string) => void }) {
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
        <ActionRow icon="creditcard.fill" title="К оплате" value={formatMoney(overview.finances.totalDebt)} color={overview.finances.totalDebt > 0 ? colors.red : colors.green} onPress={() => onNavigate("payments")} />
        <ActionRow icon="signature" title="На подпись" value={`${overview.counters.pendingDocuments}`} color={colors.blue} onPress={() => onNavigate("documents")} />
        <ActionRow icon="gauge.with.dots.needle.50percent" title="Счетчики" value={`${overview.counters.meters}`} color={colors.teal} onPress={() => onNavigate("meters")} />
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
  const pendingRequests = documents.signatureRequests.filter((item) => ["PENDING", "VIEWED"].includes(item.status))
  const pendingContracts = documents.contractLinks.filter((item) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(item.status))
  const pending = pendingRequests.length + pendingContracts.length

  return (
    <>
      <SectionTitle title="Документы" />
      <Card>
        <ActionRow icon="signature" title="Ожидают подписи" value={String(pending)} color={pending > 0 ? colors.orange : colors.green} />
        {pendingRequests.map((request) => <SignatureRequestCard key={request.id} request={request} />)}
        {documents.contractLinks.map((contract) => <ContractSignPrompt key={contract.id} contract={contract} />)}
        {pending === 0 ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Документов на подпись нет</Text> : null}
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

function OpenAuthorizedFileButton({ title, url }: { title: string; url?: string | null }) {
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

function SignatureRequestCard({ request }: { request: TenantSignatureRequest }) {
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
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <SecondaryButton title="Подписать SMS" icon="message.fill" onPress={() => startDraft("SMS_OTP_DRAFT")} />
        <SecondaryButton title="ЭЦП draft" icon="checkmark.seal.fill" onPress={() => startDraft("NCA_LAYER_DRAFT")} />
      </View>
      {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
    </View>
  )
}

function ContractSignPrompt({ contract }: { contract: MobileContractSummary | TenantDocumentsPayload["contractLinks"][number] }) {
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

function AdminTenants({ payload, buildingId, onNavigate }: { payload: AdminTenantsPayload; buildingId?: string; onNavigate: (tab: string) => void }) {
  const [query, setQuery] = useState("")
  const [localPayload, setLocalPayload] = useState(payload)
  const [busy, setBusy] = useState(false)
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

    const timer = setTimeout(() => {
      fetchPage({ reset: true }).catch(() => null)
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

  return (
    <>
      <SectionTitle title={buildingId ? "Арендаторы объекта" : "Арендаторы"} />
      <Card>
        <MetricGrid
          items={[
            { label: "Найдено", value: String(localPayload.counters.total), color: colors.blue },
            { label: "Загружено", value: String(localPayload.data.length), color: colors.teal },
            { label: "С долгом", value: String(localPayload.counters.withDebt), color: localPayload.counters.withDebt > 0 ? colors.red : colors.green },
            { label: "Долг", value: formatMoney(localPayload.counters.debtAmount), color: localPayload.counters.debtAmount > 0 ? colors.orange : colors.green },
          ]}
        />
        <SearchField value={query} onChangeText={setQuery} placeholder="Название, БИН, кабинет" />
        {message ? <InlineMessage message={message} tone="error" /> : null}
      </Card>
      {localPayload.data.length === 0 && !busy ? <EmptyState title="Арендаторы не найдены" /> : null}
      {localPayload.data.map((tenant) => (
        <Pressable key={tenant.id} onPress={() => onNavigate(`tenant:${tenant.id}`)}>
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
      ))}
      {localPayload.pageInfo?.hasMore ? (
        <PrimaryButton title={busy ? "Загружаем..." : "Загрузить еще"} disabled={busy} onPress={() => fetchPage({ reset: false })} />
      ) : null}
    </>
  )
}

function AdminTenantDetail({ tenant, detail, onNavigate }: { tenant: AdminTenantListItem; detail?: AdminTenantDetailPayload | null; onNavigate: (tab: string) => void }) {
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
          items={[
            { label: "Занимает", value: formatArea(tenant.area), color: colors.slate },
            { label: "Аренда", value: formatMoney(tenant.monthlyRent), color: colors.blue },
            { label: "К оплате до", value: `${tenant.paymentDueDay} числа`, color: colors.teal },
            { label: "Долг", value: formatMoney(tenant.totalDebt), color: tenant.totalDebt > 0 ? colors.red : colors.green },
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

function AdminDocuments({ payload, tenantId, buildingId, onNavigate }: { payload: AdminDocumentsPayload; tenantId?: string; buildingId?: string; onNavigate: (tab: string) => void }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("ALL")
  const [stage, setStage] = useState("ALL")
  const [localPayload, setLocalPayload] = useState(payload)
  const [busy, setBusy] = useState(false)
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

    const timer = setTimeout(() => {
      fetchPage({ reset: true }).catch(() => null)
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
        if (stage === "SIGN") return isPendingContractStatus(contract.status)
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

  return (
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
        <SearchField value={query} onChangeText={setQuery} placeholder="Арендатор, номер, период" />
        {message ? <InlineMessage message={message} tone="error" /> : null}
      </Card>
      {signatureRequests.length > 0 || signatureContracts.length > 0 ? (
        <>
          <SectionTitle title="На подпись" />
          <Card>
            {signatureRequests.map((request) => <SignatureRequestCard key={request.id} request={request} />)}
            {signatureContracts.slice(0, 6).map((contract) => <ContractSignPrompt key={contract.id} contract={contract} />)}
          </Card>
        </>
      ) : null}
      {visibleCount + signatureCount === 0 && !busy ? <EmptyState title="Документы не найдены" /> : null}
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
      {localPayload.pageInfo?.hasMore ? (
        <PrimaryButton title={busy ? "Загружаем..." : "Загрузить еще"} disabled={busy} onPress={() => fetchPage({ reset: false })} />
      ) : null}
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
  return onNavigate ? <Pressable onPress={() => onNavigate(`contract:${contract.id}`)}>{content}</Pressable> : content
}

function GeneratedDocumentList({ documents, onNavigate }: { documents: MobileGeneratedDocumentSummary[]; onNavigate?: (tab: string) => void }) {
  return (
    <>
      {documents.map((document) => (
        <Pressable key={document.id} onPress={() => onNavigate ? onNavigate(`document:generated:${document.id}`) : null}>
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
      ))}
    </>
  )
}

function AdminDocumentDetail({
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
          <ActionRow icon="signature" title="Подписание" value="SMS/ЭЦП draft" color={colors.orange} onPress={() => onNavigate("documents")} />
        </Card>
      </>
    )
  }

  return <EmptyState title="Документ не найден в загруженном списке" />
}

function AdminToday({ payload, notices, bootstrap, onChanged, onNavigate }: { payload: AdminTodayPayload; notices: BuildingNotice[]; bootstrap: MobileBootstrap; onChanged: () => void; onNavigate: (tab: string) => void }) {
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
      <Card>
        <ActionRow icon="building.2.fill" title="Объекты" value={String(payload.buildings.length)} color={colors.blue} onPress={() => onNavigate("buildings")} />
        <ActionRow icon="person.2.fill" title="Арендаторы" value="список" color={colors.teal} onPress={() => onNavigate("tenants")} />
        <ActionRow icon="doc.on.doc.fill" title="Документы" value={String(payload.counters.pendingSignatures)} color={colors.orange} onPress={() => onNavigate("documents")} />
        <ActionRow icon="creditcard.fill" title="Оплаты" value={String(payload.counters.pendingPayments)} color={colors.green} onPress={() => onNavigate("payments")} />
      </Card>
      <StaffQuickSearch onNavigate={onNavigate} />
      {canNotice ? <NoticeComposer buildings={payload.buildings} onChanged={onChanged} /> : null}
      <SectionTitle title="Последние заявки" />
      <RequestList requests={payload.recent.requests} onNavigate={onNavigate} />
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
          <ActionRow key={tenant.id} icon="person.2.fill" title={tenant.companyName} value={formatMoney(tenant.totalDebt)} color={tenant.totalDebt > 0 ? colors.orange : colors.teal} onPress={() => onNavigate("tenants")} />
        ))}
        {contracts.slice(0, 2).map((contract) => (
          <ActionRow key={contract.id} icon="doc.on.doc.fill" title={`${contractTypeLabel(contract.type)} № ${contract.number}`} value={contractStatusLabel(contract.status)} color={contractStatusColor(contract.status)} onPress={() => onNavigate("documents")} />
        ))}
        {documents.slice(0, 2).map((document) => (
          <ActionRow key={document.id} icon="doc.text.fill" title={document.fileName} value={documentTypeLabel(document.documentType)} color={colors.blue} onPress={() => onNavigate("documents")} />
        ))}
        {query.trim().length >= 2 && !busy && !hasResults ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Ничего не найдено</Text> : null}
      </Card>
    </>
  )
}

function AdminRequests({ payload, buildingId, onChanged, onNavigate }: { payload: AdminRequestsPayload; buildingId?: string; onChanged: () => void; onNavigate: (tab: string) => void }) {
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

  return (
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
      {visibleRequests.map((request) => (
        <Pressable key={request.id} onPress={() => onNavigate(`request:${request.id}`)}>
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
      ))}
      {visibleRequests.length === 0 && !busy ? <EmptyState title="Заявки не найдены" /> : null}
    </>
  )
}

function AdminRequestDetail({
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

function AdminPayments({ payload, buildingId, onChanged }: { payload: AdminPaymentReportsPayload; buildingId?: string; onChanged: () => void }) {
  const [mode, setMode] = useState("ALL")
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
            <SecondaryButton title="Подтвердить" icon="checkmark.circle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "confirm", method: report.method }); onChanged() }} />
            <SecondaryButton title="Уточнить" icon="exclamationmark.triangle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "dispute", reason: "Уточнить оплату" }); onChanged() }} />
            <SecondaryButton title="Отклонить" icon="xmark.circle.fill" onPress={async () => { await reviewAdminPaymentReport({ reportId: report.id, action: "reject", reason: "Не найдено поступление" }); onChanged() }} />
          </View>
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

function AdminBuildings({ payload, onNavigate }: { payload: AdminBuildingsPayload; onNavigate: (tab: string) => void }) {
  return (
    <>
      <SectionTitle title="Объекты" />
      {payload.data.map((building) => (
        <Pressable key={building.id} onPress={() => onNavigate(`building:${building.id}`)}>
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

function AdminBuildingDetail({
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
        <Pressable key={tenant.id} onPress={() => onNavigate(`tenant:${tenant.id}`)}>
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

function OwnerOverview({ data, onNavigate }: { data: OwnerOverviewPayload; onNavigate: (tab: string) => void }) {
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
      <SectionTitle title="Здания" />
      {data.buildings.map((building) => (
        <Pressable key={building.id} onPress={() => onNavigate(`building:${building.id}`)}>
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

function NotificationsScreen({
  payload,
  settings,
  notices,
  onChanged,
  onNavigate,
}: {
  payload: MobileNotificationsPayload
  settings: MobileNotificationSettingsPayload
  notices: BuildingNotice[]
  onChanged: () => void
  onNavigate: (tab: string) => void
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
    const tab = tabForNotification(notification)
    if (tab) onNavigate(tab)
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
          <AppIcon name={notification.isRead ? "bell" : "bell.badge.fill"} size={21} color={notification.isRead ? colors.muted : colors.orange} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{notification.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{label} · {formatDateTime(notification.createdAt)}</Text>
          </View>
          {!notification.isRead ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange }} /> : null}
        </View>
        <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular }}>{notification.message}</Text>
      </Card>
    </Pressable>
  )
}

function More({
  bootstrap,
  buildings,
  settings,
  onChanged,
  onNavigate,
  title = "Еще",
  settingsOnly = false,
}: {
  bootstrap: MobileBootstrap
  buildings: MobileBootstrap["buildings"]
  settings: MobileNotificationSettingsPayload | null
  onChanged: () => void
  onNavigate: (tab: string) => void
  title?: string
  settingsOnly?: boolean
}) {
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
      <SectionTitle title={title} />
      <Card>
        <Text selectable style={{ color: colors.text, fontSize: 19, fontFamily: fonts.black, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 14, fontFamily: fonts.regular }}>{bootstrap.organization.name} · {bootstrap.user.role}</Text>
        {!settingsOnly ? (
          <View style={{ gap: 8 }}>
            <SecondaryButton title="Настройки" icon="settings" onPress={() => onNavigate("settings")} />
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Сегодня" icon="list.bullet.rectangle.fill" onPress={() => onNavigate("home")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Арендаторы" icon="person.2.fill" onPress={() => onNavigate("tenants")} /> : null}
            <SecondaryButton title="Документы" icon="doc.text.fill" onPress={() => onNavigate("documents")} />
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Заявки" icon="tray.full.fill" onPress={() => onNavigate("requests")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Оплаты" icon="creditcard.fill" onPress={() => onNavigate("payments")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Объекты" icon="building.2.fill" onPress={() => onNavigate("buildings")} /> : null}
          </View>
        ) : null}
      </Card>
      {settingsOnly ? (
        <>
          <SectionTitle title="Push" />
          <Card>
            <ActionRow icon="iphone" title="Активные устройства" value={String(localSettings?.devices.length ?? 0)} color={colors.blue} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <SecondaryButton title={pushBusy ? "Подключаем..." : "Включить"} icon="bell.fill" onPress={enablePush} />
              <SecondaryButton title="Отключить" icon="bell.slash.fill" onPress={disablePush} />
            </View>
            {pushState ? <InlineMessage message={pushState} tone={pushState.includes("Не ") ? "error" : "success"} /> : null}
            {pushPreferences ? (
              <>
                <ToggleRow
                  title="Тихие часы"
                  subtitle={`${pushPreferences.quietFrom} - ${pushPreferences.quietTo}`}
                  value={pushPreferences.quietHoursEnabled}
                  onValueChange={(value) => updateQuietHours({ ...pushPreferences, quietHoursEnabled: value })}
                />
                <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.extraBold, fontWeight: "800" }}>Начало</Text>
                <ChoiceRow options={[["21:00", "21:00"], ["22:00", "22:00"], ["23:00", "23:00"]]} value={pushPreferences.quietFrom} onChange={(quietFrom) => updateQuietHours({ ...pushPreferences, quietFrom })} />
                <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.extraBold, fontWeight: "800" }}>Окончание</Text>
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
            {sessions.length === 0 && !sessionsBusy ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Активных мобильных входов нет</Text> : null}
          </Card>
        </>
      ) : null}
      {!settingsOnly ? (
        <>
          <SectionTitle title="Объекты" />
          <Card>
            {buildings.map((building) => (
              bootstrap.user.role === "TENANT"
                ? <CompactRow key={building.id} title={building.name} subtitle={building.address} tone={colors.blue} />
                : <ActionRow key={building.id} icon="building.2.fill" title={building.name} value="открыть" color={colors.blue} onPress={() => onNavigate(`building:${building.id}`)} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  )
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignSelf: "flex-start", minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: "#ffffff", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <AppIcon name="chevron.left" size={18} color={colors.blue} />
      <Text style={{ color: colors.blue, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>Назад</Text>
    </Pressable>
  )
}

function HeaderCard({ bootstrap, onLogout }: { bootstrap: MobileBootstrap; onLogout: () => void }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconBox icon="building.2.fill" color={bootstrap.user.role === "TENANT" ? colors.teal : colors.blue} />
        <View style={{ flex: 1 }}>
          <Text selectable style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{bootstrap.organization.name}</Text>
          <Text selectable style={{ color: colors.text, fontSize: 23, fontFamily: fonts.black, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
        </View>
        <Pressable onPress={onLogout} style={{ padding: 8 }}>
          <AppIcon name="rectangle.portrait.and.arrow.right" size={23} color={colors.muted} />
        </Pressable>
      </View>
    </Card>
  )
}

function RequestList({ requests, onNavigate }: { requests: Array<{ id: string; title: string; description: string; status: string; priority: string; createdAt: string; tenant?: { companyName: string } }>; onNavigate?: (tab: string) => void }) {
  if (requests.length === 0) return <EmptyState title="Заявок пока нет" />
  return (
    <>
      {requests.map((request) => (
        <Pressable key={request.id} onPress={() => onNavigate ? onNavigate(`request:${request.id}`) : null}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text selectable style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" }}>{request.title}</Text>
              <StatusPill label={requestStatusLabel(request.status)} color={requestStatusColor(request.status)} />
            </View>
            <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{request.tenant?.companyName ? `${request.tenant.companyName} · ` : ""}{requestPriorityLabel(request.priority)} · {formatDate(request.createdAt)}</Text>
            <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
          </Card>
        </Pressable>
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
            <AppIcon name="bell.fill" size={21} color={notice.severity === "CRITICAL" ? colors.red : notice.severity === "WARNING" ? colors.orange : colors.blue} />
            <Text selectable style={{ flex: 1, color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{notice.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.regular }}>{formatDate(notice.createdAt)}</Text>
          </View>
          <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular }}>{notice.message}</Text>
        </Card>
      ))}
    </>
  )
}

function BottomTabs({ tabs, activeTab, onChange }: { tabs: Array<{ key: string; label: string; icon: string }>; activeTab: string; onChange: (tab: string) => void }) {
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "#ffffff", flexDirection: "row", padding: 8, gap: 4 }}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab || activeTab.startsWith(`${tab.key}:`)
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={{ flex: 1, minHeight: 54, borderRadius: 8, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: active ? "#eff6ff" : "transparent" }}>
            <AppIcon name={tab.icon} size={22} color={active ? colors.blue : colors.muted} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? colors.blue : colors.muted, fontSize: 12, fontFamily: active ? fonts.black : fonts.bold, fontWeight: active ? "900" : "700" }}>{tab.label}</Text>
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

function Card({ children }: { children: ReactNode }) {
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
      <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.extraBold, fontWeight: "800" }}>{label}</Text>
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
          fontSize: 16,
          fontFamily: fonts.regular,
          textAlignVertical: props.multiline ? "top" : "center",
        }, props.style]}
      />
    </View>
  )
}

function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 46, backgroundColor: "#ffffff" }}>
      <AppIcon name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={{ flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.regular }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} style={{ padding: 4 }}>
          <AppIcon name="xmark" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
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
      <AppIcon name="lock.fill" size={17} color={colors.blue} />
      <Text numberOfLines={2} style={{ color: colors.blue, fontSize: 15, fontFamily: fonts.black, fontWeight: "900", textAlign: "center" }}>{title}</Text>
    </Pressable>
  )
}

function PrimaryButton({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={{ minHeight: 48, borderRadius: 8, backgroundColor: colors.slate, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ color: "#ffffff", fontSize: 16, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
    </Pressable>
  )
}

function SecondaryButton({ title, icon, onPress }: { title: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#ffffff" }}>
      <AppIcon name={icon} size={16} color={colors.blue} />
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontFamily: fonts.extraBold, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  )
}

function ChoiceRow({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (value: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map(([key, label]) => (
        <Pressable key={key} onPress={() => onChange(key)} style={{ borderRadius: 999, borderWidth: 1, borderColor: value === key ? colors.blue : colors.border, backgroundColor: value === key ? "#eff6ff" : "#ffffff", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ color: value === key ? colors.blue : colors.muted, fontSize: 14, fontFamily: fonts.black, fontWeight: "900" }}>{label}</Text>
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
          <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.medium }}>{item.label}</Text>
          <Text selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: item.color, fontSize: 20, fontFamily: fonts.black, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

function ActionRow({ icon, title, value, color, onPress }: { icon: string; title: string; value: string; color: string; onPress?: () => void }) {
  const content = (
    <>
      <IconBox icon={icon} color={color} />
      <Text selectable style={{ flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
      <Text selectable style={{ color, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{value}</Text>
      {onPress ? <AppIcon name="chevron.right" size={18} color={colors.muted} /> : null}
    </>
  )
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12 }}>
        {content}
      </Pressable>
    )
  }
  return (
    <View style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12 }}>
      {content}
    </View>
  )
}

function CompactRow({ title, subtitle, value, tone }: { title: string; subtitle?: string | null; value?: string; tone: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
      <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Text selectable style={{ color: colors.text, fontSize: 15, fontFamily: fonts.extraBold, fontWeight: "800" }}>{title}</Text>
        {subtitle ? <Text selectable style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text selectable style={{ color: tone, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{value}</Text> : null}
    </View>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderColor: `${color}40`, borderWidth: 1, borderRadius: 999, backgroundColor: `${color}12`, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontFamily: fonts.black, fontWeight: "900" }}>{label}</Text>
    </View>
  )
}

function IconBox({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${color}14` }}>
      <AppIcon name={icon} size={22} color={color} />
    </View>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={{ color: colors.text, fontSize: 20, fontFamily: fonts.black, fontWeight: "900", marginTop: 2 }}>{title}</Text>
}

function EmptyState({ title }: { title: string }) {
  return (
    <Card>
      <Text selectable style={{ color: colors.muted, fontSize: 15, fontFamily: fonts.medium, textAlign: "center" }}>{title}</Text>
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
      <Text selectable style={{ color, fontSize: 14, fontFamily: fonts.bold, fontWeight: "700" }}>{message}</Text>
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

function TabLoading({ error, loading }: { error?: string | null; loading?: boolean }) {
  if (error) {
    return (
      <Card>
        <InlineMessage message={error} tone="error" />
      </Card>
    )
  }
  if (loading === false) return <EmptyState title="Данные раздела пока не загружены" />
  return <SkeletonList />
}

function SkeletonList() {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <Card key={item}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#e2e8f0" }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 16, width: "70%", borderRadius: 8, backgroundColor: "#e2e8f0" }} />
              <View style={{ height: 12, width: "45%", borderRadius: 8, backgroundColor: "#eef2f7" }} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, height: 68, borderRadius: 8, backgroundColor: "#f1f5f9" }} />
            <View style={{ flex: 1, height: 68, borderRadius: 8, backgroundColor: "#f1f5f9" }} />
          </View>
        </Card>
      ))}
    </>
  )
}

function rootTab(tab: string) {
  return tab.split(":")[0] || "home"
}

function backTargetForTab(tab: string) {
  const [tabKey, tabParam, tabSubParam] = tab.split(":")
  if (tabKey === "tenant") return "tenants"
  if (tabKey === "building") return "buildings"
  if ((tabKey === "tenants" || tabKey === "requests" || tabKey === "payments") && tabParam) return `building:${tabParam}`
  if (tabKey === "request") return "requests"
  if (tabKey === "document" || tabKey === "contract") return "documents"
  if (tabKey === "documents" && tabParam === "building" && tabSubParam) return `building:${tabSubParam}`
  if (tabKey === "documents" && tabParam === "tenant" && tabSubParam) return `tenant:${tabSubParam}`
  if (tabKey === "documents" && tabParam) return `tenant:${tabParam}`
  if (tabKey === "settings") return "more"
  return null
}

function hasTabData(data: AppData, role: string, tabKey: string, tabParam?: string) {
  if (role === "TENANT") {
    if (tabKey === "payments") return !!data.tenantFinances
    if (tabKey === "requests") return !!data.tenantRequests
    if (tabKey === "meters") return !!data.tenantMeters
    if (tabKey === "documents") return !!data.tenantDocuments
    return true
  }

  if (tabKey === "tenants") return !!data.adminTenants
  if (tabKey === "tenant") return !!(tabParam && data.adminTenantDetails[tabParam])
  if (tabKey === "documents") return !!data.adminDocuments
  if (tabKey === "document" || tabKey === "contract") return !!data.adminDocuments
  if (tabKey === "requests") return !!data.adminRequests
  if (tabKey === "request") return !!data.adminRequests
  if (tabKey === "payments") return !!data.adminPayments
  if (tabKey === "buildings") return !!data.adminBuildings
  if (tabKey === "building") return !!data.adminBuildings
  return true
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
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
      { key: "owner", label: "Объекты", icon: "chart.line.uptrend.xyaxis" },
      { key: "tenants", label: "Аренд.", icon: "person.2.fill" },
      { key: "documents", label: "Док.", icon: "doc.text.fill" },
      { key: "payments", label: "Оплаты", icon: "creditcard.fill" },
      { key: "notifications", label: "Увед.", icon: "bell.fill" },
      { key: "more", label: "Еще", icon: "ellipsis" },
    ]
  }

  return [
    { key: "home", label: "Сегодня", icon: "list.bullet.rectangle.fill" },
    { key: "tenants", label: "Аренд.", icon: "person.2.fill" },
    { key: "documents", label: "Док.", icon: "doc.text.fill" },
    { key: "requests", label: "Заявки", icon: "tray.full.fill" },
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

function formatArea(value: number) {
  return `${value.toLocaleString("ru-RU")} м²`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

function formatDateFull(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return "размер не указан"
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function legalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    IP: "ИП",
    TOO: "ТОО",
    LLP: "ТОО",
    AO: "АО",
    PERSON: "Физ. лицо",
  }
  return labels[type] ?? type
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

function categoryTitle(category: string) {
  const labels: Record<string, string> = {
    ALL: "Файлы",
    CONTRACT: "Договоры",
    ACT: "АВР",
    INVOICE: "Счета на оплату",
    RECONCILIATION: "Акты сверки",
  }
  return labels[category] ?? "Файлы"
}

function isPendingSignatureStatus(status: string) {
  return ["PENDING", "VIEWED"].includes(status)
}

function signatureStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Ожидает",
    VIEWED: "Просмотрен",
    SIGNED: "Подписан",
    REJECTED: "Отклонен",
  }
  return labels[status] ?? status
}

function isPendingContractStatus(status: string) {
  return ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(status)
}

function contractTypeLabel(type: string) {
  const labels: Record<string, string> = {
    STANDARD: "Договор",
    ADDENDUM: "Доп. соглашение",
    TERMINATION: "Расторжение",
  }
  return labels[type] ?? documentTypeLabel(type)
}

function contractStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Черновик",
    SENT: "Отправлен",
    VIEWED: "Просмотрен",
    SIGNED_BY_TENANT: "Арендатор",
    SIGNED: "Подписан",
    REJECTED: "Отклонен",
    EXPIRED: "Истек",
  }
  return labels[status] ?? status
}

function contractStatusColor(status: string) {
  if (["SIGNED"].includes(status)) return colors.green
  if (["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(status)) return colors.orange
  if (["REJECTED", "EXPIRED"].includes(status)) return colors.red
  return colors.blue
}

function exactRequestStatus(filter: string) {
  if (["NEW", "IN_PROGRESS", "DONE", "CLOSED", "POSTPONED", "CANCELLED"].includes(filter)) return filter
  return undefined
}

function exactRequestPriority(filter: string) {
  if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(filter)) return filter
  return undefined
}

function matchesRequestStatus(status: string, filter: string) {
  if (filter === "ALL") return true
  if (filter === "ACTIVE") return !["DONE", "CLOSED", "CANCELLED"].includes(status)
  if (filter === "DONE") return ["DONE", "CLOSED"].includes(status)
  return status === filter
}

function matchesRequestPriority(priority: string, filter: string) {
  if (filter === "ALL") return true
  if (filter === "URGENT") return ["HIGH", "URGENT"].includes(priority)
  return priority === filter
}

function requestStatusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW: "Новая",
    OPEN: "Открыта",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
    CLOSED: "Закрыта",
    POSTPONED: "Отложена",
    CANCELLED: "Отменена",
  }
  return labels[status] ?? status
}

function requestStatusColor(status: string) {
  if (["DONE", "CLOSED"].includes(status)) return colors.green
  if (status === "IN_PROGRESS") return colors.blue
  if (status === "CANCELLED") return colors.red
  return colors.orange
}

function requestPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Низкий",
    NORMAL: "Обычный",
    HIGH: "Высокий",
    URGENT: "Срочно",
  }
  return labels[priority] ?? priority
}

function requestPriorityColor(priority: string) {
  if (priority === "URGENT" || priority === "HIGH") return colors.red
  if (priority === "LOW") return colors.teal
  return colors.blue
}

function requestLocation(request: AdminRequestsPayload["data"][number]) {
  const firstExtraSpace = request.tenant.tenantSpaces?.[0]?.space
  const space = request.tenant.space ?? firstExtraSpace
  if (!space) return "Помещение не указано"
  return `${space.floor.building.name}, ${space.floor.name}, каб. ${space.number}`
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "На проверке",
    DISPUTED: "Требует уточнения",
    REJECTED: "Отклонено",
    CONFIRMED: "Подтверждено",
  }
  return labels[status] ?? status
}

function paymentStatusColor(status: string) {
  if (status === "CONFIRMED") return colors.green
  if (status === "DISPUTED") return colors.orange
  if (status === "REJECTED") return colors.red
  return colors.blue
}

function tabForNotification(notification: MobileNotification) {
  const target = `${notification.type} ${notification.link ?? ""}`.toUpperCase()
  if (target.includes("PAYMENT") || target.includes("PAYMENT-REPORT") || target.includes("FINANCE")) return "payments"
  if (target.includes("REQUEST")) return "requests"
  if (target.includes("CONTRACT") || target.includes("DOCUMENT") || target.includes("SIGN")) return "documents"
  if (target.includes("BUILDING") || target.includes("NOTICE")) return "home"
  return null
}

function openExternalUrl(url: string) {
  const fullUrl = url.startsWith("http") ? url : `https://commrent.kz${url.startsWith("/") ? "" : "/"}${url}`
  return Linking.openURL(fullUrl)
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}
