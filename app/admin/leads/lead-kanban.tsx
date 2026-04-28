"use client"

import { useState, useTransition } from "react"
import { Plus, X, Phone, Mail, MapPin, ArrowRight, ArrowLeft, Calendar, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createLead, updateLeadStatus, bookSpaceForLead, unbookSpaceForLead, deleteLead, LEAD_STATUSES, LEAD_SOURCES } from "@/app/actions/leads"
import { cn } from "@/lib/utils"

type Lead = {
  id: string
  name: string
  contact: string
  contactType: string
  companyName: string | null
  legalType: string | null
  desiredArea: number | null
  budget: number | null
  source: string
  status: string
  notes: string | null
  bookedUntil: Date | null
  spaceId: string | null
  createdAt: Date
}

type Space = {
  id: string
  number: string
  area: number
  status: string
  floor: { name: string }
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новые",
  SHOWN: "Показано",
  NEGOTIATION: "Переговоры",
  SIGNED: "Подписан",
  LOST: "Отказ",
}
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-50 border-blue-200",
  SHOWN: "bg-amber-50 border-amber-200",
  NEGOTIATION: "bg-purple-50 border-purple-200",
  SIGNED: "bg-emerald-50 border-emerald-200",
  LOST: "bg-slate-50 border-slate-200",
}
const SOURCE_LABELS: Record<string, string> = {
  SITE: "Сайт", KRISHA: "Krisha", OLX: "OLX",
  WORD_OF_MOUTH: "Сарафан", CALL: "Звонок", OTHER: "Прочее",
}

export function LeadKanban({ leads, vacantSpaces }: { leads: Lead[]; vacantSpaces: Space[] }) {
  const [open, setOpen] = useState(false)
  const [bookingFor, setBookingFor] = useState<Lead | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Воронка лидов</h1>
          <p className="text-sm text-slate-500 mt-0.5">{leads.length} потенциальных арендаторов</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Новый лид
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {LEAD_STATUSES.map((status) => {
          const items = leads.filter((l) => l.status === status)
          const total = items.reduce((s, l) => s + (l.budget ?? 0), 0)
          return (
            <div key={status} className={cn("rounded-xl border-2 overflow-hidden", STATUS_COLORS[status])}>
              <div className="px-3 py-2.5 border-b border-slate-200 bg-white/60 backdrop-blur-sm">
                <p className="text-xs font-semibold text-slate-700">{STATUS_LABELS[status]}</p>
                <p className="text-[10px] text-slate-500">{items.length} лидов · {total.toLocaleString("ru-RU")} ₸</p>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {items.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    onMove={(dir) => {
                      const idx = LEAD_STATUSES.indexOf(l.status as typeof LEAD_STATUSES[number])
                      const next = LEAD_STATUSES[Math.max(0, Math.min(LEAD_STATUSES.length - 1, idx + dir))]
                      if (next !== l.status) {
                        startTransition(async () => {
                          await updateLeadStatus(l.id, next).catch(() => toast.error("Ошибка"))
                        })
                      }
                    }}
                    onBook={() => setBookingFor(l)}
                    onUnbook={() => {
                      startTransition(async () => {
                        try {
                          await unbookSpaceForLead(l.id)
                          toast.success("Бронь снята")
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка") }
                      })
                    }}
                    onDelete={() => {
                      if (!confirm(`Удалить лида "${l.name}"?`)) return
                      startTransition(async () => {
                        try {
                          await deleteLead(l.id)
                          toast.success("Удалён")
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка") }
                      })
                    }}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-4">Нет лидов</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {open && (
        <CreateLeadDialog onClose={() => setOpen(false)} pending={pending} startTransition={startTransition} />
      )}

      {bookingFor && (
        <BookSpaceDialog
          lead={bookingFor}
          vacantSpaces={vacantSpaces}
          onClose={() => setBookingFor(null)}
          pending={pending}
          startTransition={startTransition}
        />
      )}
    </div>
  )
}

function LeadCard({ lead, onMove, onBook, onUnbook, onDelete }: {
  lead: Lead
  onMove: (dir: -1 | 1) => void
  onBook: () => void
  onUnbook: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{lead.name}</p>
          {lead.companyName && <p className="text-[10px] text-slate-500 truncate">{lead.companyName}</p>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={onDelete} className="text-slate-400 hover:text-red-600">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
        {lead.contactType === "EMAIL" ? <Mail className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
        <span className="truncate">{lead.contact}</span>
      </div>

      {(lead.desiredArea || lead.budget) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.desiredArea && (
            <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{lead.desiredArea} м²</span>
          )}
          {lead.budget && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">
              {lead.budget.toLocaleString("ru-RU")} ₸
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">{SOURCE_LABELS[lead.source] ?? lead.source}</span>
        {lead.spaceId && lead.bookedUntil && (
          <span className="text-[10px] text-purple-600 inline-flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            До {new Date(lead.bookedUntil).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <button onClick={() => onMove(-1)} className="flex-1 rounded text-[10px] py-1 hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="h-3 w-3 inline" />
        </button>
        {!lead.spaceId && lead.status !== "LOST" && lead.status !== "SIGNED" && (
          <button onClick={onBook} className="flex-1 rounded text-[10px] py-1 hover:bg-purple-100 text-purple-600">
            Бронь
          </button>
        )}
        {lead.spaceId && (
          <button onClick={onUnbook} className="flex-1 rounded text-[10px] py-1 hover:bg-slate-100 text-slate-500">
            Снять
          </button>
        )}
        <button onClick={() => onMove(1)} className="flex-1 rounded text-[10px] py-1 hover:bg-slate-100 text-slate-500">
          <ArrowRight className="h-3 w-3 inline" />
        </button>
      </div>
    </div>
  )
}

function CreateLeadDialog({ onClose, pending, startTransition }: {
  onClose: () => void
  pending: boolean
  startTransition: (fn: () => void) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">Новый лид</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form
          action={(fd) => {
            startTransition(async () => {
              try {
                await createLead(fd)
                toast.success("Лид добавлен")
                onClose()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          className="p-6 space-y-4"
        >
          <Field label="Имя *" name="name" required />
          <Field label="Контакт * (телефон или email)" name="contact" required placeholder="+7... или email@..." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Компания" name="companyName" />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Тип</label>
              <select name="legalType" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                <option value="">—</option>
                <option value="IP">ИП</option>
                <option value="TOO">ТОО</option>
                <option value="AO">АО</option>
                <option value="PHYSICAL">Физ. лицо</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Площадь м²" name="desiredArea" type="number" step="0.1" />
            <Field label="Бюджет ₸/мес" name="budget" type="number" step="100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Источник</label>
            <select name="source" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Заметки</label>
            <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm">Отмена</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
              {pending ? "..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BookSpaceDialog({ lead, vacantSpaces, onClose, startTransition }: {
  lead: Lead
  vacantSpaces: Space[]
  onClose: () => void
  pending: boolean
  startTransition: (fn: () => void) => void
}) {
  const [spaceId, setSpaceId] = useState("")
  const [days, setDays] = useState(7)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">Бронь для {lead.name}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Помещение</label>
            <select
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">— выберите —</option>
              {vacantSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  Каб. {s.number} · {s.floor.name} · {s.area} м²
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Срок брони (дни)</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 7)}
              min={1}
              max={30}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm">Отмена</button>
            <button
              disabled={!spaceId}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await bookSpaceForLead(lead.id, spaceId, days)
                    toast.success("Помещение забронировано")
                    onClose()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка")
                  }
                })
              }}
              className="flex-1 rounded-lg bg-purple-600 py-2 text-sm text-white disabled:opacity-50"
            >
              Забронировать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, name, type = "text", placeholder, required, step }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean; step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
