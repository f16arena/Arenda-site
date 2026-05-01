"use client"

import { useState, useTransition } from "react"
import { Send, Check, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  setMyTelegramChatId,
  generateTelegramConnectLink,
  disconnectTelegram,
} from "@/app/actions/notifications"

export function TelegramSetup({ currentChatId }: { currentChatId: string | null }) {
  const [chatId, setChatId] = useState(currentChatId ?? "")
  const [pending, startTransition] = useTransition()
  const [connecting, setConnecting] = useState(false)
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? "CommrentBot"

  if (currentChatId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">Telegram подключён</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              Chat ID: <span className="font-mono">{currentChatId}</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            startTransition(async () => {
              try {
                await disconnectTelegram()
                toast.success("Telegram отключён")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          disabled={pending}
          className="text-xs text-red-500 hover:underline disabled:opacity-60"
        >
          Отключить Telegram
        </button>
      </div>
    )
  }

  async function quickConnect() {
    setConnecting(true)
    try {
      const r = await generateTelegramConnectLink()
      if (r.ok) {
        // Откроем в новой вкладке
        window.open(r.url, "_blank", "noopener,noreferrer")
        toast.success("Открываю Telegram. Нажмите Start в боте.")
      } else {
        toast.error(r.error)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Получайте уведомления о просрочках, новых заявках и истечении договоров прямо в Telegram. Это бесплатно и быстрее SMS.
      </p>

      {/* Быстрая кнопка */}
      <button
        onClick={quickConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {connecting ? "Открываю Telegram..." : "Подключить Telegram автоматически"}
        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
      </button>

      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
        Откроется бот {`@${botName}`} с уже подготовленной ссылкой. Нажмите Start — Telegram привяжется автоматически.
      </p>

      {/* Ручной способ — collapsed */}
      <details className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2">
        <summary className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          Подключить вручную (если не работает авто)
        </summary>
        <div className="mt-3 space-y-3">
          <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
            <li>
              Откройте бота:{" "}
              <a href={`https://t.me/${botName}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-mono">
                @{botName}
              </a>
            </li>
            <li>Нажмите <span className="font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">Start</span></li>
            <li>Бот пришлёт ваш <span className="font-semibold">Chat ID</span> — скопируйте</li>
            <li>Вставьте в поле ниже и сохраните</li>
          </ol>

          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  const id = String(fd.get("chatId") ?? "").trim()
                  if (!id) throw new Error("Введите Chat ID")
                  await setMyTelegramChatId(id)
                  toast.success("Telegram подключён")
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Ошибка")
                }
              })
            }
            className="flex gap-2"
          >
            <input
              name="chatId"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="123456789"
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !chatId}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "..." : "Сохранить"}
            </button>
          </form>
        </div>
      </details>
    </div>
  )
}
