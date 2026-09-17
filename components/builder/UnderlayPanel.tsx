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

export type PendingMeasure = { lengthMm: number; from: { x: number; y: number } } | null

export function UnderlayPanel({ pending, onConsumed }: { pending: PendingMeasure; onConsumed: () => void }) {
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
  const [realLength, setRealLength] = useState("")
  const [angleDraft, setAngleDraft] = useState<string | null>(null)

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
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить план")
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File) {
    setPendingFile(file)
    setError(null)
    if (file.type === "application/pdf") {
      // подсчёт страниц тоже может упасть (битый PDF, не загрузился воркер) —
      // молча проглатывать нельзя, инженер должен видеть, почему ничего не произошло
      let count: number
      try {
        count = await countPdfPages(file)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Не удалось прочитать PDF")
        setPendingFile(null)
        return
      }
      setPages(count)
      if (count > 1) return
    }
    await place(file, 1)
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
        Подложка · {floor.name}
      </p>
      <input
        id="builder-underlay-file"
        type="file"
        accept="application/pdf,image/*"
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
          {busy ? "Загружаю…" : underlay ? "Заменить скан" : "Загрузить скан плана"}
        </label>
        {underlay && btn("Убрать", () => execute(new SetUnderlayCommand(floor.id, null)))}
      </div>

      {pages && pages > 1 && pendingFile && (
        <div className="flex items-center gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
          Страница:
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
            Прозрачность
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
            <span className="mr-auto">Поворот</span>
            {btn("⟲ 90°", () => rotate(-90), { title: "Повернуть против часовой" })}
            {btn("⟳ 90°", () => rotate(90), { title: "Повернуть по часовой" })}
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
              title="Точный угол, градусы"
              className="w-12 rounded-md bg-white/5 px-1 py-0.5 text-right text-[11px] tabular-nums"
              style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ color: TOKENS.muted }}>
            <span className="whitespace-nowrap tabular-nums">Ширина {(underlay.widthMm / 1000).toFixed(2)} м</span>
            <div className="flex gap-1">
              {btn("Калибровать", () => startMeasure("calibrate"), {
                title: "Отметьте рулеткой на скане размер со штампа и введите настоящую длину",
              })}
              {btn("Совместить", () => startMeasure("move"), {
                title: "Кликните точку на скане, затем точку модели, куда она должна встать",
              })}
            </div>
          </div>

          {intent && !pending && (
            <div className="rounded-md p-2 text-[11px]" style={{ background: "rgba(56,189,248,0.12)", color: TOKENS.text }}>
              {intent === "calibrate"
                ? "Кликните два конца известного размера на скане."
                : "Кликните точку на скане, затем точку модели, куда её поставить."}
              <div className="mt-1">{btn("Отмена", cancelMeasure)}</div>
            </div>
          )}

          {pending && (
            <div className="rounded-md p-2 text-[11px]" style={{ background: "rgba(251,191,36,0.12)", color: TOKENS.text }}>
              Отрезок {(pending.lengthMm / 1000).toFixed(2)} м. Сколько на самом деле?
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
                <span style={{ color: TOKENS.muted }}>м</span>
                {btn("Применить", applyCalibration, { accent: true })}
                {btn("Отмена", () => onConsumed())}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-[11px]" style={{ color: "#fca5a5" }}>{error}</p>}
    </div>
  )
}
