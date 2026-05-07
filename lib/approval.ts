export const APPROVAL_APPROVED = "APPROVED"
export const APPROVAL_PENDING = "PENDING_APPROVAL"
export const APPROVAL_REJECTED = "REJECTED"
export const APPROVAL_SUSPENDED = "SUSPENDED"

export const APPROVAL_STATUSES = [
  APPROVAL_APPROVED,
  APPROVAL_PENDING,
  APPROVAL_REJECTED,
  APPROVAL_SUSPENDED,
] as const

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export function normalizeApprovalStatus(value: string | null | undefined): ApprovalStatus {
  return APPROVAL_STATUSES.includes(value as ApprovalStatus)
    ? (value as ApprovalStatus)
    : APPROVAL_APPROVED
}

export function isApproved(value: string | null | undefined): boolean {
  return normalizeApprovalStatus(value) === APPROVAL_APPROVED
}

export function approvalLabel(value: string | null | undefined): string {
  switch (normalizeApprovalStatus(value)) {
    case APPROVAL_PENDING:
      return "Ожидает подтверждения"
    case APPROVAL_REJECTED:
      return "Отклонено"
    case APPROVAL_SUSPENDED:
      return "Приостановлено"
    case APPROVAL_APPROVED:
    default:
      return "Подтверждено"
  }
}

export function approvalTone(value: string | null | undefined): "emerald" | "amber" | "red" | "slate" {
  switch (normalizeApprovalStatus(value)) {
    case APPROVAL_PENDING:
      return "amber"
    case APPROVAL_REJECTED:
      return "red"
    case APPROVAL_SUSPENDED:
      return "slate"
    case APPROVAL_APPROVED:
    default:
      return "emerald"
  }
}

export function loginBlockReason({
  userStatus,
  orgStatus,
  userRejectionReason,
  orgRejectionReason,
}: {
  userStatus?: string | null
  orgStatus?: string | null
  userRejectionReason?: string | null
  orgRejectionReason?: string | null
}): string | null {
  const normalizedUser = normalizeApprovalStatus(userStatus)
  const normalizedOrg = normalizeApprovalStatus(orgStatus)

  if (normalizedUser === APPROVAL_PENDING) {
    return "Ваш аккаунт ожидает подтверждения владельцем. После подтверждения вы сможете войти."
  }
  if (normalizedUser === APPROVAL_REJECTED) {
    return userRejectionReason
      ? `Ваш аккаунт отклонен. Причина: ${userRejectionReason}`
      : "Ваш аккаунт отклонен. Обратитесь к владельцу организации."
  }
  if (normalizedOrg === APPROVAL_PENDING) {
    return "Заявка организации ожидает подтверждения суперадмином. Пробный период начнется после подтверждения."
  }
  if (normalizedOrg === APPROVAL_REJECTED) {
    return orgRejectionReason
      ? `Заявка организации отклонена. Причина: ${orgRejectionReason}`
      : "Заявка организации отклонена. Обратитесь в поддержку Commrent."
  }
  if (normalizedUser === APPROVAL_SUSPENDED || normalizedOrg === APPROVAL_SUSPENDED) {
    return "Доступ приостановлен. Обратитесь к администратору."
  }

  return null
}
