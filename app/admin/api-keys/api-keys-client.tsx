"use client"

import { useState, useTransition } from "react"
import { Plus, Copy, Check, Ban, AlertTriangle, Key } from "lucide-react"
import { toast } from "sonner"
import { createApiKey, revokeApiKey } from "@/app/actions/api-keys"
import { useRouter } from "next/navigation"

type Key = {
  id: string
  name: string
  keyPrefix: string
  scope: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export function ApiKeysClient({ initialKeys }: { initialKeys: Key[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"READ" | "WRITE">("READ")
  const [expiresInDays, setExpiresInDays] = useState<string>("90")
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = () => {
    if (name.length < 3) { toast.error("Минимум 3 символа в названии"); return }
    startTransition(async () => {
      const r = await createApiKey({
        name,
        scope,
        expiresInDays: expiresInDays ? parseInt(expiresInDays) : null,
      })
      if (!r.ok) { toast.error(r.error); return }
      setNewToken(r.token)
      setShowCreate(false)
      setName("")
    })
  }

  const handleRevoke = (id: string, name: string) => {
    if (!window.confirm(`Отозвать ключ "${name}"?\n\nПриложения, использующие этот токен, перестанут работать.`)) return
    startTransition(async () => {
      const r = await revokeApiKey(id)
      if (r.ok) { toast.success("Ключ отозван"); router.refresh() }
      else toast.error(r.error ?? "Ошибка")
    })
  }

  const copyToken = () => {
    if (!newToken) return
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Новый токен — показывается один раз */}
      {newToken && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-5">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Сохраните этот токен</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Это единственная возможность увидеть его. После закрытия окна — только prefix.
              </p>
            </div>
          </div>
          <code className="block bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 rounded p-3 text-xs font-mono break-all select-all">
            {newToken}
          </code>
          <div className="flex gap-2 mt-3">
            <button
              onClick={copyToken}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white py-2 text-sm font-medium"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              onClick={() => { setNewToken(null); router.refresh() }}
              className="flex-1 rounded-lg border border-amber-200 dark:border-amber-500/30 py-2 text-sm font-medium text-amber-700 dark:text-amber-300"
            >
              Я сохранил
            </button>
          </div>
        </div>
      )}

      {/* Создание */}
      {showCreate ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <p className="text-sm font-semibold">Новый ключ</p>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Название *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="1С интеграция / Excel-скрипт / BI"
              maxLength={100}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Права</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "READ" | "WRITE")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
              >
                <option value="READ">Только чтение</option>
                <option value="WRITE">Чтение и запись</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Срок (дни)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="90 (или пусто)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreate(false); setName("") }}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400"
            >
              Отмена
            </button>
            <button
              onClick={handleCreate}
              disabled={pending || name.length < 3}
              className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "..." : "Создать"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Создать API-ключ
        </button>
      )}

      {/* Список */}
      {initialKeys.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Key className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Нет ключей</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Название</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Префикс</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Права</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Использован</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Истекает</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {initialKeys.map((k) => {
                const isRevoked = !!k.revokedAt
                const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date()
                const inactive = isRevoked || isExpired
                return (
                  <tr key={k.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{k.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">{k.keyPrefix}…</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        k.scope === "WRITE"
                          ? "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300"
                          : "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                      }`}>
                        {k.scope === "WRITE" ? "Чтение+Запись" : "Только чтение"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {isRevoked ? (
                        <span className="text-red-600 dark:text-red-400">Отозван</span>
                      ) : isExpired ? (
                        <span className="text-red-600 dark:text-red-400">Истёк</span>
                      ) : k.expiresAt ? (
                        new Date(k.expiresAt).toLocaleDateString("ru-RU")
                      ) : (
                        "Бессрочно"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!inactive && (
                        <button
                          onClick={() => handleRevoke(k.id, k.name)}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
                        >
                          <Ban className="h-3 w-3" />
                          Отозвать
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
