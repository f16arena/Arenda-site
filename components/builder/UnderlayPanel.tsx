"use client"

// Подложка активного этажа: скан техпаспорта на полу, по которому обводят стены.
//
// Сценарий инженера: загрузить лист (страницу PDF или фото) → повернуть так,
// как стоит здание → «Калибровать»: рулеткой отметить на скане известный
// размер со штампа и ввести его (первая точка остаётся на месте) →
// «Совместить»: точка скана → точка модели → обводить стены. Подложка живёт в
// документе модели: уезжает с автосохранением и откатывается Ctrl+Z.

import { useState } from "react"
import { useDocumentStore, useEditorStore } from "@/store/builder-store"
import { useUnderlayIntent } from "@/store/underlay-intent"
import { findFloor, SetUnderlayCommand } from "@/core/document/commands"
import { TOKENS } from "@/lib/builder/materials"
import { normalizeDeg, rotateUnderlay, scaleUnderlayAbout } from "@/lib/builder/underlay-math"
import { compressDataUrl, countPdfPages, loadImageWithDimensions, renderPdfPage } from "@/lib/pdf-render"
import { DXF_NO_LINES, parseDxf } from "@/lib/builder/dxf-import"
import { NO_CANVAS, rasterizeDxf } from "@/lib/builder/dxf-raster"
import { useT } from "@/lib/i18n/client"

export type PendingMeasure = { lengthMm: number; from: { x: number; y: number } } | null

export function UnderlayPanel({ pending, onConsumed }: { pending: PendingMeasure; onConsumed: () => void }) {
  const { t } = useT()
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const setTool = useEditorStore((s) => s.setTool)
  const intent = useUnderlayIntent((s) => s.intent)
  const setIntent = useUnderlayIntent((s) => s.setIntent)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pages, setPages] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [realLength, setRealLength] = useState("")
  const [angleDraft, setAngleDraft] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const floor = activeLevelId && activeLevelId !== "site" ? findFloor(doc, activeLevelId) : undefined
  if (!floor) return null
  const underlay = floor.underlay

  async function place(file: File, page: number) {
    if (!floor) return
    setBusy(true)
    setError(null)
    try {
      const rendered =
        file.type === "application/pdf" ? await renderPdfPage(file, page) : await loadImageWithDimensions(file)
      // ужимаем: подложка едет в документ модели вместе с автосохранением
      const url = await compressDataUrl(rendered.dataUrl, { maxDim: 2200, quality: 0.8 })
      // до калибровки — 40 м по ширине, типичный корпус; масштаб уточнит рулетка
      execute(
        new SetUnderlayCommand(floor.id, {
          url,
          widthMm: 40_000,
          aspect: rendered.widthPx / rendered.heightPx,
          x: -20_000,
          y: -20_000 / (rendered.widthPx / rendered.heightPx),
          rotationDeg: 0,
          opacity: 0.6,
        }),
      )
      setPages(null)
      setPendingFile(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("adminBuilder.underlay.loadFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function placeDxf(file: File) {
    if (!floor) return
    setBusy(true)
    setError(null)
    try {
      const parsed = parseDxf(await file.text())
      const r = rasterizeDxf(parsed)
      // DXF в миллиметрах: подложка сразу в масштабе 1:1 и на своих координатах
      execute(new SetUnderlayCommand(floor.id, { url: r.url, widthMm: r.widthMm, aspect: r.aspect, x: r.x, y: r.y, rotationDeg: 0, opacity: 0.8 }))
      setInfo(t("adminBuilder.underlay.dxfInfo", {
        lines: parsed.segments.length,
        layers: parsed.layers.length,
        width: ((parsed.bounds.maxX - parsed.bounds.minX) / 1000).toFixed(1),
        height: ((parsed.bounds.maxY - parsed.bounds.minY) / 1000).toFixed(1),
      }))
    } catch (cause) {
      setError(dxfError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File) {
    if (/\.dxf$/i.test(file.name)) {
      await placeDxf(file)
      return
    }
    setPendingFile(file)
    setError(null)
    if (file.type === "application/pdf") {
      // подсчёт страниц тоже может упасть (битый PDF, не загрузился воркер) —
      // молча проглатывать нельзя, инженер должен видеть, почему ничего не произошло
      let count: number
      try {
        count = await countPdfPages(file)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("adminBuilder.underlay.pdfFailed"))
        setPendingFile(null)
        return
      }
      setPages(count)
      if (count > 1) return
    }
    await place(file, 1)
  }

  // разбор DXF отдаёт код, а не текст: подпись живёт в словаре
  const dxfError = (cause: unknown) => {
    const code = cause instanceof Error ? cause.message : ""
    if (code === DXF_NO_LINES) return t("adminBuilder.underlay.dxfNoLines")
    if (code === NO_CANVAS) return t("adminBuilder.underlay.noCanvas")
    return code || t("adminBuilder.underlay.dxfFailed")
  }

  function startMeasure(next: "calibrate" | "move") {
    onConsumed()
    setIntent(next)
    setTool("measure")
  }

  function cancelMeasure() {
    setIntent(null)
    onConsumed()
    setTool("select")
  }

  function applyCalibration() {
    if (!floor || !underlay || !pending) return
    const real = Number(realLength.replace(",", "."))
    if (!(real > 0) || pending.lengthMm <= 0) return
    const k = (real * 1000) / pending.lengthMm
    execute(new SetUnderlayCommand(floor.id, scaleUnderlayAbout(underlay, pending.from, k)))
    setRealLength("")
    onConsumed()
  }

  function rotate(delta: number) {
    if (!floor || !underlay) return
    execute(new SetUnderlayCommand(floor.id, rotateUnderlay(underlay, delta)))
  }

  function commitAngle() {
    if (!floor || !underlay || angleDraft === null) return
    const deg = Number(angleDraft.replace(",", "."))
    setAngleDraft(null)
    if (!Number.isFinite(deg)) return
    execute(new SetUnderlayCommand(floor.id, { ...underlay, rotationDeg: normalizeDeg(deg) }))
  }

  const btn = (label: string, onClick: () => void, opts: { accent?: boolean; title?: string } = {}) => (
    <button
      type="button"
      onClick={onClick}
      title={opts.title}
      className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium"
      style={{ background: opts.accent ? TOKENS.accent : "rgba(148,163,184,0.12)", color: opts.accent ? "#0b1220" : TOKENS.text }}
    >
      {label}
    </button>
  )

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: TOKENS.muted }}>
        {t("adminBuilder.underlay.title", { name: floor.name })}
      </p>
      <input
        id="builder-underlay-file"
        type="file"
        accept="application/pdf,image/*,.dxf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onFile(file)
          event.target.value = ""
        }}
      />
      <div className="flex flex-wrap gap-1">
        <label
          htmlFor="builder-underlay-file"
          className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium"
          style={{ background: underlay ? "rgba(148,163,184,0.12)" : TOKENS.accent, color: underlay ? TOKENS.text : "#0b1220", opacity: busy ? 0.5 : 1 }}
        >
          {busy ? t("adminBuilder.underlay.loading") : t(underlay ? "adminBuilder.underlay.replace" : "adminBuilder.underlay.pick")}
        </label>
        {underlay && !confirmRemove && btn(t("adminBuilder.underlay.remove"), () => setConfirmRemove(true), { title: t("adminBuilder.underlay.removeHint") })}
      </div>
      {underlay && confirmRemove && (
        <div className="flex flex-wrap items-center gap-1 rounded-md p-1.5 text-[11px]" style={{ background: "rgba(239,68,68,0.12)", color: TOKENS.text }}>
          <span className="mr-auto">{t("adminBuilder.underlay.removeAsk")}</span>
          <button
            type="button"
            onClick={() => {
              execute(new SetUnderlayCommand(floor.id, null))
              setConfirmRemove(false)
            }}
            className="rounded-md px-2 py-1 font-semibold"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            {t("adminBuilder.underlay.removeYes")}
          </button>
          {btn(t("adminBuilder.underlay.removeNo"), () => setConfirmRemove(false))}
        </div>
      )}

      {pages && pages > 1 && pendingFile && (
        <div className="flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
          {t("adminBuilder.underlay.page")}
          {Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => void place(pendingFile, page)}
              className="h-6 w-6 rounded-md text-[11px] font-semibold"
              style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
            >
              {page}
            </button>
          ))}
        </div>
      )}

      {underlay && (
        <>
          <label className="flex items-center justify-between gap-2 text-[11px]" style={{ color: TOKENS.muted }}>
            {t("adminBuilder.underlay.opacity")}
            <input
              id="builder-underlay-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={underlay.opacity}
              onChange={(event) =>
                execute(new SetUnderlayCommand(floor.id, { ...underlay, opacity: Number(event.target.value) }, "opacity"))
              }
              className="w-24"
            />
          </label>

          <div className="flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
            <span className="mr-auto">{t("adminBuilder.underlay.rotation")}</span>
            {btn("⟲ 90°", () => rotate(-90), { title: t("adminBuilder.underlay.rotateCcw") })}
            {btn("⟳ 90°", () => rotate(90), { title: t("adminBuilder.underlay.rotateCw") })}
            <input
              id="builder-underlay-angle"
              type="number"
              step="0.5"
              value={angleDraft ?? String(underlay.rotationDeg)}
              onChange={(event) => setAngleDraft(event.target.value)}
              onBlur={commitAngle}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitAngle()
              }}
              title={t("adminBuilder.underlay.angleHint")}
              className="w-12 rounded-md bg-white/5 px-1 py-0.5 text-right text-[11px] tabular-nums"
              style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
            <span className="whitespace-nowrap tabular-nums">{t("adminBuilder.underlay.width", { value: (underlay.widthMm / 1000).toFixed(2) })}</span>
            <div className="flex gap-1">
              {btn(t("adminBuilder.underlay.calibrate"), () => startMeasure("calibrate"), {
                title: t("adminBuilder.underlay.calibrateHint"),
              })}
              {btn(t("adminBuilder.underlay.align"), () => startMeasure("move"), {
                title: t("adminBuilder.underlay.alignHint"),
              })}
            </div>
          </div>

          {intent && !pending && (
            <div className="rounded-md p-2 text-[11px]" style={{ background: "rgba(56,189,248,0.12)", color: TOKENS.text }}>
              {t(intent === "calibrate" ? "adminBuilder.underlay.calibrateStep" : "adminBuilder.underlay.alignStep")}
              <div className="mt-1">{btn(t("adminBuilder.underlay.cancel"), cancelMeasure)}</div>
            </div>
          )}

          {pending && (
            <div className="rounded-md p-2 text-[11px]" style={{ background: "rgba(251,191,36,0.12)", color: TOKENS.text }}>
              {t("adminBuilder.underlay.segment", { value: (pending.lengthMm / 1000).toFixed(2) })}
              <div className="mt-1 flex items-center gap-1">
                <input
                  id="builder-underlay-real"
                  type="number"
                  step="0.01"
                  autoFocus
                  value={realLength}
                  onChange={(event) => setRealLength(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyCalibration()
                  }}
                  placeholder="36.55"
                  className="w-20 rounded-md bg-white/5 px-1.5 py-1 text-xs tabular-nums"
                  style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
                />
                <span style={{ color: TOKENS.muted }}>{t("adminBuilder.underlay.meters")}</span>
                {btn(t("adminBuilder.underlay.apply"), applyCalibration, { accent: true })}
                {btn(t("adminBuilder.underlay.cancel"), () => onConsumed())}
              </div>
            </div>
          )}
        </>
      )}

      {info && !error && <p className="text-[11px]" style={{ color: TOKENS.muted }}>{info}</p>}
      {error && <p className="text-[11px]" style={{ color: "#fca5a5" }}>{error}</p>}
    </div>
  )
}
