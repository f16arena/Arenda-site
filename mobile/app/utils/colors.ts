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
import type { AdminRequestsPayload, MobileNotification } from "@/types/mobile"
import { Linking } from "react-native"

export const colors = {
  background: "#f4f7fb",
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  text: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  border: "#dbe4ef",
  blue: "#1d4ed8",
  blueSoft: "#eff6ff",
  teal: "#0f766e",
  tealSoft: "#ecfdf5",
  orange: "#ea580c",
  red: "#dc2626",
  green: "#059669",
  slate: "#0f172a",
  disabled: "#737b89",
}

export const fonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extraBold: "Manrope_800ExtraBold",
  black: "Manrope_800ExtraBold",
}

export type AppIconComponent = typeof Bell

export const iconByName: Record<string, AppIconComponent> = {
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

// Re-export Ellipsis для AppIcon fallback
export const FallbackIcon = Ellipsis

// ── Helpers: enum / status маппинги ────────────────────────────────────────

export function pushPermissionLabel(status: string) {
  if (status === "granted") return "разрешено"
  if (status === "denied") return "запрещено"
  if (status === "undetermined") return "не выбрано"
  return status
}

export function legalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    IP: "ИП",
    TOO: "ТОО",
    LLP: "ТОО",
    AO: "АО",
    PERSON: "Физ. лицо",
  }
  return labels[type] ?? type
}

export function documentTypeLabel(type: string) {
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

export function categoryTitle(category: string) {
  const labels: Record<string, string> = {
    ALL: "Файлы",
    CONTRACT: "Договоры",
    ACT: "АВР",
    INVOICE: "Счета на оплату",
    RECONCILIATION: "Акты сверки",
  }
  return labels[category] ?? "Файлы"
}

export function documentTypeCategory(type: string) {
  if (type === "INVOICE") return "INVOICE"
  if (type === "RECONCILIATION") return "RECONCILIATION"
  if (["ACT", "ACCEPTANCE"].includes(type)) return "ACT"
  if (["CONTRACT", "ADDENDUM"].includes(type)) return "CONTRACT"
  return "ALL"
}

export function isPendingSignatureStatus(status: string) {
  return ["PENDING", "VIEWED"].includes(status)
}

export function signatureStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Ожидает",
    VIEWED: "Просмотрен",
    SIGNED: "Подписан",
    REJECTED: "Отклонен",
  }
  return labels[status] ?? status
}

export function isPendingContractStatus(status: string) {
  return ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(status)
}

export function contractTypeLabel(type: string) {
  const labels: Record<string, string> = {
    STANDARD: "Договор",
    ADDENDUM: "Доп. соглашение",
    TERMINATION: "Расторжение",
  }
  return labels[type] ?? documentTypeLabel(type)
}

export function contractStatusLabel(status: string) {
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

export function contractStatusColor(status: string) {
  if (["SIGNED"].includes(status)) return colors.green
  if (["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(status)) return colors.orange
  if (["REJECTED", "EXPIRED"].includes(status)) return colors.red
  return colors.blue
}

export function exactRequestStatus(filter: string) {
  if (["NEW", "IN_PROGRESS", "DONE", "CLOSED", "POSTPONED", "CANCELLED"].includes(filter)) return filter
  return undefined
}

export function exactRequestPriority(filter: string) {
  if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(filter)) return filter
  return undefined
}

export function matchesRequestStatus(status: string, filter: string) {
  if (filter === "ALL") return true
  if (filter === "ACTIVE") return !["DONE", "CLOSED", "CANCELLED"].includes(status)
  if (filter === "DONE") return ["DONE", "CLOSED"].includes(status)
  return status === filter
}

export function matchesRequestPriority(priority: string, filter: string) {
  if (filter === "ALL") return true
  if (filter === "URGENT") return ["HIGH", "URGENT"].includes(priority)
  return priority === filter
}

export function requestStatusLabel(status: string) {
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

export function requestStatusColor(status: string) {
  if (["DONE", "CLOSED"].includes(status)) return colors.green
  if (status === "IN_PROGRESS") return colors.blue
  if (status === "CANCELLED") return colors.red
  return colors.orange
}

export function requestPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Низкий",
    NORMAL: "Обычный",
    HIGH: "Высокий",
    URGENT: "Срочно",
  }
  return labels[priority] ?? priority
}

export function requestPriorityColor(priority: string) {
  if (priority === "URGENT" || priority === "HIGH") return colors.red
  if (priority === "LOW") return colors.teal
  return colors.blue
}

export function requestLocation(request: AdminRequestsPayload["data"][number]) {
  const firstExtraSpace = request.tenant.tenantSpaces?.[0]?.space
  const space = request.tenant.space ?? firstExtraSpace
  if (!space) return "Помещение не указано"
  return `${space.floor.building.name}, ${space.floor.name}, каб. ${space.number}`
}

export function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "На проверке",
    DISPUTED: "Требует уточнения",
    REJECTED: "Отклонено",
    CONFIRMED: "Подтверждено",
  }
  return labels[status] ?? status
}

export function paymentStatusColor(status: string) {
  if (status === "CONFIRMED") return colors.green
  if (status === "DISPUTED") return colors.orange
  if (status === "REJECTED") return colors.red
  return colors.blue
}

export function paymentReviewTitle(action: "confirm" | "dispute" | "reject") {
  if (action === "confirm") return "Подтвердить оплату?"
  if (action === "dispute") return "Отправить на уточнение?"
  return "Отклонить оплату?"
}

export function paymentReviewDefaultReason(action: "dispute" | "reject") {
  return action === "dispute" ? "Уточнить оплату" : "Не найдено поступление"
}

export function tabForNotification(notification: MobileNotification) {
  const target = `${notification.type} ${notification.link ?? ""}`.toUpperCase()
  if (target.includes("PAYMENT") || target.includes("PAYMENT-REPORT") || target.includes("FINANCE")) return "payments"
  if (target.includes("REQUEST")) return "requests"
  if (target.includes("CONTRACT") || target.includes("DOCUMENT") || target.includes("SIGN")) return "documents"
  if (target.includes("BUILDING") || target.includes("NOTICE")) return "home"
  return null
}

export function openExternalUrl(url: string) {
  const fullUrl = url.startsWith("http") ? url : `https://commrent.kz${url.startsWith("/") ? "" : "/"}${url}`
  return Linking.openURL(fullUrl)
}
