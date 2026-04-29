"use client"

import { useState, useTransition } from "react"
import { Send, Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { setMyTelegramChatId } from "@/app/actions/notifications"

export function TelegramSetup({ currentChatId }: { currentChatId: string | null }) {
  const [chatId, setChatId] = useState(currentChatId ?? "")
  const [pending, startTransition] = useTransition()
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? "CommrentBot"

  if (currentChatId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900">Telegram подключён</p>
            <p className="text-xs text-emerald-700 mt-0.5">Chat ID: <span className="font-mono">{currentChatId}</span></p>
          </div>
        </div>
        <button
          onClick={() => {
            startTransition(async () => {
              try {
                await setMyTelegramChatId("")
                toast.success("Telegram отключён")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          className="text-xs text-red-500 hover:underline"
        >
          Отключить Telegram
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Получайте уведомления о просрочках, новых заявках и истечении договоров прямо в Telegram. Это бесплатно и быстрее SMS.
      </p>

      <div className="space-y-2 rounded-lg bg-slate-50 border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">Как подключить:</p>
        <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
          <li>
            Откройте бота:{" "}
            <a href={`https://t.me/${botName}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono">
              @{botName}
            </a>
          </li>
          <li>Нажмите <span className="font-mono bg-white px-1.5 py-0.5 rounded border">Start</span></li>
          <li>Бот пришлёт ваш <span className="font-semibold">Chat ID</span> — скопируйте его</li>
          <li>Вставьте в поле ниже и сохраните</li>
        </ol>
      </div>

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
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !chatId}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {pending ? "..." : "Подключить"}
        </button>
      </form>

      <p className="text-xs text-slate-400">
        💡 Если бот ещё не создан администратором — напишите ему. Без бота уведомления приходят только в самом приложении (колокольчик в шапке).
      </p>
    </div>
  )
}
