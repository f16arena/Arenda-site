const DEFAULT_SLOW_ROUTE_MS = 900

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

export async function measureServerRoute<T>(
  route: string,
  render: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  let didError = false
  try {
    return await render()
  } catch (error) {
    didError = true
    const durationMs = Math.round(performance.now() - start)
    if (!isNextDynamicServerSignal(error)) {
      console.error("[route-performance]", {
        route,
        durationMs,
        status: "error",
        error: error instanceof Error ? error.message : "unknown",
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
    }
  }
}
