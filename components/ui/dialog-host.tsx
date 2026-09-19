"use client"

// Общие окна «Подтвердить?» и «Введите текст» в стиле сайта вместо
// браузерных confirm()/prompt() (серые, не в теме, блокируют страницу).
//
//   if (!(await askConfirm({ title: "Удалить документ?", danger: true }))) return
//   const reason = await askText({ title: "Причина отказа", optional: true })
//
// <DialogHost /> подключён один раз в app/layout.tsx.

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FIELD_CLS } from "@/lib/ui-fields"

type ConfirmOpts = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
type TextOpts = {
  title: string
  description?: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  /** Можно оставить пустым (вернётся "") */
  optional?: boolean
  /** Точное слово для подтверждения опасного действия, напр. «удалить» */
  requireText?: string
}

type Request =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "text"; opts: TextOpts; resolve: (v: string | null) => void }

let push: ((r: Request) => void) | null = null

export function askConfirm(opts: ConfirmOpts | string): Promise<boolean> {
  const o = typeof opts === "string" ? { title: opts } : opts
  if (!push) return Promise.resolve(window.confirm(o.title))
  return new Promise((resolve) => push!({ kind: "confirm", opts: o, resolve }))
}

export function askText(opts: TextOpts | string): Promise<string | null> {
  const o = typeof opts === "string" ? { title: opts } : opts
  if (!push) return Promise.resolve(window.prompt(o.title, o.defaultValue ?? ""))
  return new Promise((resolve) => push!({ kind: "text", opts: o, resolve }))
}

export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null)
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    push = (r) => {
      setValue(r.kind === "text" ? r.opts.defaultValue ?? "" : "")
      setReq(r)
    }
    return () => { push = null }
  }, [])

  function close(result: boolean) {
    if (!req) return
    if (req.kind === "confirm") req.resolve(result)
    else req.resolve(result ? value.trim() : null)
    setReq(null)
  }

  const textBlocked =
    req?.kind === "text" &&
    ((req.opts.requireText && value.trim().toLowerCase() !== req.opts.requireText.toLowerCase()) ||
      (!req.opts.optional && !req.opts.requireText && !value.trim()))

  const danger = req?.kind === "confirm" ? req.opts.danger : !!req?.opts && "requireText" in req.opts && !!req.opts.requireText

  return (
    <Dialog open={!!req} onOpenChange={(open) => { if (!open) close(false) }}>
      {req && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{req.opts.title}</DialogTitle>
            {req.opts.description && <DialogDescription>{req.opts.description}</DialogDescription>}
          </DialogHeader>
          {req.kind === "text" && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!textBlocked) close(true) }}
              className="space-y-1.5"
            >
              {(req.opts.label || req.opts.requireText) && (
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  {req.opts.requireText ? `Для подтверждения напишите «${req.opts.requireText}»` : req.opts.label}
                </label>
              )}
              <input
                ref={inputRef}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={req.opts.placeholder}
                className={FIELD_CLS}
              />
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {req.kind === "confirm" ? req.opts.cancelLabel ?? "Отмена" : "Отмена"}
            </Button>
            <Button
              variant={danger ? "destructive" : "default"}
              disabled={!!textBlocked}
              onClick={() => close(true)}
            >
              {req.opts.confirmLabel ?? (req.kind === "confirm" ? "Подтвердить" : "Готово")}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
