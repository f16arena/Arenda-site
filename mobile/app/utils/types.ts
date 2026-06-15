import type {
  AdminBuildingsPayload,
  AdminDocumentsPayload,
  AdminExpensesPayload,
  AdminPaymentReportsPayload,
  AdminRequestsPayload,
  AdminTenantDetailPayload,
  AdminTenantsPayload,
  AdminTodayPayload,
  BuildingNotice,
  MobileBootstrap,
  MobileNotificationSettingsPayload,
  MobileNotificationsPayload,
  OwnerOverviewPayload,
  TenantDocumentsPayload,
  TenantFinances,
  TenantMetersPayload,
  TenantOverview,
  TenantRequestsPayload,
} from "@/types/mobile"
import type { AdminMeterDto, AdminMessageThread, AdminTasksPayload, TenantAdminContact, TenantMessageDto } from "@/lib/api"

export type TenantMessagesPayload = {
  unread: number
  admins: TenantAdminContact[]
  data: TenantMessageDto[]
}

export type AdminMessagesPayload = {
  unread: number
  threads: AdminMessageThread[]
  data: TenantMessageDto[]
}

export type AdminMetersPayload = {
  data: AdminMeterDto[]
}

export type AppData = {
  notices: BuildingNotice[]
  tenantOverview: TenantOverview | null
  tenantFinances: TenantFinances | null
  tenantRequests: TenantRequestsPayload | null
  tenantMeters: TenantMetersPayload | null
  tenantDocuments: TenantDocumentsPayload | null
  tenantMessages: TenantMessagesPayload | null
  adminToday: AdminTodayPayload | null
  adminRequests: AdminRequestsPayload | null
  adminPayments: AdminPaymentReportsPayload | null
  adminBuildings: AdminBuildingsPayload | null
  adminTenants: AdminTenantsPayload | null
  adminTenantDetails: Record<string, AdminTenantDetailPayload>
  adminDocuments: AdminDocumentsPayload | null
  adminTasks: AdminTasksPayload | null
  adminMessages: AdminMessagesPayload | null
  adminMeters: AdminMetersPayload | null
  adminExpenses: AdminExpensesPayload | null
  ownerOverview: OwnerOverviewPayload | null
  notifications: MobileNotificationsPayload | null
  notificationSettings: MobileNotificationSettingsPayload | null
}

export const emptyData: AppData = {
  notices: [],
  tenantOverview: null,
  tenantFinances: null,
  tenantRequests: null,
  tenantMeters: null,
  tenantDocuments: null,
  tenantMessages: null,
  adminToday: null,
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
  ownerOverview: null,
  notifications: null,
  notificationSettings: null,
}

export type CachedDashboard = {
  bootstrap: MobileBootstrap
  data: AppData
}

export type CacheState = {
  fromCache: boolean
  savedAt?: string
  error?: string | null
}

export const DASHBOARD_CACHE_KEY = "dashboard"

export function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function rootTab(tab: string) {
  return tab.split(":")[0] || "home"
}

export function isReachableTab(tabs: Array<{ key: string }>, tab: string) {
  const key = rootTab(tab)
  return tabs.some((item) => item.key === key) || ["notifications", "settings", "tasks", "chat", "meters"].includes(key)
}

export function backTargetForTab(tab: string) {
  const [tabKey, tabParam, tabSubParam] = tab.split(":")
  if (tabKey === "tenant") return "tenants"
  if (tabKey === "building") return "buildings"
  if ((tabKey === "tenants" || tabKey === "requests" || tabKey === "payments") && tabParam) return `building:${tabParam}`
  if (tabKey === "request") return "requests"
  if (tabKey === "document" || tabKey === "contract") return "documents"
  if (tabKey === "documents" && tabParam === "building" && tabSubParam) return `building:${tabSubParam}`
  if (tabKey === "documents" && tabParam === "tenant" && tabSubParam) return `tenant:${tabSubParam}`
  if (tabKey === "documents" && tabParam) return `tenant:${tabParam}`
  if (tabKey === "notifications") return "more"
  if (tabKey === "settings") return "more"
  if (tabKey === "tasks" || tabKey === "chat" || tabKey === "meters") return "more"
  return null
}

export function hasTabData(data: AppData, role: string, tabKey: string, tabParam?: string) {
  if (role === "TENANT") {
    if (tabKey === "payments") return !!data.tenantFinances
    if (tabKey === "requests") return !!data.tenantRequests
    if (tabKey === "meters") return !!data.tenantMeters
    if (tabKey === "documents") return !!data.tenantDocuments
    if (tabKey === "messages") return !!data.tenantMessages
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
  if (tabKey === "tasks") return !!data.adminTasks
  if (tabKey === "chat") return !!data.adminMessages
  if (tabKey === "meters") return !!data.adminMeters
  if (tabKey === "expenses") return !!data.adminExpenses
  return true
}

export function tabsForRole(role?: string | null) {
  if (role === "TENANT") {
    return [
      { key: "home", label: "Главная", icon: "house.fill" },
      { key: "payments", label: "Оплата", icon: "creditcard.fill" },
      { key: "requests", label: "Заявки", icon: "wrench.and.screwdriver.fill" },
      { key: "messages", label: "Чат", icon: "message.fill" },
      { key: "documents", label: "Документы", icon: "doc.text.fill" },
      { key: "more", label: "Еще", icon: "ellipsis" },
    ]
  }

  if (role === "OWNER") {
    return [
      { key: "owner", label: "Объекты", icon: "chart.line.uptrend.xyaxis" },
      { key: "tenants", label: "Аренд.", icon: "person.2.fill" },
      { key: "documents", label: "Док.", icon: "doc.text.fill" },
      { key: "payments", label: "Оплаты", icon: "creditcard.fill" },
      { key: "more", label: "Еще", icon: "ellipsis" },
    ]
  }

  return [
    { key: "home", label: "Сегодня", icon: "list.bullet.rectangle.fill" },
    { key: "tenants", label: "Аренд.", icon: "person.2.fill" },
    { key: "documents", label: "Док.", icon: "doc.text.fill" },
    { key: "requests", label: "Заявки", icon: "tray.full.fill" },
    { key: "more", label: "Еще", icon: "ellipsis" },
  ]
}

export async function pickUploadFile(
  kind: "receipt" | "request" | "document",
): Promise<import("@/types/mobile").PickedUploadFile | null> {
  const ImagePicker = await import("expo-image-picker")
  const DocumentPicker = await import("expo-document-picker")
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
