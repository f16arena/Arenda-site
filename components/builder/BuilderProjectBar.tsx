"use client"

// ADR: Панель проекта (Фаза 5): имя, сохранение с автосейвом (debounce 4с, оптимистичная
// блокировка по revision), AI-генерация здания из текста, публичная ссылка-витрина.
// Док берётся/кладётся через documentStore; статус — syncStore.

import { useEffect, useState } from "react"
import { Loader2, Save, Share2, Sparkles } from "lucide-react"
import { useDocumentStore, useEditorStore, useSyncStore } from "@/store/builder-store"
import { createBuilderProject, saveBuilderProject, createBuilderShare } from "@/app/actions/builder"
import { TOKENS } from "@/lib/builder/materials"

async function doSave(): Promise<void> {
  const sync = useSyncStore.getState()
  const doc = useDocumentStore.getState().doc
  const curRev = useDocumentStore.getState().rev
  sync.setStatus("saving")
  try {
    if (sync.projectId) {
      const res = await saveBuilderProject(sync.projectId, doc, sync.revision, sync.name)
      if (res.conflict) {
        useSyncStore.getState().setStatus("conflict")
        return
      }
      useSyncStore.setState({ revision: res.revision, status: "saved", lastSavedRev: curRev })
    } else {
      const res = await createBuilderProject(sync.name, doc)
      useSyncStore.setState({ projectId: res.id, revision: res.revision, status: "saved", lastSavedRev: curRev })
    }
  } catch {
    useSyncStore.getState().setStatus("error")
  }
}

const STATUS_LABEL: Record<string, string> = { idle: "Не сохранено", saving: "Сохранение…", saved: "Сохранено", conflict: "Конфликт — обновите", error: "Ошибка" }

export function BuilderProjectBar() {
  const name = useSyncStore((s) => s.name)
  const setName = useSyncStore((s) => s.setName)
  const status = useSyncStore((s) => s.status)
  const projectId = useSyncStore((s) => s.projectId)
  const rev = useDocumentStore((s) => s.rev)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState("")
  const [aiBusy, setAiBusy] = useState(false)

  // Автосейв: 4с после последнего изменения документа.
  useEffect(() => {
    const sync = useSyncStore.getState()
    if (rev === sync.lastSavedRev) return
    const t = setTimeout(() => void doSave(), 4000)
    return () => clearTimeout(t)
  }, [rev])

  const runAi = async () => {
    if (!aiText.trim()) return
    setAiBusy(true)
    try {
      const r = await fetch("/api/admin/builder/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiText }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Ошибка")
      useDocumentStore.getState().loadDocument(d.doc)
      const first = d.doc?.buildings?.[0]?.floors?.[0]
      if (first?.id) useEditorStore.getState().setActiveLevel(first.id)
      useSyncStore.setState({ lastSavedRev: -1, status: "idle" })
      setAiOpen(false)
      setAiText("")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка AI")
    } finally {
      setAiBusy(false)
    }
  }

  const share = async () => {
    if (!useSyncStore.getState().projectId) await doSave()
    const id = useSyncStore.getState().projectId
    if (!id) {
      alert("Сначала сохраните проект")
      return
    }
    try {
      const { token } = await createBuilderShare(id)
      const url = `https://commrent.kz/showcase/${token}`
      try {
        await navigator.clipboard?.writeText(url)
      } catch {
        /* clipboard может быть недоступен */
      }
      alert(`Ссылка-витрина скопирована:\n${url}`)
    } catch {
      alert("Не удалось создать ссылку")
    }
  }

  const dot = status === "saved" ? TOKENS.success : status === "saving" ? TOKENS.accent : status === "error" || status === "conflict" ? TOKENS.danger : TOKENS.muted

  return (
    <div
      className="absolute left-3 top-3 z-30 flex w-64 flex-col gap-1.5 rounded-2xl p-2 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg bg-transparent px-2 py-1 text-sm font-semibold outline-none"
        style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
        placeholder="Название проекта"
      />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => void doSave()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: TOKENS.accent, color: "#0b1220" }}>
          <Save className="h-3.5 w-3.5" /> Сохранить
        </button>
        <button type="button" onClick={() => setAiOpen((v) => !v)} title="Сгенерировать здание из текста" className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: "rgba(167,139,250,0.18)", color: TOKENS.accent2 }}>
          <Sparkles className="h-3.5 w-3.5" /> AI
        </button>
        <button type="button" onClick={() => void share()} title="Публичная ссылка-витрина" className="flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>
          <Share2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[10px]" style={{ color: TOKENS.muted }}>
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> {STATUS_LABEL[status]}
        {projectId && <span className="opacity-60">· сохраняется автоматически</span>}
      </div>
      {aiOpen && (
        <div className="flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: TOKENS.panelBorder }}>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={2}
            placeholder="Напр.: 3-этажный офис с цоколем, парковкой на 20 мест, стеклянным фасадом и плоской кровлей"
            className="w-full rounded-lg bg-transparent px-2 py-1 text-xs outline-none"
            style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
          />
          <button type="button" onClick={() => void runAi()} disabled={aiBusy} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold" style={{ background: TOKENS.accent2, color: "#0b1220", opacity: aiBusy ? 0.6 : 1 }}>
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Сгенерировать
          </button>
          <span className="px-1 text-[10px]" style={{ color: TOKENS.muted }}>Заменит текущую сцену сгенерированным зданием.</span>
        </div>
      )}
    </div>
  )
}
