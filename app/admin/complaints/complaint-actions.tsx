"use client"

import { useState, useTransition } from "react"
import { X, MessageSquare, CheckCircle } from "lucide-react"
import { respondToComplaint, resolveComplaint } from "@/app/actions/complaints"

export function RespondButton({ complaintId, hasResponse }: { complaintId: string; hasResponse: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [resolvePending, startResolveTransition] = useTransition()

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        {!hasResponse && (
          <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            Ответить
          </button>
        )}
        {hasResponse && (
          <button
            onClick={() => startResolveTransition(async () => { await resolveComplaint(complaintId) })}
            disabled={resolvePending}
            className="text-xs text-emerald-600 hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCircle className="h-3 w-3" />
            {resolvePending ? "..." : "Решена"}
          </button>
        )}
        {hasResponse && (
          <button onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:underline flex items-center gap-1">
            Изменить ответ
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold">Ответить на жалобу</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => { await respondToComplaint(complaintId, fd); setOpen(false) })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Ответ администратора</label>
                <textarea
                  name="response"
                  required
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                  placeholder="Введите ответ..."
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Отправка..." : "Ответить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
