"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { createTenant } from "@/app/actions/tenant-create"

type Space = { id: string; number: string; floorName: string; buildingName?: string; area: number }

export function TenantDialog({ vacantSpaces, buildingId }: { vacantSpaces: Space[]; buildingId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Добавить арендатора
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Новый арендатор</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={(formData) => {
                startTransition(async () => {
                  try {
                    await createTenant(formData)
                    toast.success("Арендатор создан")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось создать")
                  }
                })
              }}
              className="p-6 space-y-4"
            >
              {buildingId && <input type="hidden" name="buildingId" value={buildingId} />}
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Контактное лицо</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ФИО *</label>
                <input name="name" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Телефон *</label>
                  <input name="phone" type="tel" inputMode="tel" required placeholder="+7 700 000 00 00" title="Введите номер Казахстана в формате +7 7XX XXX XX XX" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
                  <input name="email" type="email" placeholder="tenant@example.com" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Пароль для входа <span className="text-slate-400">(если пусто — сгенерируем)</span>
                </label>
                <input name="password" type="text" placeholder="tenant123 или оставьте пустым" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  name="sendWelcome"
                  type="checkbox"
                  defaultChecked
                  className="mt-0.5 rounded border-slate-300"
                />
                <div>
                  <span className="font-medium">Отправить welcome-письмо</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    На указанный email уйдёт письмо с логином, паролем и ссылкой на кабинет.
                    Только если email задан.
                  </p>
                </div>
              </label>

              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-2">Компания</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название компании *</label>
                <input name="companyName" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Форма</label>
                  <select name="legalType" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                    <option value="IP">ИП</option>
                    <option value="TOO">ТОО</option>
                    <option value="AO">АО</option>
                    <option value="PHYSICAL">Физ. лицо</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">БИН / ИИН</label>
                  <input name="bin" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Вид деятельности</label>
                <input name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>

              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-2">Помещение и договор</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Помещение</label>
                <select name="spaceId" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">— Назначить позже —</option>
                  {vacantSpaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.buildingName ? `${s.buildingName} · ` : ""}Каб. {s.number} · {s.floorName} · {s.area} м²
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Начало договора</label>
                  <input name="contractStart" type="date" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Конец договора</label>
                  <input name="contractEnd" type="date" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
                  {pending ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
