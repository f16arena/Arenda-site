"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { Send, Megaphone, Trash2, Paperclip } from "lucide-react"
import { toast } from "sonner"
import { sendMessage, markConversationRead, deleteMessage } from "@/app/actions/messages"
import { cn } from "@/lib/utils"

export type ChatUser = {
  id: string
  name: string
  role: string
  unread: number
  lastMessage: string | null
  lastMessageAt: Date | null
}

export type ChatMessage = {
  id: string
  fromId: string
  toId: string
  subject: string | null
  body: string
  isRead: boolean
  attachmentUrl?: string | null
  createdAt: Date
}

interface ChatViewProps {
  currentUserId: string
  contacts: ChatUser[]
  messagesByContact: Record<string, ChatMessage[]>
  showBroadcast?: boolean
}

const BROADCAST_ID = "BROADCAST_ALL"

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Админ",
  ACCOUNTANT: "Бухгалтер",
  FACILITY_MANAGER: "Завхоз",
  TENANT: "Арендатор",
}

export function ChatView({ currentUserId, contacts, messagesByContact, showBroadcast }: ChatViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedContact = contacts.find((c) => c.id === selectedId)
  const messages = selectedId ? (messagesByContact[selectedId] ?? []) : []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [selectedId, messages.length])

  useEffect(() => {
    if (selectedId && selectedId !== BROADCAST_ID && selectedContact?.unread) {
      markConversationRead(selectedId).catch(() => {})
    }
  }, [selectedId, selectedContact?.unread])

  function handleSend(formData: FormData) {
    if (!selectedId) return
    formData.set("toId", selectedId)
    startTransition(async () => {
      try {
        await sendMessage(formData)
        formRef.current?.reset()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось отправить")
      }
    })
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-0 h-[calc(100vh-180px)] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Sidebar */}
      <div className="border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Контакты</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {showBroadcast && (
            <button
              onClick={() => setSelectedId(BROADCAST_ID)}
              className={cn(
                "w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800",
                selectedId === BROADCAST_ID && "bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-50 dark:hover:bg-blue-500/10"
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20 shrink-0">
                <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Всем (объявление)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Отправить всем участникам</p>
              </div>
            </button>
          )}

          {contacts.length === 0 && !showBroadcast && (
            <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Нет контактов</p>
          )}

          {contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800",
                selectedId === c.id && "bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-50 dark:hover:bg-blue-500/10"
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 shrink-0">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">{c.name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                  {c.unread > 0 && (
                    <span className="bg-blue-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0">
                      {c.unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate">
                  {ROLE_LABELS[c.role] ?? c.role}
                  {c.lastMessage && ` · ${c.lastMessage.slice(0, 30)}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-400 dark:text-slate-500">Выберите контакт чтобы начать</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-3">
              {selectedId === BROADCAST_ID ? (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
                    <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Объявление всем</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Сообщение придёт каждому участнику</p>
                  </div>
                </>
              ) : selectedContact ? (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">{selectedContact.name[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedContact.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{ROLE_LABELS[selectedContact.role] ?? selectedContact.role}</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50 dark:bg-slate-800/50/30">
              {selectedId === BROADCAST_ID ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm">
                    <Megaphone className="h-10 w-10 text-amber-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Режим объявления</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
                      Напишите сообщение и оно будет отправлено всем активным пользователям системы как личное сообщение от вас.
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-slate-400 dark:text-slate-500">Нет сообщений. Напишите первым.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.fromId === currentUserId
                  return (
                    <div key={m.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2.5 group relative",
                          isMine ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                        )}
                      >
                        {m.subject && (
                          <p className={cn("text-xs font-semibold mb-1", isMine ? "text-blue-100" : "text-slate-500 dark:text-slate-400 dark:text-slate-500")}>
                            {m.subject}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        {m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            download="attachment"
                            className={cn(
                              "mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
                              isMine
                                ? "bg-white/15 text-white hover:bg-white/20"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            )}
                          >
                            <Paperclip className="h-3 w-3" />
                            Вложение
                          </a>
                        )}
                        <div className={cn("text-[10px] mt-1 flex items-center gap-2", isMine ? "text-blue-100" : "text-slate-400 dark:text-slate-500")}>
                          <span>{new Date(m.createdAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                          {isMine && (m.isRead ? <span>✓✓</span> : <span>✓</span>)}
                        </div>
                        {isMine && (
                          <button
                            onClick={() => {
                              if (!confirm("Удалить сообщение?")) return
                              deleteMessage(m.id).catch((e) => toast.error(e.message))
                            }}
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                            aria-label="Удалить"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <form
              ref={formRef}
              action={handleSend}
              className="border-t border-slate-100 dark:border-slate-800 p-3 bg-white dark:bg-slate-900"
            >
              {selectedId === BROADCAST_ID && (
                <input
                  name="subject"
                  placeholder="Тема объявления (необязательно)"
                  className="w-full mb-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              )}
              <div className="flex items-end gap-2">
                <textarea
                  name="body"
                  required
                  rows={2}
                  placeholder="Введите сообщение..."
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      formRef.current?.requestSubmit()
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-slate-900 text-white px-4 py-2.5 hover:bg-slate-800 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Enter — отправить, Shift+Enter — новая строка</p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
