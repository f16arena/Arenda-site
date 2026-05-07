import { db } from "@/lib/db"
import { getLoginIdentifiers } from "@/lib/contact-validation"
import bcrypt from "bcryptjs"
import crypto from "crypto"

const ACCESS_TTL_MS = 15 * 60_000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000

export type MobileAuthUser = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  organizationId: string
  isPlatformOwner: boolean
}

type DeviceMeta = {
  deviceId?: string | null
  deviceName?: string | null
  platform?: string | null
  appVersion?: string | null
  userAgent?: string | null
  ip?: string | null
}

export class MobileAuthError extends Error {
  constructor(
    message: string,
    public status = 401,
    public code = "MOBILE_AUTH_ERROR",
  ) {
    super(message)
    this.name = "MobileAuthError"
  }
}

export async function verifyMobileCredentials(input: {
  login: string
  password: string
  totp?: string
}) {
  const identifiers = getLoginIdentifiers(input.login)
  if (identifiers.length === 0) {
    throw new MobileAuthError("Invalid credentials", 401, "INVALID_CREDENTIALS")
  }

  const user = await db.user.findFirst({
    where: {
      OR: identifiers.flatMap((identifier) => [
        { phone: identifier },
        { email: identifier },
      ]),
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      password: true,
      role: true,
      organizationId: true,
      isPlatformOwner: true,
      totpSecret: true,
      totpEnabledAt: true,
    },
  })

  if (!user || !user.organizationId) {
    throw new MobileAuthError("Invalid credentials", 401, "INVALID_CREDENTIALS")
  }

  const passwordOk = await bcrypt.compare(input.password, user.password)
  if (!passwordOk) {
    throw new MobileAuthError("Invalid credentials", 401, "INVALID_CREDENTIALS")
  }

  if (user.totpEnabledAt && user.totpSecret) {
    const code = input.totp?.trim()
    if (!code) throw new MobileAuthError("Two-factor code required", 401, "TOTP_REQUIRED")

    const { verifyTotpForLogin } = await import("@/app/actions/two-factor")
    const ok = await verifyTotpForLogin(user.id, code)
    if (!ok) throw new MobileAuthError("Invalid two-factor code", 401, "TOTP_INVALID")
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    organizationId: user.organizationId,
    isPlatformOwner: user.isPlatformOwner,
  } satisfies MobileAuthUser
}

export async function createMobileSession(user: MobileAuthUser, meta: DeviceMeta = {}) {
  const accessToken = createToken("mat")
  const refreshToken = createToken("mrt")
  const now = Date.now()
  const expiresAt = new Date(now + ACCESS_TTL_MS)
  const refreshExpiresAt = new Date(now + REFRESH_TTL_MS)

  await db.mobileSession.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      deviceId: clean(meta.deviceId, 120),
      deviceName: clean(meta.deviceName, 120),
      platform: clean(meta.platform, 20),
      appVersion: clean(meta.appVersion, 40),
      userAgent: clean(meta.userAgent, 300),
      ip: clean(meta.ip, 80),
      expiresAt,
      refreshExpiresAt,
      lastUsedAt: new Date(),
    },
  })

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  }
}

export async function verifyMobileBearer(req: Request) {
  const token = getBearerToken(req)
  if (!token) return null

  const session = await db.mobileSession.findUnique({
    where: { accessTokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      expiresAt: true,
      revokedAt: true,
    },
  }).catch(() => null)

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null

  const [user, org] = await Promise.all([
    db.user.findFirst({
      where: {
        id: session.userId,
        organizationId: session.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        organizationId: true,
        isPlatformOwner: true,
      },
    }),
    db.organization.findUnique({
      where: { id: session.organizationId },
      select: { id: true, name: true, slug: true, isActive: true, isSuspended: true },
    }),
  ])

  if (!user?.organizationId || !org?.isActive) return null

  await db.mobileSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return { sessionId: session.id, user, org }
}

export async function refreshMobileSession(refreshToken: string, meta: DeviceMeta = {}) {
  const session = await db.mobileSession.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      refreshExpiresAt: true,
      revokedAt: true,
    },
  }).catch(() => null)

  if (!session || session.revokedAt || session.refreshExpiresAt < new Date()) {
    throw new MobileAuthError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN")
  }

  const user = await db.user.findFirst({
    where: {
      id: session.userId,
      organizationId: session.organizationId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      organizationId: true,
      isPlatformOwner: true,
    },
  })

  if (!user?.organizationId) {
    throw new MobileAuthError("User is not active", 401, "USER_INACTIVE")
  }

  const accessToken = createToken("mat")
  const nextRefreshToken = createToken("mrt")
  const now = Date.now()
  const expiresAt = new Date(now + ACCESS_TTL_MS)
  const refreshExpiresAt = new Date(now + REFRESH_TTL_MS)

  await db.mobileSession.update({
    where: { id: session.id },
    data: {
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(nextRefreshToken),
      expiresAt,
      refreshExpiresAt,
      deviceId: clean(meta.deviceId, 120),
      deviceName: clean(meta.deviceName, 120),
      platform: clean(meta.platform, 20),
      appVersion: clean(meta.appVersion, 40),
      userAgent: clean(meta.userAgent, 300),
      ip: clean(meta.ip, 80),
      lastUsedAt: new Date(),
    },
  })

  return {
    user: {
      ...user,
      organizationId: user.organizationId,
    } satisfies MobileAuthUser,
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresAt: expiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    },
  }
}

export async function revokeMobileSessionByBearer(req: Request) {
  const token = getBearerToken(req)
  if (!token) return

  await db.mobileSession.updateMany({
    where: {
      accessTokenHash: hashToken(token),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

export async function revokeMobileSessionByRefresh(refreshToken: string) {
  await db.mobileSession.updateMany({
    where: {
      refreshTokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

export function getRequestMeta(req: Request): DeviceMeta {
  const headers = req.headers
  return {
    userAgent: headers.get("user-agent"),
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? headers.get("x-real-ip"),
  }
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function createToken(prefix: string) {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function clean(value: string | null | undefined, max: number) {
  const text = value?.trim()
  return text ? text.slice(0, max) : null
}
