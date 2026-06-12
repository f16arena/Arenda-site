"use client"

// ADR: Владелец жизненного цикла Babylon-движка. Создаёт один BuilderEngine на canvas,
// корректно освобождает при unmount (StrictMode-safe). Динамически импортируется в
// BuilderApp с ssr:false — тяжёлый three-D-чанк грузится только в браузере на /builder.

import { useEffect, useRef } from "react"
import { BuilderEngine } from "@/engine/engine"

export function BuilderCanvas({ onReady }: { onReady: (engine: BuilderEngine) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new BuilderEngine(canvas)
    onReady(engine)
    const onResize = () => engine.resize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      engine.dispose()
    }
  }, [onReady])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />
}
