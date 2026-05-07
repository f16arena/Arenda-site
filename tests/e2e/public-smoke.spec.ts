import { expect, test, type Page, type TestInfo } from "@playwright/test"

function collectBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  page.on("console", (message) => {
    const text = message.text()
    const isNextDevHmrNoise = text.includes("/_next/webpack-hmr") && text.includes("WebSocket connection")

    if (message.type() === "error" && !isNextDevHmrNoise) {
      errors.push(`console.error: ${text}`)
    }
  })

  return errors
}

async function gotoPublicPage(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" })
  expect(response, `${path} should return a response`).not.toBeNull()
  expect(response!.status(), `${path} should not return an error status`).toBeLessThan(400)
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined)
}

async function expectNoBrowserErrors(errors: string[]) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  expect(errors).toEqual([])
}

async function saveFullPageShot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  })
}

test.describe("public website smoke tests", () => {
  test("landing page renders navigation, sections, and a full-page screenshot", async ({ page }, testInfo) => {
    const browserErrors = collectBrowserErrors(page)

    await gotoPublicPage(page, "/")

    await expect(page.locator("main")).toBeVisible()
    await expect(page.locator('a[aria-label="Commrent.kz"]')).toBeVisible()
    await expect(page.locator('img[alt="Commrent.kz"]').first()).toBeVisible()
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible()

    expect(await page.locator('a[href="/login"]').count()).toBeGreaterThan(0)
    expect(await page.locator('a[href="/signup"]').count()).toBeGreaterThan(0)

    for (const sectionId of ["features", "modules", "cases", "pricing", "integrations", "faq", "blog"]) {
      await expect(page.locator(`#${sectionId}`), `#${sectionId} should exist`).toBeVisible()
    }

    await saveFullPageShot(page, testInfo, "landing")
    await expectNoBrowserErrors(browserErrors)
  })

  test("marketing anchor links scroll to their sections", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page)

    await gotoPublicPage(page, "/")
    await page.locator('section a[href="#features"]').first().click()

    await expect(page).toHaveURL(/#features$/)
    await expect(page.locator("#features")).toBeInViewport()
    await expectNoBrowserErrors(browserErrors)
  })

  test("login and signup pages expose the expected form controls", async ({ page }, testInfo) => {
    const browserErrors = collectBrowserErrors(page)

    await gotoPublicPage(page, "/login")
    await expect(page.locator("form")).toBeVisible()
    await expect(page.locator('input[name="login"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
    await saveFullPageShot(page, testInfo, "login")

    await gotoPublicPage(page, "/signup")
    await expect(page.locator("form")).toBeVisible()
    await expect(page.locator('input[name="companyName"]')).toBeVisible()
    await expect(page.locator('input[name="slug"]')).toBeVisible()
    await expect(page.locator('input[name="slug"]')).toHaveAttribute("placeholder", "bc-almaty")
    await expect(page.locator('input[name="ownerName"]')).toBeVisible()
    await expect(page.locator('input[name="ownerEmail"]')).toBeVisible()
    await expect(page.locator('input[name="ownerPhone"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('input[name="agreed"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
    await saveFullPageShot(page, testInfo, "signup")

    await expectNoBrowserErrors(browserErrors)
  })

  test("legal public pages stay reachable", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page)

    for (const path of ["/offer", "/privacy", "/terms", "/sla"]) {
      await gotoPublicPage(page, path)
      await expect(page.locator("body")).toBeVisible()
      expect((await page.locator("body").innerText()).trim().length, `${path} should contain visible content`).toBeGreaterThan(100)
    }

    await expectNoBrowserErrors(browserErrors)
  })

  test("anonymous users are redirected away from protected workspaces", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page)

    for (const path of ["/admin", "/cabinet", "/superadmin"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.locator('input[name="login"]')).toBeVisible()
    }

    await expectNoBrowserErrors(browserErrors)
  })
})
