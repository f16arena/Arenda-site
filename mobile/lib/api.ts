import * as Device from "expo-device"
import { Directory, File, Paths } from "expo-file-system"
import * as LocalAuthentication from "expo-local-authentication"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import Constants from "expo-constants"
import { Platform } from "react-native"
import { captureMobileException } from "@/lib/sentry"
import type {
  BuildingNotice,
  AdminBuildingsPayload,
  AdminContractsPayload,
  AdminDocumentsPayload,
  AdminPaymentReport,
  AdminPaymentReportsPayload,
  AdminRequestsPayload,
  AdminTenantDetailPayload,
  AdminTenantsPayload,
  AdminTodayPayload,
  MobileAuthResponse,
  MobileBootstrap,
  MobileNotificationSettingsPayload,
  MobileNotificationsPayload,
  MobileSessionsPayload,
  MobileTokens,
  OwnerOverviewPayload,
  PickedUploadFile,
  TenantContractsPayload,
  TenantDocumentsPayload,
  TenantFinances,
  TenantMeter,
  TenantMetersPayload,
  TenantOverview,
  TenantPaymentReport,
  TenantRequest,
  TenantRequestsPayload,
} from "@/types/mobile"

const DEFAULT_API_BASE_URL = __DEV__ && process.env.EXPO_OS === "web" ? "http://localhost:3000" : "https://commrent.kz"
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
const ACCESS_TOKEN_KEY = "commrent.mobile.accessToken"
const REFRESH_TOKEN_KEY = "commrent.mobile.refreshToken"
const ACCESS_EXPIRES_KEY = "commrent.mobile.accessExpiresAt"
const REFRESH_EXPIRES_KEY = "commrent.mobile.refreshExpiresAt"
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export type DeviceAuthAvailability = {
  available: boolean
  enrolled: boolean
  label: string
  supportedTypes: LocalAuthentication.AuthenticationType[]
  reason?: string
}

export type ApiErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "DNS"
  | "ABORT"
  | "SERVER"
  | "AUTH"
  | "VALIDATION"
  | string

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ApiErrorCode,
    public details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function hasStoredSession() {
  const refreshToken = await getStoredSecret(REFRESH_TOKEN_KEY)
  return !!refreshToken
}

export async function getDeviceAuthAvailability(): Promise<DeviceAuthAvailability> {
  try {
    const [hasHardware, enrolledLevel, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync().catch(() => false),
      LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE),
      LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
    ])

    const enrolled = enrolledLevel !== LocalAuthentication.SecurityLevel.NONE
    if (!enrolled) {
      return {
        available: false,
        enrolled: false,
        label: "код телефона",
        supportedTypes,
        reason: "Включите Face ID, отпечаток или код-пароль телефона в настройках устройства",
      }
    }

    return {
      available: hasHardware || enrolledLevel === LocalAuthentication.SecurityLevel.SECRET,
      enrolled,
      label: getDeviceAuthLabel(supportedTypes, enrolledLevel),
      supportedTypes,
    }
  } catch (error) {
    return {
      available: false,
      enrolled: false,
      label: "быстрый вход",
      supportedTypes: [],
      reason: error instanceof Error ? error.message : "Системная авторизация недоступна",
    }
  }
}

export async function unlockStoredSessionWithDeviceAuth(options: { refreshSession?: boolean } = {}) {
  const refreshToken = await getStoredSecret(REFRESH_TOKEN_KEY)
  if (!refreshToken) {
    throw new ApiError("Сначала войдите по логину и паролю", 401, "NO_STORED_SESSION")
  }

  const availability = await getDeviceAuthAvailability()
  if (!availability.available) {
    throw new Error(availability.reason ?? "Быстрый вход недоступен на этом устройстве")
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Войти в Commrent",
    promptSubtitle: "Подтвердите быстрый вход",
    promptDescription: "Используйте Face ID, отпечаток или код телефона",
    cancelLabel: "Отмена",
    fallbackLabel: "Код телефона",
    disableDeviceFallback: false,
    requireConfirmation: true,
  })

  if (!result.success) {
    throw new Error(getDeviceAuthErrorMessage(result.error))
  }

  if (options.refreshSession === false) return null
  return refreshMobileSession()
}

export async function loginMobile(input: {
  login: string
  password: string
  totp?: string
}) {
  const res = await plainFetch<MobileAuthResponse>("/api/mobile/auth/login", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      ...getDeviceMeta(),
    }),
  })
  await saveTokens(res.tokens)
  return res
}

export async function registerMobile(input: {
  companyName: string
  slug: string
  ownerName: string
  ownerEmail?: string
  ownerPhone?: string
  password: string
  agreed: boolean
}) {
  const res = await plainFetch<MobileAuthResponse & {
    organization?: {
      id: string
      name: string
      slug: string
      trialExpiresAt: string
    }
  }>("/api/mobile/auth/register", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      ...getDeviceMeta(),
    }),
  })
  await saveTokens(res.tokens)
  return res
}

export async function requestMobilePasswordReset(email: string) {
  return plainFetch<{
    ok: boolean
    message: string
    previewLink?: string
  }>("/api/mobile/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export async function logoutMobile() {
  const refreshToken = await getStoredSecret(REFRESH_TOKEN_KEY)
  await authFetch("/api/mobile/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null)
  await clearTokens()
}

export async function getMobileBootstrap(): Promise<MobileBootstrap> {
  return authFetch<MobileBootstrap>("/api/mobile/bootstrap")
}

export async function getBuildingNotices(buildingId?: string) {
  const query = buildingId ? `?buildingId=${encodeURIComponent(buildingId)}` : ""
  const res = await authFetch<{ data: BuildingNotice[] }>(`/api/mobile/building-notices${query}`)
  return res.data
}

export async function createBuildingNotice(input: {
  buildingId: string
  type: string
  severity: string
  title: string
  message: string
}) {
  const res = await authFetch<{ data: BuildingNotice }>("/api/mobile/building-notices", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function getTenantOverview() {
  return authFetch<TenantOverview>("/api/mobile/tenant/overview")
}

export async function getTenantFinances() {
  return authFetch<TenantFinances>("/api/mobile/tenant/finances")
}

// Сообщения арендатора <-> администратор. Бэкенд: /api/mobile/tenant/messages
export type TenantMessageDto = {
  id: string
  subject: string
  body: string
  isRead: boolean
  attachmentUrl?: string | null
  createdAt: string
  from: { id: string; name: string; role: string }
  to: { id: string; name: string; role: string }
  direction: "in" | "out"
}

export type TenantAdminContact = {
  id: string
  name: string
  role: string
}

export async function getTenantMessages() {
  return authFetch<{ unread: number; admins: TenantAdminContact[]; data: TenantMessageDto[] }>(
    "/api/mobile/tenant/messages",
  )
}

export async function sendTenantMessage(input: {
  toUserId: string
  subject?: string
  body: string
}) {
  const res = await authFetch<{ data: Omit<TenantMessageDto, "from" | "direction"> }>(
    "/api/mobile/tenant/messages",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
  return res.data
}

// Документы на подпись (контракты, доп. соглашения, акты).
// Бэкенд: /api/mobile/document-signature-requests
type DocumentSignatureRequestDto = {
  id: string
  documentType: string
  documentId: string | null
  documentRef: string | null
  title: string
  message: string | null
  status: string
  channel?: string
  allowedMethods: string[]
  preferredMethod: string
  expiresAt: string | null
  viewedAt?: string | null
  createdAt: string
  webUrl?: string
}

export async function getDocumentSignatureRequests() {
  return authFetch<{ data: DocumentSignatureRequestDto[] }>(
    "/api/mobile/document-signature-requests",
  )
}

export async function reportTenantPayment(input: {
  amount: number
  paymentDate?: string
  method: string
  paymentPurpose?: string
  note?: string
  receipt?: PickedUploadFile | null
}) {
  if (input.receipt) {
    const form = new FormData()
    form.append("amount", String(input.amount))
    if (input.paymentDate) form.append("paymentDate", input.paymentDate)
    form.append("method", input.method)
    if (input.paymentPurpose) form.append("paymentPurpose", input.paymentPurpose)
    if (input.note) form.append("note", input.note)
    await appendUploadFile(form, "receipt", input.receipt)

    const res = await authFetch<{ data: TenantPaymentReport }>("/api/mobile/tenant/finances", {
      method: "POST",
      body: form,
    })
    return res.data
  }

  const res = await authFetch<{ data: TenantPaymentReport }>("/api/mobile/tenant/finances", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      paymentDate: input.paymentDate,
      method: input.method,
      paymentPurpose: input.paymentPurpose,
      note: input.note,
    }),
  })
  return res.data
}

export async function getTenantRequests() {
  return authFetch<TenantRequestsPayload>("/api/mobile/tenant/requests")
}

export async function createTenantRequest(input: {
  title: string
  description: string
  type: string
  priority: string
  attachment?: PickedUploadFile | null
}) {
  if (input.attachment) {
    const form = new FormData()
    form.append("title", input.title)
    form.append("description", input.description)
    form.append("type", input.type)
    form.append("priority", input.priority)
    await appendUploadFile(form, "attachment", input.attachment)

    const res = await authFetch<{ data: TenantRequest }>("/api/mobile/tenant/requests", {
      method: "POST",
      body: form,
    })
    return res.data
  }

  const res = await authFetch<{ data: TenantRequest }>("/api/mobile/tenant/requests", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
    }),
  })
  return res.data
}

export async function getTenantMeters() {
  return authFetch<TenantMetersPayload>("/api/mobile/tenant/meters")
}

export async function submitTenantMeterReading(input: {
  meterId: string
  value: number
  period?: string
}) {
  const res = await authFetch<{ data: TenantMeter; consumption: number }>("/api/mobile/tenant/meters", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res
}

export async function getTenantDocuments() {
  return authFetch<TenantDocumentsPayload>("/api/mobile/tenant/documents")
}

export async function getTenantContracts() {
  return authFetch<TenantContractsPayload>("/api/mobile/tenant/contracts")
}

export async function downloadAuthorizedFile(url: string, fileName: string) {
  const accessToken = await getValidAccessToken()
  const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`
  const res = await fetch(fullUrl, {
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : "",
    },
  })

  if (!res.ok) {
    throw new ApiError(`Не удалось скачать документ: HTTP ${res.status}`, res.status)
  }

  const directory = new Directory(Paths.cache, "commrent-documents")
  directory.create({ intermediates: true, idempotent: true })

  const safeName = safeFileName(fileName)
  const file = new File(directory, safeName)
  file.create({ intermediates: true, overwrite: true })
  file.write(new Uint8Array(await res.arrayBuffer()))

  return {
    uri: file.uri,
    name: safeName,
    mimeType: res.headers.get("content-type") ?? undefined,
  }
}

export async function startDocumentSignatureDraft(input: {
  requestId: string
  method: "SMS_OTP_DRAFT" | "NCA_LAYER_DRAFT"
}) {
  if (input.method === "NCA_LAYER_DRAFT") {
    return {
      ok: false,
      draftOnly: true,
      method: input.method,
      message: "ЭЦП через NCALayer зарезервирован для будущего native/web bridge.",
    }
  }

  return authFetch<{
    ok?: boolean
    draftOnly?: boolean
    method?: string
    message?: string
  }>(`/api/mobile/document-signature-requests/${encodeURIComponent(input.requestId)}/sign`, {
    method: "POST",
    body: JSON.stringify({ method: "SMS_OTP_DRAFT" }),
  })
}

export async function getAdminToday() {
  return authFetch<AdminTodayPayload>("/api/mobile/admin/today")
}

export async function getAdminRequests(params: {
  status?: string
  priority?: string
  buildingId?: string
} = {}) {
  return authFetch<AdminRequestsPayload>(`/api/mobile/admin/requests${queryString(params)}`)
}

export async function updateAdminRequest(input: {
  requestId: string
  status: string
  comment?: string
}) {
  const res = await authFetch<{ data: TenantRequest }>("/api/mobile/admin/requests", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function getAdminPaymentReports(params: {
  buildingId?: string
} = {}) {
  return authFetch<AdminPaymentReportsPayload>(`/api/mobile/admin/payment-reports${queryString(params)}`)
}

export async function reviewAdminPaymentReport(input: {
  reportId: string
  action: "confirm" | "dispute" | "reject"
  reason?: string
  method?: string
}) {
  return authFetch<{ ok?: boolean; status?: string; paymentId?: string; data?: AdminPaymentReport }>(
    "/api/mobile/admin/payment-reports",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  )
}

export async function getAdminBuildings() {
  return authFetch<AdminBuildingsPayload>("/api/mobile/admin/buildings")
}

export async function getAdminTenants(params: {
  q?: string
  buildingId?: string
  limit?: number
  offset?: number
} = {}) {
  return authFetch<AdminTenantsPayload>(`/api/mobile/admin/tenants${queryString(params)}`)
}

export async function getAdminTenantDetail(tenantId: string) {
  return authFetch<AdminTenantDetailPayload>(`/api/mobile/admin/tenants/${encodeURIComponent(tenantId)}`)
}

export async function getAdminContracts() {
  return authFetch<AdminContractsPayload>("/api/mobile/admin/contracts")
}

export async function getAdminDocuments(params: {
  q?: string
  category?: string
  tenantId?: string
  buildingId?: string
  limit?: number
  offset?: number
} = {}) {
  return authFetch<AdminDocumentsPayload>(`/api/mobile/admin/documents${queryString(params)}`)
}

export async function getOwnerOverview() {
  return authFetch<OwnerOverviewPayload>("/api/mobile/owner/overview")
}

export async function getMobileNotifications(unreadOnly = false) {
  const query = unreadOnly ? "?unread=1" : ""
  return authFetch<MobileNotificationsPayload>(`/api/mobile/notifications${query}`)
}

export async function markMobileNotificationsRead(input: {
  ids?: string[]
  markAllRead?: boolean
  isRead?: boolean
}) {
  return authFetch<{ ok: boolean }>("/api/mobile/notifications", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export async function getMobileNotificationSettings() {
  return authFetch<MobileNotificationSettingsPayload>("/api/mobile/notification-settings")
}

export async function updateMobileNotificationSettings(input: {
  notifyEmail?: boolean
  notifyTelegram?: boolean
  notifyInApp?: boolean
  notifySms?: boolean
  quietHoursEnabled?: boolean
  quietFrom?: string
  quietTo?: string
  mutedTypes?: string[]
}) {
  return authFetch<Pick<MobileNotificationSettingsPayload, "settings">>("/api/mobile/notification-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export async function getMobileSessions() {
  return authFetch<MobileSessionsPayload>("/api/mobile/security/sessions")
}

export async function revokeMobileSession(sessionId: string) {
  return authFetch<{ ok: boolean }>("/api/mobile/security/sessions", {
    method: "DELETE",
    body: JSON.stringify({ sessionId }),
  })
}

export async function registerPushDevice() {
  if (!Device.isDevice) {
    throw new Error("Push notifications require a physical device")
  }

  const permission = await Notifications.requestPermissionsAsync()
  if (!permission.granted) {
    throw new Error("Push notification permission was not granted")
  }

  const token = await getExpoPushToken()

  return authFetch("/api/mobile/push-devices", {
    method: "POST",
    body: JSON.stringify({
      token,
      provider: "EXPO",
      ...getDeviceMeta(),
    }),
  })
}

export async function unregisterPushDevice() {
  const token = await getExpoPushToken()

  return authFetch<{ ok: boolean }>("/api/mobile/push-devices", {
    method: "DELETE",
    body: JSON.stringify({ token }),
  })
}

// ============================================================================
// P0/P1/P2: профиль, безопасность, документы, Telegram, задачи, счётчики, QR.
// ============================================================================

export type MobileMe = {
  user: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    role: string | null
    emailVerifiedAt: string | null
    phoneVerifiedAt: string | null
    telegramChatId: string | null
    totpEnabledAt: string | null
    mustChangePassword: boolean
  }
  organization: { id: string; name: string; slug: string; isSuspended: boolean }
}

export async function getMobileMe() {
  return authFetch<MobileMe>("/api/mobile/auth/me")
}

export async function updateMobileProfile(input: { name?: string; phone?: string | null }) {
  return authFetch<{ user: MobileMe["user"] }>("/api/mobile/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export async function changeMobilePassword(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}) {
  return authFetch<{ ok: boolean }>("/api/mobile/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function enrollMobileTotp() {
  return authFetch<{ secret: string; otpauthUrl: string; qrDataUrl: string }>(
    "/api/mobile/auth/totp/enroll",
    { method: "POST", body: JSON.stringify({}) },
  )
}

export async function verifyMobileTotp(input: { secret: string; code: string }) {
  return authFetch<{ ok: boolean; backupCodes: string[] }>("/api/mobile/auth/totp/verify", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function disableMobileTotp(input: { password: string }) {
  return authFetch<{ ok: boolean }>("/api/mobile/auth/totp/disable", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function sendMobileEmailVerification() {
  return authFetch<{ ok: boolean; sent: boolean; previewUrl?: string }>(
    "/api/mobile/auth/verify-email",
    { method: "POST", body: JSON.stringify({}) },
  )
}

export async function confirmMobileEmailVerification(token: string) {
  return authFetch<{ ok: boolean }>("/api/mobile/auth/verify-email", {
    method: "PATCH",
    body: JSON.stringify({ token }),
  })
}

export async function linkMobileTelegram() {
  return authFetch<{ url: string; expiresAt: string }>("/api/mobile/profile/telegram", {
    method: "POST",
    body: JSON.stringify({}),
  })
}

export async function disconnectMobileTelegram() {
  return authFetch<{ ok: boolean }>("/api/mobile/profile/telegram", { method: "DELETE" })
}

export async function createSignatureRequest(input: {
  recipientUserId?: string
  tenantId?: string
  documentType: string
  documentId?: string
  documentRef?: string
  title: string
  message?: string
  allowedMethods?: string[]
  preferredMethod?: string
  expiresAt?: string
}) {
  const res = await authFetch<{
    data: {
      id: string
      documentType: string
      documentId: string | null
      documentRef: string | null
      title: string
      message: string | null
      status: string
      allowedMethods: string[]
      preferredMethod: string
      expiresAt: string | null
      createdAt: string
    }
  }>("/api/mobile/document-signature-requests", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function respondToSignatureRequest(
  requestId: string,
  input: { action: "VIEW" | "REJECT" | "CANCEL"; reason?: string },
) {
  return authFetch<{ ok?: boolean; status?: string }>(
    `/api/mobile/document-signature-requests/${encodeURIComponent(requestId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  )
}

export type AdminMessageThread = {
  counterpartId: string
  counterpartName: string
  tenantId: string | null
  tenantName: string | null
  lastMessageAt: string
  lastBody: string
  unread: number
}

export async function getAdminMessages() {
  return authFetch<{
    unread: number
    threads: AdminMessageThread[]
    data: TenantMessageDto[]
  }>("/api/mobile/admin/messages")
}

export async function sendAdminMessage(input: {
  toUserId?: string
  tenantId?: string
  subject?: string
  body: string
}) {
  const res = await authFetch<{ data: Omit<TenantMessageDto, "from" | "direction"> }>(
    "/api/mobile/admin/messages",
    { method: "POST", body: JSON.stringify(input) },
  )
  return res.data
}

export type MobileTenantUploadedDocument = {
  id: string
  type: string
  name: string
  fileUrl: string | null
  storageFileId: string | null
  createdAt: string
  source: "tenant_document"
  fileName: string
  mimeType: string | null
  fileSize: number | null
  downloadUrl: string | null
}

export async function uploadTenantDocument(input: {
  type: string
  name: string
  file: PickedUploadFile
}) {
  const form = new FormData()
  form.append("type", input.type)
  form.append("name", input.name)
  await appendUploadFile(form, "file", input.file)

  const res = await authFetch<{ data: MobileTenantUploadedDocument }>(
    "/api/mobile/tenant/documents",
    { method: "POST", body: form },
  )
  return res.data
}

export async function deleteTenantUploadedDocument(documentId: string) {
  return authFetch<{ ok: boolean }>(
    `/api/mobile/tenant/documents?id=${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  )
}

export type AdminTaskDto = {
  id: string
  title: string
  description: string | null
  category: string
  priority: string
  status: string
  floorNumber: number | null
  spaceNumber: string | null
  estimatedCost: number | null
  actualCost: number | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  building: { id: string; name: string } | null
  createdBy?: { id: string; name: string | null }
  assignedTo: { id: string; name: string | null; role: string } | null
}

export type AdminTasksPayload = {
  counters: {
    total: number
    open: number
    urgent: number
    byStatus: Record<string, number>
  }
  data: AdminTaskDto[]
}

export async function getAdminTasks(
  params: {
    status?: string
    priority?: string
    buildingId?: string
    assignedToMe?: boolean
  } = {},
) {
  const query = queryString({
    status: params.status,
    priority: params.priority,
    buildingId: params.buildingId,
    assignedToMe: params.assignedToMe ? "1" : undefined,
  })
  return authFetch<AdminTasksPayload>(`/api/mobile/admin/tasks${query}`)
}

export async function createAdminTask(input: {
  buildingId?: string
  title: string
  description?: string
  category?: string
  priority?: string
  floorNumber?: number
  spaceNumber?: string
  estimatedCost?: number
  dueDate?: string
  assignedToId?: string
}) {
  const res = await authFetch<{ data: AdminTaskDto }>("/api/mobile/admin/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function updateAdminTask(
  taskId: string,
  input: Partial<{
    title: string
    description: string | null
    category: string
    priority: string
    status: string
    estimatedCost: number | null
    actualCost: number | null
    dueDate: string | null
    assignedToId: string | null
  }>,
) {
  const res = await authFetch<{ data: AdminTaskDto }>(
    `/api/mobile/admin/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  )
  return res.data
}

export async function deleteAdminTask(taskId: string) {
  return authFetch<{ ok: boolean }>(
    `/api/mobile/admin/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  )
}

export type AdminMeterDto = {
  id: string
  type: string
  number: string
  space: {
    id: string
    number: string
    area: number | null
    floor: {
      id: string
      name: string | null
      buildingId: string
      building: { id: string; name: string } | null
    }
  }
  readings: { id: string; value: number; previous: number; period: string; createdAt: string }[]
}

export async function getAdminMeters(params: { buildingId?: string; spaceId?: string } = {}) {
  return authFetch<{ data: AdminMeterDto[] }>(
    `/api/mobile/admin/meters${queryString(params)}`,
  )
}

export async function createAdminMeter(input: {
  spaceId: string
  type: "ELECTRICITY" | "WATER" | "HEAT"
  number: string
  initialValue?: number
}) {
  const res = await authFetch<{ data: { id: string; type: string; number: string; spaceId: string } }>(
    "/api/mobile/admin/meters",
    { method: "POST", body: JSON.stringify(input) },
  )
  return res.data
}

export async function deleteAdminMeter(meterId: string) {
  return authFetch<{ ok: boolean; readingsDeleted: number }>(
    `/api/mobile/admin/meters?id=${encodeURIComponent(meterId)}`,
    { method: "DELETE" },
  )
}

export type PaymentQrPayload = {
  qrDataUrl: string
  payload: string
  requisites: {
    fullName: string
    bin: string
    iik: string
    bik: string
    bank: string
    kbe: string
    knp: string
  }
  period: string
  purpose: string
  amount: number | null
}

export async function getTenantPaymentQr(amount?: number) {
  const query = amount ? `?amount=${encodeURIComponent(String(amount))}` : ""
  return authFetch<PaymentQrPayload>(`/api/mobile/tenant/payments/qr${query}`)
}

async function authFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = await getValidAccessToken()
  const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData
  const res = await fetchWithRetry(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    },
    { path, method: options.method ?? "GET" },
  )

  if (res.status === 401 && retry) {
    await refreshMobileSession()
    return authFetch<T>(path, options, false)
  }

  return parseResponse<T>(res)
}

function queryString(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ""
}

async function getExpoPushToken() {
  if (!Device.isDevice) {
    throw new Error("Push notifications require a physical device")
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )
  return token.data
}

async function plainFetch<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetchWithRetry(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    },
    { path, method: options.method ?? "GET" },
  )
  return parseResponse<T>(res)
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  meta: { path: string; method: string },
) {
  const attempts = isRetryableRequest(init) ? 3 : 1
  let lastError: unknown = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, init)
      if (attempt < attempts - 1 && RETRYABLE_HTTP_STATUSES.has(res.status)) {
        await delay(getRetryDelay(attempt))
        continue
      }
      return res
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await delay(getRetryDelay(attempt))
        continue
      }
    }
  }

  captureMobileException(lastError, meta)
  throw classifyNetworkError(lastError)
}

function classifyNetworkError(error: unknown): ApiError {
  // AbortController/AbortSignal — пользователь или приложение прервали запрос.
  if (error instanceof Error && (error.name === "AbortError" || (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError"))) {
    return new ApiError("Запрос отменен", 0, "ABORT", error)
  }

  // TypeError "Network request failed" / fetch network errors.
  if (error instanceof TypeError && /network/i.test(error.message)) {
    return new ApiError("Нет связи с сервером — проверьте интернет", 0, "NETWORK", error)
  }

  // Тайм-аут (как от RN fetch, так и от serverside).
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    return new ApiError("Сервер не отвечает — попробуйте позже", 0, "TIMEOUT", error)
  }

  // DNS / hostname.
  if (error instanceof Error && /(getaddrinfo|enotfound|dns)/i.test(error.message)) {
    return new ApiError("Не удается найти сервер — проверьте подключение", 0, "DNS", error)
  }

  return new ApiError(
    "Нет связи с сервером. Проверьте интернет или попробуйте обновить экран через несколько секунд.",
    0,
    "NETWORK",
    error,
  )
}

function isRetryableRequest(init: RequestInit) {
  const method = String(init.method ?? "GET").toUpperCase()
  return method === "GET" || method === "HEAD" || method === "OPTIONS"
}

function getRetryDelay(attempt: number) {
  return 350 * 2 ** attempt
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function parseResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new ApiError(
      payload?.error ?? `HTTP ${res.status}`,
      res.status,
      payload?.code,
    )
    if (res.status >= 500) {
      captureMobileException(error, { status: res.status, code: payload?.code })
    }
    throw error
  }
  return payload as T
}

async function getValidAccessToken() {
  const [accessToken, expiresAt] = await Promise.all([
    getStoredSecret(ACCESS_TOKEN_KEY),
    getStoredSecret(ACCESS_EXPIRES_KEY),
  ])

  if (accessToken && expiresAt && new Date(expiresAt).getTime() > Date.now() + 30_000) {
    return accessToken
  }

  const refreshed = await refreshMobileSession()
  return refreshed.accessToken
}

async function refreshMobileSession() {
  const refreshToken = await getStoredSecret(REFRESH_TOKEN_KEY)
  if (!refreshToken) throw new ApiError("Session expired", 401, "NO_REFRESH_TOKEN")

  const res = await plainFetch<MobileAuthResponse>("/api/mobile/auth/refresh", {
    method: "POST",
    body: JSON.stringify({
      refreshToken,
      ...getDeviceMeta(),
    }),
  })
  await saveTokens(res.tokens)
  return res.tokens
}

async function saveTokens(tokens: MobileTokens) {
  await Promise.all([
    setStoredSecret(ACCESS_TOKEN_KEY, tokens.accessToken),
    setStoredSecret(REFRESH_TOKEN_KEY, tokens.refreshToken),
    setStoredSecret(ACCESS_EXPIRES_KEY, tokens.expiresAt),
    setStoredSecret(REFRESH_EXPIRES_KEY, tokens.refreshExpiresAt),
  ])
}

async function clearTokens() {
  await Promise.all([
    deleteStoredSecret(ACCESS_TOKEN_KEY),
    deleteStoredSecret(REFRESH_TOKEN_KEY),
    deleteStoredSecret(ACCESS_EXPIRES_KEY),
    deleteStoredSecret(REFRESH_EXPIRES_KEY),
  ])
}

async function getStoredSecret(key: string) {
  if (isWebRuntime()) return globalThis.localStorage?.getItem(key) ?? null
  return SecureStore.getItemAsync(key)
}

async function setStoredSecret(key: string, value: string) {
  if (isWebRuntime()) {
    globalThis.localStorage?.setItem(key, value)
    return
  }
  return SecureStore.setItemAsync(key, value)
}

async function deleteStoredSecret(key: string) {
  if (isWebRuntime()) {
    globalThis.localStorage?.removeItem(key)
    return
  }
  return SecureStore.deleteItemAsync(key)
}

function isWebRuntime() {
  return process.env.EXPO_OS === "web"
}

function getDeviceMeta() {
  return {
    deviceId: Device.osInternalBuildId ?? Device.modelId ?? undefined,
    deviceName: Device.deviceName,
    platform: process.env.EXPO_OS === "ios" ? "IOS" : "ANDROID",
    appVersion: Constants.expoConfig?.version,
    // Часовой пояс устройства — сервер использует его для тихих часов push (sendPushToUser).
    timezone: getDeviceTimezone(),
  }
}

function getDeviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

async function appendUploadFile(form: FormData, key: string, file: PickedUploadFile) {
  // На native (iOS/Android) FormData принимает специальный объект { uri, name, type }
  // и собирает multipart-запрос на нативном слое. На web нужен реальный Blob/File,
  // иначе body отправляется как "[object Object]" и сервер получает 0-байт файл.
  if (Platform.OS === "web") {
    let blob: Blob

    if (file.uri.startsWith("data:")) {
      // data: URI разбираем вручную — fetch() на data: иногда даёт CORS-warning
      // и медленнее, чем прямой парсинг base64.
      const commaIndex = file.uri.indexOf(",")
      if (commaIndex < 0) {
        throw new ApiError("Не удалось прочитать файл: неверный data: URI", 0, "VALIDATION")
      }
      const header = file.uri.slice(5, commaIndex)
      const payload = file.uri.slice(commaIndex + 1)
      const mimeMatch = header.match(/^([^;]+)/)
      const mime = mimeMatch?.[1] ?? file.mimeType
      const isBase64 = /;base64$/i.test(header) || /;base64;/i.test(header)
      try {
        if (isBase64) {
          const binary = atob(payload)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          blob = new Blob([bytes], { type: mime })
        } else {
          blob = new Blob([decodeURIComponent(payload)], { type: mime })
        }
      } catch (e) {
        throw new ApiError(
          `Не удалось прочитать файл: ${e instanceof Error ? e.message : "ошибка декодирования"}`,
          0,
          "VALIDATION",
          e,
        )
      }
    } else {
      try {
        const response = await fetch(file.uri)
        blob = await response.blob()
      } catch (e) {
        throw new ApiError(
          `Не удалось прочитать файл: ${e instanceof Error ? e.message : "ошибка чтения"}`,
          0,
          "VALIDATION",
          e,
        )
      }
    }

    // Используем глобальный File из DOM (не expo-file-system, который переопределил имя).
    const WebFile = (globalThis as unknown as { File: typeof globalThis.File }).File
    const webFile = new WebFile([blob], file.name, { type: file.mimeType })
    form.append(key, webFile)
    return
  }
  form.append(key, {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob)
}

function safeFileName(value: string) {
  const trimmed = value.trim() || `commrent-document-${Date.now()}`
  const normalized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120)
  return normalized.includes(".") ? normalized : `${normalized}.pdf`
}

function getDeviceAuthLabel(
  supportedTypes: LocalAuthentication.AuthenticationType[],
  enrolledLevel: LocalAuthentication.SecurityLevel,
) {
  const hasFace = supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  const hasFingerprint = supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
  const hasIris = supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)

  if (hasFace && hasFingerprint) return "Face ID / отпечаток / код телефона"
  if (hasFace) return "Face ID / код телефона"
  if (hasFingerprint) return "отпечаток / код телефона"
  if (hasIris) return "биометрию / код телефона"
  if (enrolledLevel === LocalAuthentication.SecurityLevel.SECRET) return "код телефона"
  return "защиту телефона"
}

function getDeviceAuthErrorMessage(error: LocalAuthentication.LocalAuthenticationError) {
  if (error === "user_cancel" || error === "app_cancel" || error === "system_cancel") {
    return "Вход отменен"
  }
  if (error === "not_enrolled" || error === "passcode_not_set") {
    return "На телефоне не включен Face ID, отпечаток или код-пароль"
  }
  if (error === "lockout") {
    return "Слишком много попыток. Разблокируйте телефон кодом и попробуйте снова"
  }
  if (error === "not_available") {
    return "Быстрый вход недоступен на этом устройстве"
  }
  if (error === "timeout") {
    return "Время подтверждения истекло"
  }
  return "Не удалось подтвердить быстрый вход"
}
