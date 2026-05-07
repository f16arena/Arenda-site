export type MobileRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "FACILITY_MANAGER" | "TENANT" | string

export type MobileMenuItem = {
  key: string
  label: string
  icon: string
  path: string
}

export type MobileBootstrap = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    role?: MobileRole | null
  }
  organization: {
    id: string
    name: string
    slug: string
    isSuspended: boolean
  }
  buildings: Array<{
    id: string
    name: string
    address: string
  }>
  counters: {
    unreadNotifications: number
    activeDevices: number
    pendingSignatures: number
    activeBuildingNotices: number
  }
  menu: MobileMenuItem[]
}

export type MobileTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  refreshExpiresAt: string
}

export type MobileAuthResponse = {
  user: MobileBootstrap["user"] & {
    phone?: string | null
    organizationId?: string | null
  }
  tokens: MobileTokens
}

export type BuildingNotice = {
  id: string
  buildingId: string
  type: string
  severity: string
  title: string
  message: string
  startsAt?: string | null
  endsAt?: string | null
  sentAt?: string | null
  createdAt: string
}

export type MobileTenantSummary = {
  id: string
  companyName: string
  legalType: string
  bin?: string | null
  iin?: string | null
  contractStart?: string | null
  contractEnd?: string | null
  paymentDueDay: number
  placement: string
  area: number
  monthlyRent: number
  ratePerSqm: number
  primaryBuildingId?: string | null
}

export type TenantOverview = {
  tenant: MobileTenantSummary
  buildings: MobileBootstrap["buildings"]
  finances: {
    currentPeriod: string
    paymentPurpose: string
    totalDebt: number
    overdueDebt: number
    nextCharge?: TenantCharge | null
    pendingPaymentReports: {
      count: number
      amount: number
    }
  }
  counters: {
    activeRequests: number
    unreadMessages: number
    meters: number
    pendingDocuments: number
    activeBuildingNotices: number
  }
  actionItems: {
    signatureRequests: TenantSignatureRequest[]
    contractLinks: TenantContractLink[]
  }
  documents: {
    generated: TenantGeneratedDocument[]
    tenant: TenantDocument[]
  }
  notices: BuildingNotice[]
}

export type TenantCharge = {
  id: string
  period: string
  type: string
  amount: number
  description?: string | null
  isPaid?: boolean
  dueDate?: string | null
  createdAt?: string
}

export type TenantPayment = {
  id: string
  amount: number
  paymentDate: string
  method: string
  note?: string | null
  createdAt?: string
}

export type TenantPaymentReport = {
  id: string
  amount: number
  paymentDate: string
  method: string
  status: string
  paymentPurpose?: string | null
  note?: string | null
  receiptName?: string | null
  receiptMime?: string | null
  receiptFileId?: string | null
  receiptUrl?: string | null
  reviewedAt?: string | null
  createdAt: string
}

export type TenantFinances = {
  tenant: MobileTenantSummary
  summary: {
    totalDebt: number
    payableAmount: number
    paymentPurpose: string
    currentPeriod: string
  }
  requisites: {
    recipient: string
    taxIdLabel: string
    taxId: string
    qrText: string
    accounts: Array<{
      label: string
      bank: string
      bik: string
      account: string
      isPrimary: boolean
    }>
  }
  charges: TenantCharge[]
  payments: TenantPayment[]
  paymentReports: TenantPaymentReport[]
}

export type TenantRequest = {
  id: string
  title: string
  description: string
  type: string
  priority: string
  status: string
  createdAt: string
  updatedAt: string
  _count?: { comments: number }
  attachments?: Array<{
    id: string
    fileName: string
    mimeType: string
    url: string
  }>
}

export type TenantRequestsPayload = {
  counters: {
    total: number
    active: number
    waiting: number
    done: number
  }
  data: TenantRequest[]
}

export type TenantMeter = {
  id: string
  type: string
  number: string
  spaceId: string
  hasCurrent: boolean
  previousValue: number
  currentValue?: number | null
  consumption?: number | null
  space: {
    number: string
    floor: {
      name: string
      building: { id: string; name: string; address: string }
    }
  }
  latest?: {
    id: string
    period: string
    value: number
    previous: number
    createdAt: string
  } | null
}

export type TenantMetersPayload = {
  period: string
  spaces: Array<{
    id: string
    number: string
    area: number
    floorName: string
    building: { id: string; name: string; address: string }
  }>
  data: TenantMeter[]
}

export type TenantGeneratedDocument = {
  id: string
  documentType: string
  number?: string | null
  period?: string | null
  totalAmount?: number | null
  fileName: string
  fileSize: number
  format: string
  generatedAt: string
  downloadUrl: string
}

export type TenantDocument = {
  id: string
  type: string
  name: string
  fileUrl?: string | null
  storageFileId?: string | null
  createdAt: string
  downloadUrl?: string | null
}

export type TenantSignatureRequest = {
  id: string
  documentType: string
  documentId?: string | null
  documentRef?: string | null
  title: string
  message?: string | null
  status: string
  allowedMethods?: unknown
  preferredMethod?: string | null
  expiresAt?: string | null
  createdAt: string
}

export type TenantContractLink = {
  id: string
  documentType: string
  documentRef?: string | null
  title: string
  status: string
  webUrl: string
  createdAt?: string | null
}

export type TenantDocumentsPayload = {
  generated: TenantGeneratedDocument[]
  tenantDocuments: TenantDocument[]
  signatureRequests: TenantSignatureRequest[]
  contractLinks: TenantContractLink[]
}

export type MobileContractSummary = {
  id: string
  tenantId: string
  tenantName: string
  number: string
  type: string
  status: string
  startDate?: string | null
  endDate?: string | null
  signedAt?: string | null
  sentAt?: string | null
  webUrl?: string | null
}

export type TenantContractsPayload = {
  counters: {
    total: number
    active: number
    pending: number
    signed: number
    expiringSoon: number
  }
  data: MobileContractSummary[]
}

export type MobileNotification = {
  id: string
  type: string
  title: string
  message: string
  link?: string | null
  isRead: boolean
  createdAt: string
}

export type MobileNotificationsPayload = {
  data: MobileNotification[]
  unreadCount: number
}

export type MobileNotificationEventType = {
  key: string
  label: string
}

export type MobilePushDevice = {
  id: string
  provider: string
  platform: string
  deviceName?: string | null
  appVersion?: string | null
  lastSeenAt: string
  createdAt: string
}

export type MobileNotificationSettings = {
  notifyEmail: boolean
  notifyTelegram: boolean
  notifyInApp: boolean
  notifySms: boolean
  quietHoursEnabled: boolean
  quietFrom: string
  quietTo: string
  mutedTypes: string[]
  eventTypes: MobileNotificationEventType[]
}

export type MobileNotificationSettingsPayload = {
  settings: MobileNotificationSettings
  devices: MobilePushDevice[]
}

export type MobileSessionInfo = {
  id: string
  deviceId?: string | null
  deviceName?: string | null
  platform?: string | null
  appVersion?: string | null
  ip?: string | null
  expiresAt: string
  refreshExpiresAt: string
  lastUsedAt: string
  createdAt: string
}

export type MobileSessionsPayload = {
  data: MobileSessionInfo[]
}

export type AdminTodayPayload = {
  buildings: MobileBootstrap["buildings"]
  counters: {
    openRequests: number
    todayRequests: number
    urgentRequests: number
    activeTasks: number
    activeNotices: number
    pendingSignatures: number
    pendingPayments: number
    pendingPaymentsAmount: number
    overdueCharges: number
    overdueAmount: number
  }
  recent: {
    requests: AdminRequest[]
    paymentReports: AdminPaymentReport[]
  }
}

export type AdminRequest = TenantRequest & {
  tenant: {
    id: string
    companyName: string
    userId?: string
    space?: {
      number: string
      floor: { name: string; building: { id: string; name: string } }
    } | null
    tenantSpaces?: Array<{
      space: {
        number: string
        floor: { name: string; building: { id: string; name: string } }
      }
    }>
  }
}

export type AdminRequestsPayload = {
  counters: {
    total: number
    open: number
    urgent: number
    done: number
  }
  data: AdminRequest[]
}

export type AdminPaymentReport = TenantPaymentReport & {
  tenant: {
    id: string
    companyName: string
    userId?: string
  }
}

export type AdminPaymentReportsPayload = {
  counters: {
    total: number
    pending: number
    disputed: number
    amount: number
  }
  data: AdminPaymentReport[]
}

export type AdminBuildingsPayload = {
  data: Array<MobileBootstrap["buildings"][number] & {
    counters: {
      tenants: number
      debtAmount: number
      debtCharges: number
      openRequests: number
      openTasks: number
      activeNotices: number
    }
  }>
}

export type AdminTenantListItem = {
  id: string
  companyName: string
  legalType: string
  bin?: string | null
  iin?: string | null
  category?: string | null
  paymentDueDay: number
  contact: {
    name?: string | null
    phone?: string | null
    email?: string | null
  }
  placement: string
  area: number
  monthlyRent: number
  totalDebt: number
  overdueDebt: number
  activeRequests: number
  documents: number
  contractStart?: string | null
  contractEnd?: string | null
  contracts: {
    total: number
    active: number
    signed: number
    expiringSoon: number
  }
}

export type AdminTenantsPayload = {
  counters: {
    total: number
    withDebt: number
    debtAmount: number
    expiringContracts: number
  }
  data: AdminTenantListItem[]
  pageInfo: {
    limit: number
    offset: number
    nextOffset?: number | null
    hasMore: boolean
  }
}

export type AdminContractsPayload = {
  counters: {
    total: number
    draft: number
    sent: number
    signed: number
    expiringSoon: number
  }
  data: MobileContractSummary[]
}

export type MobileGeneratedDocumentSummary = {
  id: string
  tenantId?: string | null
  tenantName: string
  documentType: string
  number?: string | null
  period?: string | null
  totalAmount?: number | null
  fileName: string
  fileSize: number
  format: string
  generatedAt: string
  downloadUrl: string
}

export type AdminDocumentsPayload = {
  counters: {
    total: number
    contracts: number
    invoices: number
    acts: number
    reconciliations: number
    pendingSignatures: number
  }
  contracts: MobileContractSummary[]
  generated: MobileGeneratedDocumentSummary[]
  signatureRequests: TenantSignatureRequest[]
  pageInfo: {
    limit: number
    offset: number
    nextOffset?: number | null
    hasMore: boolean
  }
}

export type OwnerOverviewPayload = {
  organization: MobileBootstrap["organization"]
  counters: {
    buildings: number
    tenants: number
    totalDebt: number
    totalDebtCharges: number
    overdueDebt: number
    overdueCharges: number
    paymentsMonth: number
    paymentsMonthCount: number
    openRequests: number
    pendingPayments: number
    pendingPaymentsAmount: number
    expiringContracts: number
    pendingSignatures: number
    generatedDocsMonth: number
  }
  buildings: Array<MobileBootstrap["buildings"][number] & {
    tenants: number
    debtAmount: number
    openRequests: number
  }>
}

export type PickedUploadFile = {
  uri: string
  name: string
  mimeType: string
}
