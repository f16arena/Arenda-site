import { db } from "@/lib/db"

const DEFAULT_SLOW_ROUTE_MS = 900
const ERROR_MESSAGE_LIMIT = 500

type ServerPerformanceContext = {
  organizationId?: string | null
  userId?: string | null
}

type ServerPerformanceLogInput = ServerPerformanceContext & {
  route: string
  step?: string | null
  kind: "ROUTE" | "STEP"
  durationMs: number
  status: "ok" | "error"
  error?: string | null
}

function getSlowRouteMs() {
  const parsed = Number.parseInt(process.env.ROUTE_PERF_SLOW_MS ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_ROUTE_MS
}

function shouldLogAllRoutes() {
  return process.env.ROUTE_PERF_LOG_ALL === "1"
}

function isNextDynamicServerSignal(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.message.includes("Dynamic server usage") || String((error as { digest?: unknown }).digest ?? "").includes("DYNAMIC_SERVER")
}

// redirect() и notFound() в Server Components бросают специальные исключения
// (NEXT_REDIRECT / NEXT_NOT_FOUND) — это нормальный поток управления, а не ошибка.
// Не логируем их как status=error, иначе счётчик «ошибок сервера» завышается
// (напр. /admin layout перенаправляет платформенного админа на /superadmin).
function isExpectedControlFlowSignal(error: unknown): boolean {
  if (isNextDynamicServerSignal(error)) return true
  if (!(error instanceof Error)) return false
  const digest = String((error as { digest?: unknown }).digest ?? "")
  const message = error.message ?? ""
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest === "NEXT_NOT_FOUND" ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
    message === "NEXT_REDIRECT" ||
    message === "NEXT_NOT_FOUND"
  )
}

export async function measureServerRoute<T>(
  route: string,
  render: () => Promise<T>,
  context?: ServerPerformanceContext,
): Promise<T> {
  const start = performance.now()
  let didError = false
  let errorMessage: string | null = null
  try {
    return await render()
  } catch (error) {
    didError = true
    errorMessage = error instanceof Error ? error.message : "unknown"
    const durationMs = Math.round(performance.now() - start)
    if (!isExpectedControlFlowSignal(error)) {
      console.error("[route-performance]", {
        route,
        durationMs,
        status: "error",
        error: errorMessage,
      })
      await persistServerPerformanceLog({
        ...context,
        route,
        kind: "ROUTE",
        durationMs,
        status: "error",
        error: errorMessage,
      })
    }
    throw error
  } finally {
    const durationMs = Math.round(performance.now() - start)
    if (!didError && (shouldLogAllRoutes() || durationMs >= getSlowRouteMs())) {
      console.info("[route-performance]", {
        route,
        durationMs,
        status: "ok",
      })
      await persistServerPerformanceLog({
        ...context,
        route,
        kind: "ROUTE",
        durationMs,
        status: "ok",
      })
    }
  }
}

export async function measureServerStep<T>(
  route: string,
  step: string,
  promise: Promise<T>,
  slowMs = Math.max(250, Math.round(getSlowRouteMs() / 3)),
  context?: ServerPerformanceContext,
): Promise<T> {
  const start = performance.now()
  let status: "ok" | "error" = "ok"
  let errorMessage: string | null = null
  try {
    return await promise
  } catch (error) {
    if (!isExpectedControlFlowSignal(error)) {
      status = "error"
      errorMessage = error instanceof Error ? error.message : "unknown"
    }
    throw error
  } finally {
    const durationMs = Math.round(performance.now() - start)
    if (shouldLogAllRoutes() || durationMs >= slowMs || status === "error") {
      console.info("[route-performance-step]", {
        route,
        step,
        durationMs,
        status,
      })
      await persistServerPerformanceLog({
        ...context,
        route,
        step,
        kind: "STEP",
        durationMs,
        status,
        error: errorMessage,
      })
    }
  }
}

async function persistServerPerformanceLog(input: ServerPerformanceLogInput) {
  try {
    await db.serverPerformanceLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        route: input.route,
        step: input.step ?? null,
        kind: input.kind,
        durationMs: input.durationMs,
        status: input.status,
        error: input.error ? input.error.slice(0, ERROR_MESSAGE_LIMIT) : null,
      },
    })
  } catch (error) {
    console.error("[route-performance/persist-failed]", {
      route: input.route,
      step: input.step,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
