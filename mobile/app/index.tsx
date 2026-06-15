import * as Notifications from "expo-notifications"
import * as Network from "expo-network"
import { useEffect, useRef, useState } from "react"
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { colors, tabForNotification } from "@/app/utils/colors"
import {
  type AppData,
  type CachedDashboard,
  type CacheState,
  emptyData,
  DASHBOARD_CACHE_KEY,
  rootTab,
  isReachableTab,
  backTargetForTab,
  hasTabData,
  tabsForRole,
} from "@/app/utils/types"
import {
  BackButton,
  BottomTabs,
  CenteredLoader,
  EmptyState,
  HeaderCard,
  NoAccess,
  OfflineBanner,
  TabLoading,
} from "@/app/components/ui"
import type { ReactNode } from "react"
import { LoginScreen } from "@/app/screens/login"
import {
  TenantDocuments,
  TenantHome,
  TenantMessages,
  TenantMeters,
  TenantPayments,
  TenantRequests,
} from "@/app/screens/tenant"
import { More } from "@/app/screens/more"
import { NotificationsScreen } from "@/app/screens/notifications"
import {
  AdminBuildingDetail,
  AdminBuildings,
  AdminDocumentDetail,
  AdminDocuments,
  AdminExpenses,
  AdminMessages,
  AdminMeters,
  AdminPayments,
  AdminRequestDetail,
  AdminRequests,
  AdminTasks,
  AdminTenantDetail,
  AdminTenants,
  AdminToday,
  OwnerOverview,
} from "@/app/screens/admin"
import {
  getAdminBuildings,
  getAdminDocuments,
  getAdminExpenses,
  getAdminMessages,
  getAdminMeters,
  getAdminPaymentReports,
  getAdminRequests,
  getAdminTasks,
  getAdminTenantDetail,
  getAdminTenants,
  getAdminToday,
  getBuildingNotices,
  getDeviceAuthAvailability,
  getMobileBootstrap,
  getMobileNotificationSettings,
  getMobileNotifications,
  getOwnerOverview,
  getTenantDocuments,
  getTenantFinances,
  getTenantMeters,
  getTenantMessages,
  getTenantOverview,
  getTenantRequests,
  hasStoredSession,
  logoutMobile,
  registerPushDevice,
  unregisterPushDevice,
  unlockStoredSessionWithDeviceAuth,
} from "@/lib/api"
import { clearMobileCache, readCache, writeCache } from "@/lib/cache"
import { getLocalPushPreferences, isQuietHoursNow } from "@/lib/preferences"
import { setMobileSentryUser } from "@/lib/sentry"
import type { MobileBootstrap } from "@/types/mobile"

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
        tenantMessages,
        adminToday,
        ownerOverview,
        notifications,
        notificationSettings,
      ] = await Promise.all([
        getBuildingNotices(),
        isTenant ? getTenantOverview() : Promise.resolve(null),
        // Прелоад unread-счётчика сообщений арендатора, чтобы badge на табе
        // показывался сразу при старте, а не после первого захода в раздел.
        isTenant ? getTenantMessages().catch(() => null) : Promise.resolve(null),
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
        tenantMessages,
        adminToday,
        adminRequests: null,
        adminPayments: null,
        adminBuildings: null,
        adminTenants: null,
        adminTenantDetails: {},
        adminDocuments: null,
        adminTasks: null,
        adminMessages: null,
        adminMeters: null,
        adminExpenses: null,
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
      if (!isReachableTab(tabs, activeTab)) setActiveTab(tabs[0]?.key ?? "home")
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
          if (!isReachableTab(tabs, activeTab)) setActiveTab(tabs[0]?.key ?? "home")
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
        else if (tabKey === "messages") patch = { tenantMessages: await getTenantMessages() }
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
        else if (tabKey === "expenses" && canReviewPayments) patch = { adminExpenses: await getAdminExpenses() }
        else if (tabKey === "tasks") patch = { adminTasks: await getAdminTasks({ buildingId: tabParam }) }
        else if (tabKey === "chat") patch = { adminMessages: await getAdminMessages() }
        else if (tabKey === "meters") patch = { adminMeters: await getAdminMeters({ buildingId: tabParam }) }
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

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  async function onLoggedIn() {
    setAuthError(null)
    try {
      await load()
      setHasSavedSession(true)
      const availability = await getDeviceAuthAvailability()
      setCanUseDeviceAuth(availability.available)
      setDeviceAuthLabel(availability.label)
      // Регистрируем устройство для push (молча: нет физ.устройства/прав — не критично).
      await registerPushDevice().catch(() => null)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Не удалось загрузить кабинет")
    }
  }

  async function onLogout() {
    // Отзываем push-токен ДО выхода (нужна авторизация), иначе чужие пуши на старом устройстве.
    await unregisterPushDevice().catch(() => null)
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
    if (!bootstrap) return
    let prevConnected = true
    const interval = setInterval(async () => {
      try {
        const state = await Network.getNetworkStateAsync()
        const isConnected = state.isConnected ?? true
        if (!prevConnected && isConnected) {
          refreshRef.current().catch(() => null)
        }
        prevConnected = isConnected
      } catch {
        // ignore
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [bootstrap?.user.id])

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
  const [tabsHeight, setTabsHeight] = useState(80)

  const unreadNotifications = data.notifications?.unreadCount ?? 0
  const unreadMessages = data.tenantMessages?.unread ?? 0
  const tabsWithBadge = tabs.map((tab) => {
    if (tab.key === "notifications" && unreadNotifications > 0) {
      return { ...tab, badge: unreadNotifications }
    }
    if (tab.key === "messages" && unreadMessages > 0) {
      return { ...tab, badge: unreadMessages }
    }
    return tab
  })

  const [tabKey] = safeTab.split(":")
  const VIRTUALIZED_TABS = new Set(["tenants", "documents", "requests"])
  // Only virtualize when payload data is loaded — otherwise we want the legacy
  // ScrollView so TabLoading/CenteredLoader and pageHeader render correctly.
  const dataReadyForVirtualization =
    (tabKey === "tenants" && !!data.adminTenants) ||
    (tabKey === "documents" && !!data.adminDocuments) ||
    (tabKey === "requests" && !!data.adminRequests)
  const isVirtualized = VIRTUALIZED_TABS.has(tabKey) && dataReadyForVirtualization

  const pageHeader: ReactNode = (
    <>
      {backTarget ? <BackButton onPress={() => navigate(backTarget)} /> : null}
      <HeaderCard bootstrap={bootstrap} onLogout={onLogout} />
      {cacheState.fromCache ? <OfflineBanner savedAt={cacheState.savedAt} error={cacheState.error} /> : null}
    </>
  )

  const containerMaxWidth = width >= 900 ? 860 : undefined
  const containerAlignSelf: "center" | "stretch" = width >= 900 ? "center" : "stretch"

  const virtualization: VirtualizationProps = {
    pageHeader,
    refreshing,
    onRefresh,
    bottomPadding: tabsHeight + 16,
    maxWidth: containerMaxWidth,
    alignSelf: containerAlignSelf,
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      {isVirtualized ? (
        <TabContent
          role={role}
          tab={safeTab}
          bootstrap={bootstrap}
          data={data}
          loadingTabs={loadingTabs}
          tabErrors={tabErrors}
          onChanged={onRefresh}
          onNavigate={navigate}
          virtualization={virtualization}
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.blue}
              colors={[colors.blue, colors.teal]}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: tabsHeight + 16, gap: 14, maxWidth: containerMaxWidth, alignSelf: containerAlignSelf }}
        >
          {pageHeader}
          <TabContent role={role} tab={safeTab} bootstrap={bootstrap} data={data} loadingTabs={loadingTabs} tabErrors={tabErrors} onChanged={onRefresh} onNavigate={navigate} />
        </ScrollView>
      )}
      <BottomTabs tabs={tabsWithBadge} activeTab={safeTab} onChange={navigate} onLayout={(e) => setTabsHeight(e.nativeEvent.layout.height)} />
    </SafeAreaView>
  )
}

export type VirtualizationProps = {
  pageHeader: ReactNode
  refreshing: boolean
  onRefresh: () => void
  bottomPadding: number
  maxWidth?: number
  alignSelf: "center" | "stretch"
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
  virtualization,
}: {
  role: string
  tab: string
  bootstrap: MobileBootstrap
  data: AppData
  loadingTabs: Record<string, boolean>
  tabErrors: Record<string, string | null>
  onChanged: () => void
  onNavigate: (tab: string) => void
  virtualization?: VirtualizationProps
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
    if (tabKey === "messages") return <TenantMessages />
    if (tabKey === "meters") return data.tenantMeters ? <TenantMeters meters={data.tenantMeters} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    if (tabKey === "documents") return data.tenantDocuments ? <TenantDocuments documents={data.tenantDocuments} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
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
  if (tabKey === "tenants") return data.adminTenants ? <AdminTenants payload={data.adminTenants} buildingId={tabParam} onNavigate={onNavigate} virtualization={virtualization} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
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
    return data.adminDocuments ? <AdminDocuments payload={data.adminDocuments} tenantId={tenantId} buildingId={buildingId} onNavigate={onNavigate} virtualization={virtualization} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  }
  if (tabKey === "request") {
    const request = data.adminRequests?.data.find((item) => item.id === tabParam)
    if (!data.adminRequests) return <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
    return request ? <AdminRequestDetail request={request} onChanged={onChanged} onNavigate={onNavigate} /> : <EmptyState title="Заявка не найдена в загруженном списке" />
  }
  if (tabKey === "requests") return data.adminRequests ? <AdminRequests payload={data.adminRequests} buildingId={tabParam} onChanged={onChanged} onNavigate={onNavigate} virtualization={virtualization} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "payments") {
    if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) return <NoAccess title="Оплаты доступны владельцу, админу и бухгалтеру" />
    return data.adminPayments ? <AdminPayments payload={data.adminPayments} buildingId={tabParam} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  }
  if (tabKey === "buildings") return data.adminBuildings ? <AdminBuildings payload={data.adminBuildings} onNavigate={onNavigate} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "tasks") return data.adminTasks ? <AdminTasks payload={data.adminTasks} bootstrap={bootstrap} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "chat") return data.adminMessages ? <AdminMessages payload={data.adminMessages} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "meters") return data.adminMeters ? <AdminMeters payload={data.adminMeters} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  if (tabKey === "expenses") {
    if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) return <NoAccess title="Расходы доступны владельцу, админу и бухгалтеру" />
    return data.adminExpenses ? <AdminExpenses payload={data.adminExpenses} onChanged={onChanged} /> : <TabLoading error={tabError} loading={loadingTabs[tabKey]} />
  }
  if (tabKey === "settings") return <More title="Настройки" bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} settingsOnly />
  if (tabKey === "more") return <More bootstrap={bootstrap} buildings={bootstrap.buildings} settings={data.notificationSettings} onChanged={onChanged} onNavigate={onNavigate} />
  return data.adminToday ? <AdminToday payload={data.adminToday} notices={data.notices} bootstrap={bootstrap} onChanged={onChanged} onNavigate={onNavigate} /> : <CenteredLoader />
}




