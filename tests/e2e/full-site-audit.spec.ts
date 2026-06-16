import "dotenv/config"
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test"
import { encode } from "next-auth/jwt"
import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Pool } from "pg"

type Severity = "error" | "warning" | "info"

type Issue = {
  severity: Severity
  area: string
  page?: string
  message: string
  detail?: string
}

type PageCheck = {
  url: string
  finalUrl: string
  status: number | null
  title: string
  links: number
  buttons: number
  summaries: number
}

type PageAuditResult = PageCheck & {
  discoveredLinks: LinkInfo[]
}

type LinkInfo = {
  href: string
  rawHref: string
  text: string
  target: string
}

type Report = {
  checkedAt: string
  baseURL: string
  routes: {
    publicStatic: string[]
    protectedStatic: string[]
    skippedDynamic: string[]
  }
  pages: PageCheck[]
  issues: Issue[]
  auth: {
    admin: AuthResult
    tenant: AuthResult
  }
}

type AuthResult = {
  attempted: boolean
  authenticated: boolean
  pagesChecked: number
  message?: string
}

type AuthFixtureUser = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: string
  isActive: boolean
  isPlatformOwner: boolean
  organizationId: string | null
  organization: { slug: string } | null
}

const protectedPrefixes = ["/admin", "/cabinet", "/superadmin"]
const staticAssetPattern = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|txt|xml|json|webmanifest|css|js|map|woff2?|ttf|otf)$/i
const unsafeButtonPattern = /delete|remove|save|create|submit|confirm|approve|reject|cancel|archive|wipe|reset|send|generate|import|export|pay|charge|sign|logout|удал|сохран|созда|подтверд|отклон|отмен|архив|очист|сброс|отправ|сгенер|импорт|экспорт|оплат|начисл|подпис|выйти/i

function isProtectedRoute(route: string) {
  return protectedPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
}

function routeFromPageFile(appDir: string, filePath: string) {
  const relativeDir = path.relative(appDir, path.dirname(filePath))
  const segments = relativeDir === "" ? [] : relativeDir.split(path.sep)
  const routeSegments: string[] = []

  for (const segment of segments) {
    if (segment.startsWith("(") && segment.endsWith(")")) continue
    if (segment.startsWith("@")) return null
    if (segment.startsWith("[") && segment.endsWith("]")) return null
    routeSegments.push(segment)
  }

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`
}

function collectPageFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectPageFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name === "page.tsx") {
      files.push(entryPath)
    }
  }

  return files
}

function collectRoutes() {
  const appDir = path.join(process.cwd(), "app")
  const publicStatic: string[] = []
  const protectedStatic: string[] = []
  const skippedDynamic: string[] = []

  for (const filePath of collectPageFiles(appDir)) {
    const route = routeFromPageFile(appDir, filePath)
    if (!route) {
      skippedDynamic.push(path.relative(appDir, filePath).replaceAll(path.sep, "/"))
      continue
    }
    if (isProtectedRoute(route)) protectedStatic.push(route)
    else publicStatic.push(route)
  }

  return {
    publicStatic: [...new Set(publicStatic)].sort((a, b) => a.localeCompare(b)),
    protectedStatic: [...new Set(protectedStatic)].sort((a, b) => a.localeCompare(b)),
    skippedDynamic: skippedDynamic.sort((a, b) => a.localeCompare(b)),
  }
}

function collectBrowserErrors(page: Page, issues: Issue[], pageLabel: string) {
  page.removeAllListeners("pageerror")
  page.removeAllListeners("console")

  page.on("pageerror", (error) => {
    issues.push({
      severity: "error",
      area: "browser",
      page: pageLabel,
      message: "Unhandled page exception",
      detail: error.message,
    })
  })

  page.on("console", (message) => {
    const text = message.text()
    const isNextDevHmrNoise = text.includes("/_next/webpack-hmr") && text.includes("WebSocket connection")
    const isFaviconNoise = text.includes("favicon.ico") && text.includes("404")

    if (message.type() === "error" && !isNextDevHmrNoise && !isFaviconNoise) {
      issues.push({
        severity: "error",
        area: "browser",
        page: pageLabel,
        message: "Console error",
        detail: text,
      })
    }
  })
}

async function getLinks(page: Page): Promise<LinkInfo[]> {
  return page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const element = anchor as HTMLAnchorElement
      return {
        href: element.href,
        rawHref: element.getAttribute("href") ?? "",
        text: (element.innerText || element.textContent || "").trim().slice(0, 120),
        target: element.target,
      }
    }),
  )
}

async function auditImages(page: Page, issues: Issue[], pageLabel: string) {
  const images = await page.locator("img").evaluateAll((elements) =>
    elements.map((image) => {
      const element = image as HTMLImageElement
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        src: element.currentSrc || element.src || element.getAttribute("src") || "",
        alt: element.getAttribute("alt") || "",
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        loading: element.loading,
        visibleInViewport:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth &&
          style.visibility !== "hidden" &&
          style.display !== "none",
      }
    }),
  )

  for (const image of images) {
    if (!image.src || image.src.startsWith("data:") || image.src.startsWith("blob:")) continue

    const lazyOffscreen = image.loading === "lazy" && !image.visibleInViewport
    if (!lazyOffscreen && (!image.complete || image.naturalWidth === 0)) {
      issues.push({
        severity: "error",
        area: "images",
        page: pageLabel,
        message: "Visible image did not render",
        detail: `${image.src} alt="${image.alt}"`,
      })
    }

    const response = await page.request.get(image.src, { failOnStatusCode: false, timeout: 10_000 }).catch((error) => {
      issues.push({
        severity: "error",
        area: "images",
        page: pageLabel,
        message: "Image request failed",
        detail: `${image.src}: ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    })

    if (response && response.status() >= 400) {
      issues.push({
        severity: "error",
        area: "images",
        page: pageLabel,
        message: "Image returned an error status",
        detail: `${image.src}: status=${response.status()} alt="${image.alt}"`,
      })
    }
  }
}

async function auditAnchors(page: Page, links: LinkInfo[], issues: Issue[], pageLabel: string) {
  for (const link of links) {
    if (!link.rawHref.startsWith("#")) continue
    const hash = link.rawHref.slice(1)
    if (!hash) continue

    const exists = await page.evaluate((value) => {
      const decoded = decodeURIComponent(value)
      return !!document.getElementById(decoded) || !!document.querySelector(`[name="${CSS.escape(decoded)}"]`)
    }, hash)

    if (!exists) {
      issues.push({
        severity: "error",
        area: "links",
        page: pageLabel,
        message: "Anchor target is missing",
        detail: link.rawHref,
      })
    }
  }
}

async function auditButtons(page: Page, issues: Issue[], pageLabel: string) {
  const buttons = await page.locator('button, input[type="button"], input[type="submit"], input[type="reset"]').evaluateAll((elements) =>
    elements.map((element) => {
      const htmlElement = element as HTMLElement
      const input = element as HTMLInputElement
      const label = (
        htmlElement.innerText ||
        htmlElement.textContent ||
        input.value ||
        htmlElement.getAttribute("aria-label") ||
        htmlElement.getAttribute("title") ||
        ""
      ).trim()
      const rect = htmlElement.getBoundingClientRect()
      const style = window.getComputedStyle(htmlElement)
      return {
        label,
        type: input.type || htmlElement.getAttribute("type") || "button",
        html: htmlElement.outerHTML.replace(/\s+/g, " ").slice(0, 240),
        disabled: (element as HTMLButtonElement).disabled || htmlElement.getAttribute("aria-disabled") === "true",
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
      }
    }),
  )

  for (const button of buttons) {
    if (button.visible && !button.label) {
      issues.push({
        severity: "warning",
        area: "buttons",
        page: pageLabel,
        message: "Visible button has no accessible text, aria-label, value, or title",
        detail: `type=${button.type}; html=${button.html}`,
      })
    }
  }

  return buttons.filter((button) => button.visible).length
}

async function clickSafePublicControls(page: Page, issues: Issue[], pageLabel: string) {
  const summaryResult = await page.locator("details > summary").evaluateAll((summaries) =>
    summaries.map((summary) => {
      const details = summary.closest("details")
      const label = (summary.textContent ?? "").trim().slice(0, 120)
      if (!details) return { label, ok: false }
      summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      const opened = details.open
      summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      return { label, ok: opened && !details.open }
    }),
  )

  for (const result of summaryResult) {
    if (!result.ok) {
      issues.push({
        severity: "error",
        area: "buttons",
        page: pageLabel,
        message: "Disclosure control did not open and close correctly",
        detail: result.label,
      })
    }
  }

  const safeButtons = await page.locator('button:not([type="submit"]):not([disabled])').evaluateAll((buttons) =>
    buttons
      .map((button, index) => {
        const element = button as HTMLButtonElement
        const label = (element.innerText || element.getAttribute("aria-label") || element.title || "").trim()
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        const form = element.closest("form")
        return {
          index,
          label,
          clickable:
            !form &&
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
        }
      })
      .filter((button) => button.clickable),
  )

  for (const button of safeButtons.slice(0, 12)) {
    if (unsafeButtonPattern.test(button.label)) continue
    const beforeUrl = page.url()
    await page.locator('button:not([type="submit"]):not([disabled])').nth(button.index).click({ timeout: 2_000 }).catch((error) => {
      issues.push({
        severity: "warning",
        area: "buttons",
        page: pageLabel,
        message: "Safe-looking button could not be clicked",
        detail: `${button.label || "(empty label)"}: ${error instanceof Error ? error.message : String(error)}`,
      })
    })
    if (page.url() !== beforeUrl) await page.goto(beforeUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined)
  }
}

async function auditPage(page: Page, route: string, issues: Issue[], options: { expectedRedirectToLogin?: boolean; publicInteractions?: boolean } = {}) {
  collectBrowserErrors(page, issues, route)
  const response = await page.goto(route, { waitUntil: "domcontentloaded" }).catch((error) => {
    issues.push({
      severity: "error",
      area: "navigation",
      page: route,
      message: "Navigation failed",
      detail: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined)

  const finalUrl = page.url()
  const status = response?.status() ?? null
  const title = await page.title().catch(() => "")
  const links = await getLinks(page).catch(() => [])
  const buttonCount = await auditButtons(page, issues, route).catch((error) => {
    issues.push({
      severity: "warning",
      area: "buttons",
      page: route,
      message: "Button audit failed",
      detail: error instanceof Error ? error.message : String(error),
    })
    return 0
  })

  if (status !== null && status >= 500) {
    issues.push({
      severity: "error",
      area: "navigation",
      page: route,
      message: "Page returned server error",
      detail: `status=${status}`,
    })
  }

  if (options.expectedRedirectToLogin) {
    const finalPath = new URL(finalUrl).pathname
    if (finalPath !== "/login") {
      issues.push({
        severity: "error",
        area: "auth",
        page: route,
        message: "Anonymous protected route did not redirect to /login",
        detail: finalUrl,
      })
    }
  }

  await auditImages(page, issues, route).catch((error) => {
    issues.push({
      severity: "warning",
      area: "images",
      page: route,
      message: "Image audit failed",
      detail: error instanceof Error ? error.message : String(error),
    })
  })
  await auditAnchors(page, links, issues, route)
  if (options.publicInteractions) await clickSafePublicControls(page, issues, route)

  return {
    url: route,
    finalUrl,
    status,
    title,
    links: links.length,
    buttons: buttonCount,
    summaries: await page.locator("details > summary").count().catch(() => 0),
    discoveredLinks: links,
  } satisfies PageAuditResult
}

function normalizeInternalUrl(raw: string, baseURL: string) {
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:") || raw.startsWith("blob:")) {
    return null
  }

  const base = new URL(baseURL)
  const url = new URL(raw, base)
  if (staticAssetPattern.test(url.pathname)) return null
  return url
}

async function checkDiscoveredLinks(page: Page, links: LinkInfo[], baseURL: string, issues: Issue[], source: string) {
  const internal = new Set<string>()
  const external = new Set<string>()
  const base = new URL(baseURL)

  for (const link of links) {
    const url = normalizeInternalUrl(link.href || link.rawHref, baseURL)
    if (!url) continue
    if (url.origin === base.origin) {
      if (url.hash && !url.pathname) continue
      internal.add(`${url.pathname}${url.search}`)
    } else if (url.protocol === "http:" || url.protocol === "https:") {
      external.add(url.href)
    }
  }

  for (const url of internal) {
    const response = await page.request.get(url, { failOnStatusCode: false, maxRedirects: 5, timeout: 10_000 }).catch((error) => {
      issues.push({
        severity: "error",
        area: "links",
        page: source,
        message: "Internal link request failed",
        detail: `${url}: ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    })
    const status = response?.status()
    if (status && status >= 500) {
      issues.push({
        severity: "error",
        area: "links",
        page: source,
        message: "Internal link returned server error",
        detail: `${url}: status=${status}`,
      })
    } else if (status && status >= 400) {
      issues.push({
        severity: "warning",
        area: "links",
        page: source,
        message: "Internal link returned client error",
        detail: `${url}: status=${status}`,
      })
    }
  }

  for (const url of [...external].slice(0, 20)) {
    const response = await page.request.get(url, { failOnStatusCode: false, maxRedirects: 5, timeout: 10_000 }).catch((error) => {
      issues.push({
        severity: "warning",
        area: "links",
        page: source,
        message: "External link request failed",
        detail: `${url}: ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    })
    const status = response?.status()
    if (status && status >= 400) {
      issues.push({
        severity: "warning",
        area: "links",
        page: source,
        message: "External link returned an error",
        detail: `${url}: status=${status}`,
      })
    }
  }
}

async function auditProtectedRedirects(request: APIRequestContext, routes: string[], issues: Issue[]) {
  const checks: PageCheck[] = []

  for (const route of routes) {
    const response = await request.get(route, { failOnStatusCode: false, maxRedirects: 5, timeout: 8_000 }).catch((error) => {
      issues.push({
        severity: "error",
        area: "auth",
        page: route,
        message: "Anonymous protected route request failed",
        detail: error instanceof Error ? error.message : String(error),
      })
      return null
    })

    const status = response?.status() ?? null
    const finalUrl = response?.url() ?? route
    checks.push({
      url: route,
      finalUrl,
      status,
      title: "",
      links: 0,
      buttons: 0,
      summaries: 0,
    })

    if (status !== null && status >= 500) {
      issues.push({
        severity: "error",
        area: "auth",
        page: route,
        message: "Anonymous protected route returned server error",
        detail: `status=${status}`,
      })
    }

    const finalPath = new URL(finalUrl, "http://127.0.0.1").pathname
    if (finalPath !== "/login") {
      issues.push({
        severity: "error",
        area: "auth",
        page: route,
        message: "Anonymous protected route did not redirect to /login",
        detail: finalUrl,
      })
    }
  }

  return checks
}

async function exercisePublicForms(page: Page, issues: Issue[]) {
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.locator('input[name="login"]').fill("wrong@example.test")
  await page.locator('input[name="password"]').fill("wrong-password")
  await page.locator('button[type="submit"]').click()
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined)

  if (new URL(page.url()).pathname !== "/login") {
    issues.push({
      severity: "error",
      area: "forms",
      page: "/login",
      message: "Invalid login attempt left the login page unexpectedly",
      detail: page.url(),
    })
  }

  const loginErrorVisible = await page.locator(".text-red-700, .text-red-300, [role='alert']").count().catch(() => 0)
  if (!loginErrorVisible) {
    issues.push({
      severity: "warning",
      area: "forms",
      page: "/login",
      message: "Invalid login did not show a visible validation or auth error",
    })
  }

  await page.goto("/signup", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined)
  await page.locator('input[name="companyName"]').click()
  await page.locator('input[name="companyName"]').pressSequentially("Audit Test Company")
  await page.locator('input[name="ownerName"]').click()
  await page.waitForTimeout(250)
  const hiddenSlug = await page.locator('input[name="slug"]').inputValue().catch(() => "")
  if (hiddenSlug !== "audit-test-company") {
    issues.push({
      severity: "error",
      area: "forms",
      page: "/signup",
      message: "Organization name did not auto-generate the workspace slug",
      detail: `expected audit-test-company, received ${hiddenSlug || "(empty)"}`,
    })
  }

  await page.locator('input[placeholder="bc-almaty"]').fill("")
  await page.locator('input[placeholder="bc-almaty"]').pressSequentially("audit-test-company")
  await page.locator('input[name="ownerName"]').click()
  await page.waitForTimeout(250)
  const manualSlug = await page.locator('input[name="slug"]').inputValue().catch(() => "")
  if (manualSlug !== "audit-test-company") {
    issues.push({
      severity: "error",
      area: "forms",
      page: "/signup",
      message: "Manual workspace slug edit did not update the hidden submitted slug field",
      detail: `expected audit-test-company, received ${manualSlug || "(empty)"}`,
    })
  }
  await page.locator('input[name="ownerName"]').fill("Audit User")
  await page.locator('input[name="ownerEmail"]').fill("audit@example.test")
  await page.locator('input[name="ownerPhone"]').fill("+77000009999")
  await page.locator('input[name="password"]').fill("audit-password-123")
  await page.locator('input[name="acceptedTerms"]').check()
  await expect(page.locator('input[name="acceptedTerms"]')).toBeChecked()
}

async function tryLogin(browser: Browser, baseURL: string, loginValue: string, password: string): Promise<{ page: Page; result: AuthResult }> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const result: AuthResult = { attempted: true, authenticated: false, pagesChecked: 0 }

  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.locator('input[name="login"]').fill(loginValue)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click().catch(() => undefined)
  await page.waitForTimeout(2_000)

  const cookies = await context.cookies(baseURL)
  result.authenticated = cookies.some((cookie) => cookie.name.includes("session-token"))
  result.message = result.authenticated ? "Session cookie received" : "No session cookie received"

  if (!result.authenticated) {
    const fixtureUser = await findAuthFixtureUser(loginValue).catch(() => null)
    if (!fixtureUser) {
      result.message = "No session cookie received; fixture user was not found"
      return { page, result }
    }

    const seeded = await seedSessionCookie(context, baseURL, fixtureUser).catch((error) => {
      result.message = `No session cookie received; session fallback failed: ${error instanceof Error ? error.message : String(error)}`
      return false
    })

    if (seeded) {
      const seededCookies = await context.cookies(baseURL)
      result.authenticated = seededCookies.some((cookie) => cookie.name.includes("session-token"))
      result.message = result.authenticated
        ? `Seeded session cookie for ${fixtureUser.role}${fixtureUser.isActive ? "" : " fixture (UI login blocked because user is inactive)"}`
        : "Session fallback did not create a cookie"
    }
  }

  return { page, result }
}

async function findAuthFixtureUser(loginValue: string): Promise<AuthFixtureUser | null> {
  if (!process.env.DATABASE_URL) return null

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 30_000,
  })

  try {
    const result = await pool.query<{
      id: string
      name: string | null
      email: string | null
      phone: string | null
      role: string
      isActive: boolean
      isPlatformOwner: boolean
      organizationId: string | null
      organizationSlug: string | null
    }>(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.is_active AS "isActive",
        u.is_platform_owner AS "isPlatformOwner",
        u.organization_id AS "organizationId",
        o.slug AS "organizationSlug"
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.phone = $1 OR lower(u.email) = lower($1)
      LIMIT 1`,
      [loginValue],
    )

    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isActive: row.isActive,
      isPlatformOwner: row.isPlatformOwner,
      organizationId: row.organizationId,
      organization: row.organizationSlug ? { slug: row.organizationSlug } : null,
    }
  } finally {
    await pool.end().catch(() => undefined)
  }
}

async function seedSessionCookie(context: BrowserContext, baseURL: string, user: AuthFixtureUser) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is missing")

  const cookieName = process.env.NODE_ENV === "production"
    ? "__Secure-commrent.session-token"
    : "commrent.session-token"
  const maxAge = 60 * 60
  const value = await encode({
    secret,
    salt: cookieName,
    maxAge,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name ?? undefined,
      email: user.email ?? undefined,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformOwner: user.isPlatformOwner,
    },
  })

  await context.addCookies([{
    name: cookieName,
    value,
    url: baseURL,
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
    expires: Math.floor(Date.now() / 1000) + maxAge,
  }])

  return true
}

async function crawlAuthenticated(page: Page, roots: string[], allowedPrefixes: string[], issues: Issue[], limit = 90) {
  const queue = [...roots]
  const seen = new Set<string>()
  const checked: PageCheck[] = []

  while (queue.length > 0 && checked.length < limit) {
    const route = queue.shift()!
    if (seen.has(route)) continue
    seen.add(route)

    const result = await auditPage(page, route, issues)
    checked.push(result)

    for (const link of result.discoveredLinks) {
      const normalized = normalizeInternalUrl(link.href || link.rawHref, page.url())
      if (!normalized) continue
      const nextRoute = `${normalized.pathname}${normalized.search}`
      if (normalized.origin !== new URL(page.url()).origin) continue
      if (!allowedPrefixes.some((prefix) => nextRoute === prefix || nextRoute.startsWith(`${prefix}/`))) continue
      if (!seen.has(nextRoute) && !queue.includes(nextRoute)) queue.push(nextRoute)
    }
  }

  return checked
}

function writeReport(report: Report, testInfo: TestInfo) {
  const outputDir = testInfo.outputDir
  mkdirSync(outputDir, { recursive: true })

  const bySeverity = (severity: Severity) => report.issues.filter((issue) => issue.severity === severity)
  const markdown = [
    "# Full Site Audit",
    "",
    `Checked at: ${report.checkedAt}`,
    `Base URL: ${report.baseURL}`,
    "",
    "## Summary",
    "",
    `- Public static routes: ${report.routes.publicStatic.length}`,
    `- Protected static routes: ${report.routes.protectedStatic.length}`,
    `- Pages checked: ${report.pages.length}`,
    `- Errors: ${bySeverity("error").length}`,
    `- Warnings: ${bySeverity("warning").length}`,
    `- Admin auth: ${report.auth.admin.message ?? "not attempted"}`,
    `- Tenant auth: ${report.auth.tenant.message ?? "not attempted"}`,
    "",
    "## Issues",
    "",
    ...report.issues.map((issue) => (
      `- [${issue.severity.toUpperCase()}] ${issue.area}${issue.page ? ` ${issue.page}` : ""}: ${issue.message}${issue.detail ? ` (${issue.detail})` : ""}`
    )),
    report.issues.length ? "" : "No issues found.",
  ].join("\n")

  writeFileSync(path.join(outputDir, "full-site-audit.json"), JSON.stringify(report, null, 2))
  writeFileSync(path.join(outputDir, "full-site-audit.md"), markdown)
}

test("full site navigation, links, and safe controls audit", async ({ browser, page, baseURL }, testInfo) => {
  test.setTimeout(420_000)
  const routes = collectRoutes()
  const issues: Issue[] = []
  const pageChecks: PageAuditResult[] = []
  const discoveredLinks: LinkInfo[] = []
  const rootURL = baseURL ?? "http://127.0.0.1:3000"

  for (const route of routes.publicStatic) {
    const result = await auditPage(page, route, issues, { publicInteractions: true })
    pageChecks.push(result)
    discoveredLinks.push(...result.discoveredLinks)
  }

  await exercisePublicForms(page, issues)
  await checkDiscoveredLinks(page, discoveredLinks, rootURL, issues, "public routes")

  pageChecks.push(...(await auditProtectedRedirects(page.request, routes.protectedStatic, issues)).map((check) => ({ ...check, discoveredLinks: [] })))

  const adminAuth = await tryLogin(
    browser,
    rootURL,
    process.env.E2E_ADMIN_LOGIN ?? "+77000000002",
    process.env.E2E_ADMIN_PASSWORD ?? "admin123",
  )
  if (adminAuth.result.authenticated) {
    const checks = await crawlAuthenticated(adminAuth.page, ["/admin"], ["/admin"], issues)
    adminAuth.result.pagesChecked = checks.length
    pageChecks.push(...checks)
  }
  await adminAuth.page.context().close()

  const tenantAuth = await tryLogin(
    browser,
    rootURL,
    process.env.E2E_TENANT_LOGIN ?? "+77111111111",
    process.env.E2E_TENANT_PASSWORD ?? "tenant123",
  )
  if (tenantAuth.result.authenticated) {
    const checks = await crawlAuthenticated(tenantAuth.page, ["/cabinet"], ["/cabinet"], issues)
    tenantAuth.result.pagesChecked = checks.length
    pageChecks.push(...checks)
  }
  await tenantAuth.page.context().close()

  const report: Report = {
    checkedAt: new Date().toISOString(),
    baseURL: rootURL,
    routes,
    pages: pageChecks.map(({ discoveredLinks: _discoveredLinks, ...check }) => check),
    issues,
    auth: {
      admin: adminAuth.result,
      tenant: tenantAuth.result,
    },
  }

  writeReport(report, testInfo)

  const errors = issues.filter((issue) => issue.severity === "error")
  expect(errors, `Full site audit errors:\n${errors.map((issue) => `${issue.area} ${issue.page ?? ""}: ${issue.message} ${issue.detail ?? ""}`).join("\n")}`).toEqual([])
})
