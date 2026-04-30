"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, Lock, UserCircle, Check, AlertCircle, Copy } from "lucide-react"
import {
  changeMyName,
  changeMyPassword,
  requestEmailChange,
  requestEmailVerification,
} from "@/app/actions/my-account"

interface Props {
  currentName: string
  currentEmail: string | null
  emailVerified: boolean
}

export function ProfileForms({ currentName, currentEmail, emailVerified }: Props) {
  return (
    <div className="space-y-5">
      <NameBlock currentName={currentName} />
      <EmailBlock currentEmail={currentEmail} emailVerified={emailVerified} />
      <PasswordBlock />
    </div>
  )
}

// Экспортируем отдельные блоки для использования в табах
export { NameBlock, EmailBlock, PasswordBlock }

function NameBlock({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName)
  const [pending, startTransition] = useTransition()

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <UserCircle className="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Имя</h2>
      </div>
      <form
        action={(fd) =>
          startTransition(async () => {
            const r = await changeMyName(fd)
            if (r.ok) toast.success(r.message ?? "Сохранено")
            else toast.error(r.error)
          })
        }
        className="p-5 flex gap-2"
      >
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          required
          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || name.trim() === currentName}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "..." : "Сохранить"}
        </button>
      </form>
    </div>
  )
}

function EmailBlock({ currentEmail, emailVerified }: { currentEmail: string | null; emailVerified: boolean }) {
  const [pending, startTransition] = useTransition()
  const [previewLink, setPreviewLink] = useState<string | null>(null)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <Mail className="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Email</h2>
      </div>

      <div className="p-5 space-y-4">
        {currentEmail ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{currentEmail}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {emailVerified ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <p className="text-xs text-emerald-700">Подтверждён</p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    <p className="text-xs text-amber-700">Не подтверждён</p>
                  </>
                )}
              </div>
            </div>
            {!emailVerified && (
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const r = await requestEmailVerification()
                    if (r.ok) {
                      toast.success(r.message ?? "Письмо отправлено")
                      if (r.previewLink) {
                        setPreviewLink(r.previewLink)
                        setPreviewMsg(r.message ?? null)
                      }
                    } else {
                      toast.error(r.error)
                    }
                  })
                }
                disabled={pending}
                className="rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 disabled:opacity-50"
              >
                Подтвердить
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Email не указан</p>
        )}

        <form
          action={(fd) =>
            startTransition(async () => {
              setPreviewLink(null)
              setPreviewMsg(null)
              const r = await requestEmailChange(fd)
              if (r.ok) {
                toast.success(r.message ?? "Письмо отправлено")
                if (r.previewLink) {
                  setPreviewLink(r.previewLink)
                  setPreviewMsg(r.message ?? null)
                }
              } else {
                toast.error(r.error)
              }
            })
          }
          className="space-y-2"
        >
          <label className="block text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Сменить email на новый</label>
          <div className="flex gap-2">
            <input
              type="email"
              name="newEmail"
              required
              placeholder="new@example.com"
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "..." : "Отправить ссылку"}
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            На новый адрес придёт письмо с ссылкой подтверждения. Email обновится после перехода по ссылке.
          </p>
        </form>

        {previewLink && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <p className="text-xs text-blue-900 font-medium">{previewMsg}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                {previewLink}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(previewLink)
                  toast.success("Ссылка скопирована")
                }}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-2 py-1 text-xs text-slate-700 dark:text-slate-300"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PasswordBlock() {
  const [pending, startTransition] = useTransition()
  const [show, setShow] = useState(false)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <Lock className="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Пароль</h2>
      </div>

      <form
        action={(fd) =>
          startTransition(async () => {
            const r = await changeMyPassword(fd)
            if (r.ok) {
              toast.success(r.message ?? "Пароль изменён")
              ;(document.getElementById("change-password-form") as HTMLFormElement | null)?.reset()
            } else {
              toast.error(r.error)
            }
          })
        }
        id="change-password-form"
        className="p-5 space-y-3"
      >
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Текущий пароль</label>
          <input
            type={show ? "text" : "password"}
            name="oldPassword"
            required
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Новый пароль (минимум 8 символов)</label>
          <input
            type={show ? "text" : "password"}
            name="newPassword"
            minLength={8}
            required
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Повторите новый пароль</label>
          <input
            type={show ? "text" : "password"}
            name="confirmPassword"
            minLength={8}
            required
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 cursor-pointer">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Показать пароль
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "..." : "Сменить пароль"}
          </button>
        </div>
      </form>
    </div>
  )
}
