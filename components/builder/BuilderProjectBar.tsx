"use client"

// ADR: Панель проекта (Фаза 5): имя, сохранение с автосейвом (debounce 4с, оптимистичная
// блокировка по revision), AI-генерация здания из текста, публичная ссылка-витрина.
// Док берётся/кладётся через documentStore; статус — syncStore.

import { useEffect, useState } from "react"
import { History, Loader2, Save, Share2, Sparkles, Trash2, Camera, LogOut } from "lucide-react"
import { useDocumentStore, useEditorStore, useSyncStore } from "@/store/builder-store"
import { createBuilderProject, saveBuilderProject, createBuilderShare, listBuilderShares, listBuilderShareViews, listBuilderSnapshots, restoreBuilderSnapshot, revokeBuilderShare, loadBuilderProject } from "@/app/actions/builder"
import { viewsSummary } from "@/lib/builder/share-log"
import { buildEmptyProject } from "@/lib/builder/demo-project"
import { TOKENS } from "@/lib/builder/materials"

// Сохранения строго по очереди. Автосейв через 4 с после правки мог стартовать,
// пока предыдущее сохранение модели со сканами ещё шло, — с той же ревизией, и
// сервер отвечал конфликтом одному-единственному пользователю.
let inFlight: Promise<void> | null = null
let saveAgain = false

async function doSave(): Promise<void> {
  if (inFlight) {
    saveAgain = true
    return inFlight
  }
  inFlight = saveOnce()
  try {
    await inFlight
  } finally {
    inFlight = null
  }
  if (saveAgain) {
    saveAgain = false
    const sync = useSyncStore.getState()
    if (sync.status !== "conflict" && useDocumentStore.getState().rev !== sync.lastSavedRev) await doSave()
  }
}

/** Конфликт: взять версию с сервера (свои несохранённые правки теряются). */
async function takeServerVersion(): Promise<void> {
  const id = useSyncStore.getState().projectId
  if (!id) return
  const p = await loadBuilderProject(id)
  if (!p) return
  useDocumentStore.getState().loadDocument(p.doc)
  useSyncStore.getState().setProject(p.id, p.name, p.revision)
  useSyncStore.setState({ lastSavedRev: useDocumentStore.getState().rev })
}

/** Конфликт: сохранить свою модель поверх серверной. */
async function overwriteServerVersion(): Promise<void> {
  const id = useSyncStore.getState().projectId
  if (!id) return
  const p = await loadBuilderProject(id)
  if (!p) return
  useSyncStore.setState({ revision: p.revision, status: "idle" })
  await doSave()
}

async function saveOnce(): Promise<void> {
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

const STATUS_LABEL: Record<string, string> = { idle: "Не сохранено", saving: "Сохранение…", saved: "Сохранено", conflict: "Конфликт версий", error: "Не сохранилось — повторю при следующей правке" }

export function BuilderProjectBar({ onScreenshot }: { onScreenshot?: () => void }) {
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

  // Публичные ссылки-витрины: живут 30 дней и отзываются — планировка здания
  // не должна ходить по рукам вечно.
  const [shares, setShares] = useState<Array<{ token: string; createdAt: string; expiresAt: string | null; views: number; lastViewAt: string | null }>>([])
  // журнал открытий витрины: кто и когда заходил по ссылке
  const [viewsOpen, setViewsOpen] = useState(false)
  const [views, setViews] = useState<Array<{ token: string; openedAt: string; visitor: string | null; userAgent: string | null }>>([])
  const [sharesOpen, setSharesOpen] = useState(false)
  // история модели: снимки на сервере, из которых можно восстановиться
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<Array<{ id: string; revision: number; createdAt: string; floors: number; rooms: number }>>([])
  const [restoring, setRestoring] = useState<string | null>(null)
  const shareUrl = (token: string) => `https://commrent.kz/showcase/${token}`
  const refreshShares = async (id: string) => {
    try { setShares(await listBuilderShares(id)) } catch { setShares([]) }
  }
  const openShares = async () => {
    if (!useSyncStore.getState().projectId) await doSave()
    const id = useSyncStore.getState().projectId
    if (!id) { alert("Сначала сохраните проект"); return }
    await refreshShares(id)
    setSharesOpen((v) => !v)
  }
  const share = async () => {
    const id = useSyncStore.getState().projectId
    if (!id) { alert("Сначала сохраните проект"); return }
    try {
      const { token } = await createBuilderShare(id)
      try { await navigator.clipboard?.writeText(shareUrl(token)) } catch { /* clipboard может быть недоступен */ }
      await refreshShares(id)
    } catch {
      alert("Не удалось создать ссылку")
    }
  }
  const revoke = async (token?: string) => {
    const id = useSyncStore.getState().projectId
    if (!id) return
    try {
      await revokeBuilderShare(id, token)
      await refreshShares(id)
    } catch {
      alert("Не удалось отозвать ссылку")
    }
  }

  // Очистить всё: заменить сцену пустым проектом (одно здание + один пустой этаж),
  // чтобы строить заново с чистого листа. Не отменяется (стек команд сбрасывается).
  const clearAll = () => {
    if (!window.confirm("Очистить весь проект? Текущая сцена будет заменена пустым зданием с одним этажом. Действие нельзя отменить.")) return
    const doc = buildEmptyProject()
    useDocumentStore.getState().loadDocument(doc)
    const first = doc.buildings[0]?.floors?.[0]
    if (first?.id) useEditorStore.getState().setActiveLevel(first.id)
    useEditorStore.getState().setSelection({ type: "none" })
    useSyncStore.setState({ lastSavedRev: -1, status: "idle" })
  }

  // Выйти из 3D-конструктора в админку. Перед выходом сохраняем несохранённые
  // изменения (полная перезагрузка корректно уничтожает Babylon-сцену и канвас).
  const exit = async () => {
    const curRev = useDocumentStore.getState().rev
    if (curRev !== useSyncStore.getState().lastSavedRev) {
      await doSave()
      const st = useSyncStore.getState().status
      if ((st === "error" || st === "conflict") && !window.confirm("Не удалось сохранить изменения. Выйти без сохранения?")) return
    }
    window.location.href = "/admin"
  }

  const dot = status === "saved" ? TOKENS.success : status === "saving" ? TOKENS.accent : status === "error" || status === "conflict" ? TOKENS.danger : TOKENS.muted

  return (
    <div
      className="absolute left-3 top-3 z-30 flex w-64 flex-col gap-1.5 rounded-2xl p-2 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <button
        type="button"
        onClick={() => void exit()}
        title="Сохранить и выйти в админку"
        className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs font-medium transition-all"
        style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.muted }}
      >
        <LogOut className="h-3.5 w-3.5" /> Выйти
      </button>
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
        <button type="button" onClick={() => void openShares()} title="Публичные ссылки-витрины: создать, скопировать, отозвать" className="flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: sharesOpen ? TOKENS.accent : "rgba(148,163,184,0.12)", color: sharesOpen ? "#0b1220" : TOKENS.text }}>
          <Share2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setHistoryOpen((v) => !v)
            if (!historyOpen && projectId) void listBuilderSnapshots(projectId).then(setSnapshots).catch(() => setSnapshots([]))
          }}
          title="История модели: снимки на сервере, можно вернуться к сохранённому состоянию"
          className="flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium"
          style={{ background: historyOpen ? TOKENS.accent : "rgba(148,163,184,0.12)", color: historyOpen ? "#0b1220" : TOKENS.text }}
        >
          <History className="h-3.5 w-3.5" />
        </button>
        {onScreenshot && (
          <button type="button" onClick={onScreenshot} title="Скачать снимок сцены (PNG)" className="flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}>
            <Camera className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={clearAll} title="Очистить всё — начать проект заново" className="flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.16)", color: TOKENS.danger }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {historyOpen && (
        <div className="flex flex-col gap-1 rounded-lg p-2 text-[11px]" style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.text }}>
          <span className="font-semibold">История модели</span>
          {snapshots.length === 0 && <span style={{ color: TOKENS.muted }}>Снимков пока нет — первый появится при следующем сохранении.</span>}
          {snapshots.map((sn) => (
            <div key={sn.id} className="flex items-center gap-1.5">
              <span className="tabular-nums">{new Date(sn.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="flex-1" style={{ color: TOKENS.muted }}>рев. {sn.revision} · {sn.floors} эт · {sn.rooms} стен</span>
              {restoring === sn.id ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!projectId) return
                    setRestoring(null)
                    void restoreBuilderSnapshot(projectId, sn.id).then(() => window.location.reload())
                  }}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: TOKENS.danger, color: "#0b1220" }}
                >
                  Точно вернуть
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRestoring(sn.id)}
                  title="Вернуть модель к этому состоянию. Текущее тоже попадёт в снимки — можно будет отменить"
                  className="rounded-md px-1.5 py-0.5 text-[10px]"
                  style={{ background: "rgba(148,163,184,0.16)" }}
                >
                  Вернуть
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {sharesOpen && (
        <div className="flex flex-col gap-1.5 rounded-lg p-2 text-[11px]" style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.text }}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Ссылки-витрины</span>
            <button type="button" onClick={() => void share()} className="rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: TOKENS.accent, color: "#0b1220" }}>+ Создать на 30 дней</button>
          </div>
          {shares.length === 0 && <span style={{ color: TOKENS.muted }}>Активных ссылок нет. Проект виден только вашей организации.</span>}
          {shares.map((sh) => (
            <div key={sh.token} className="flex items-center gap-1">
              <span className="flex-1 truncate" title={shareUrl(sh.token)}>…{sh.token.slice(-8)}</span>
              <span style={{ color: TOKENS.muted }}>{sh.expiresAt ? `до ${new Date(sh.expiresAt).toLocaleDateString("ru-RU")}` : "бессрочно"}</span>
              <span title="Сколько раз открывали эту ссылку" style={{ color: sh.views ? TOKENS.accent : TOKENS.muted }}>{viewsSummary(sh.views, sh.lastViewAt)}</span>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(shareUrl(sh.token))} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(148,163,184,0.16)" }}>Копировать</button>
              <button type="button" onClick={() => void revoke(sh.token)} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(239,68,68,0.18)", color: "#fca5a5" }}>Отозвать</button>
            </div>
          ))}
          {shares.length > 1 && (
            <button type="button" onClick={() => void revoke()} className="rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: "rgba(239,68,68,0.16)", color: "#fca5a5" }}>Отозвать все</button>
          )}
          <button
            type="button"
            onClick={() => {
              setViewsOpen((v) => !v)
              if (!viewsOpen && projectId) void listBuilderShareViews(projectId).then(setViews).catch(() => setViews([]))
            }}
            className="self-start rounded-md px-2 py-1 text-[10px] font-medium"
            style={{ background: "rgba(148,163,184,0.16)", color: TOKENS.text }}
          >
            {viewsOpen ? "Скрыть журнал открытий" : "Журнал открытий"}
          </button>
          {viewsOpen && (
            <div className="flex max-h-40 flex-col gap-0.5 overflow-auto rounded-md p-1.5 text-[10px]" style={{ background: "rgba(15,23,42,0.35)" }}>
              {views.length === 0 && <span style={{ color: TOKENS.muted }}>Витрину ещё не открывали.</span>}
              {views.map((v, i) => (
                <div key={`${v.openedAt}-${i}`} className="flex items-center gap-1.5">
                  <span className="tabular-nums" style={{ color: TOKENS.text }}>
                    {new Date(v.openedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex-1 truncate" style={{ color: TOKENS.muted }}>{v.userAgent ?? "браузер неизвестен"}</span>
                  <span title="Отпечаток посетителя: одинаковый — значит, заходил тот же человек. Адрес не хранится" style={{ color: TOKENS.muted }}>
                    {v.visitor ? v.visitor.slice(0, 6) : "—"}
                  </span>
                  <span style={{ color: TOKENS.muted }}>…{v.token.slice(-6)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 px-1 text-[10px]" style={{ color: TOKENS.muted }}>
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> {STATUS_LABEL[status]}
        {projectId && status !== "conflict" && <span className="opacity-60">· сохраняется автоматически</span>}
      </div>
      {status === "conflict" && (
        <div className="flex flex-col gap-1 rounded-lg p-1.5 text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: TOKENS.text }}>
          Модель изменили в другой вкладке или на другом устройстве.
          <div className="flex gap-1">
            <button type="button" onClick={() => void takeServerVersion()} title="Загрузить сохранённую версию; ваши несохранённые правки пропадут" className="flex-1 rounded-md px-1.5 py-1 font-medium" style={{ background: "rgba(148,163,184,0.16)", color: TOKENS.text }}>
              Взять с сервера
            </button>
            <button type="button" onClick={() => void overwriteServerVersion()} title="Сохранить вашу модель поверх той, что на сервере" className="flex-1 rounded-md px-1.5 py-1 font-medium" style={{ background: "rgba(239,68,68,0.2)", color: "#fecaca" }}>
              Сохранить мою
            </button>
          </div>
        </div>
      )}
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
