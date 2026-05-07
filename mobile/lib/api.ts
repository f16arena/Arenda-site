import * as Device from "expo-device"
import { Directory, File, Paths } from "expo-file-system"
import * as LocalAuthentication from "expo-local-authentication"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import Constants from "expo-constants"
import { captureMobileException } from "@/lib/sentry"
import type {
  BuildingNotice,
  AdminBuildingsPayload,
  AdminPaymentReport,
  AdminPaymentReportsPayload,
  AdminRequestsPayload,
  AdminTodayPayload,
  MobileAuthResponse,
  MobileBootstrap,
  MobileNotificationSettingsPayload,
  MobileNotificationsPayload,
  MobileSessionsPayload,
  MobileTokens,
  OwnerOverviewPayload,
  PickedUploadFile,
  TenantDocumentsPayload,
  TenantFinances,
  TenantMeter,
  TenantMetersPayload,
  TenantOverview,
  TenantPaymentReport,
  TenantRequest,
  TenantRequestsPayload,
} from "@/types/mobile"

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://commrent.kz"
const ACCESS_TOKEN_KEY = "commrent.mobile.accessToken"
const REFRESH_TOKEN_KEY = "commrent.mobile.refreshToken"
const ACCESS_EXPIRES_KEY = "commrent.mobile.accessExpiresAt"
const REFRESH_EXPIRES_KEY = "commrent.mobile.refreshExpiresAt"

export type DeviceAuthAvailability = {
  available: boolean
  enrolled: boolean
  label: string
  supportedTypes: LocalAuthentication.AuthenticationType[]
  reason?: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function hasStoredSession() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
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
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
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

export async function logoutMobile() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
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
    appendUploadFile(form, "receipt", input.receipt)

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
    appendUploadFile(form, "attachment", input.attachment)

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

export async function getAdminRequests() {
  return authFetch<AdminRequestsPayload>("/api/mobile/admin/requests")
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

export async function getAdminPaymentReports() {
  return authFetch<AdminPaymentReportsPayload>("/api/mobile/admin/payment-reports")
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

async function authFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = await getValidAccessToken()
  const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    })
  } catch (error) {
    captureMobileException(error, { path, method: options.method ?? "GET" })
    throw error
  }

  if (res.status === 401 && retry) {
    await refreshMobileSession()
    return authFetch<T>(path, options, false)
  }

  return parseResponse<T>(res)
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
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    })
  } catch (error) {
    captureMobileException(error, { path, method: options.method ?? "GET" })
    throw error
  }
  return parseResponse<T>(res)
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
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(ACCESS_EXPIRES_KEY),
  ])

  if (accessToken && expiresAt && new Date(expiresAt).getTime() > Date.now() + 30_000) {
    return accessToken
  }

  const refreshed = await refreshMobileSession()
  return refreshed.accessToken
}

async function refreshMobileSession() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
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
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    SecureStore.setItemAsync(ACCESS_EXPIRES_KEY, tokens.expiresAt),
    SecureStore.setItemAsync(REFRESH_EXPIRES_KEY, tokens.refreshExpiresAt),
  ])
}

async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ACCESS_EXPIRES_KEY),
    SecureStore.deleteItemAsync(REFRESH_EXPIRES_KEY),
  ])
}

function getDeviceMeta() {
  return {
    deviceId: Device.osInternalBuildId ?? Device.modelId ?? undefined,
    deviceName: Device.deviceName,
    platform: process.env.EXPO_OS === "ios" ? "IOS" : "ANDROID",
    appVersion: Constants.expoConfig?.version,
  }
}

function appendUploadFile(form: FormData, key: string, file: PickedUploadFile) {
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
