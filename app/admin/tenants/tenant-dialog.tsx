"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { createTenant } from "@/app/actions/tenant-create"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { TenantIdentityFields } from "./tenant-identity-fields"
import { DEFAULT_KZ_VAT_RATE, KZ_VAT_RATE_OPTIONS } from "@/lib/kz-vat"

type Space = { id: string; number: string; floorName: string; buildingName?: string; area: number }

export function TenantDialog({ vacantSpaces, buildingId }: { vacantSpaces: Space[]; buildingId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function toggleSpace(spaceId: string) {
    setSelectedSpaceIds((current) =>
      current.includes(spaceId)
        ? current.filter((id) => id !== spaceId)
        : [...current, spaceId],
    )
  }

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
                    setSelectedSpaceIds([])
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
                  <KzPhoneInput name="phone" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
                  <AsciiEmailInput name="email" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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
                <TenantIdentityFields initialLegalType="IP" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Вид деятельности</label>
                <input name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input name="isVatPayer" type="checkbox" className="mt-0.5 rounded border-slate-300" />
                  <span>
                    <span className="block font-medium">Арендатор — плательщик НДС</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Ставка выбирается только из НК РК.</span>
                  </span>
                </label>
                <select
                  name="vatRate"
                  defaultValue={String(DEFAULT_KZ_VAT_RATE)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                >
                  {KZ_VAT_RATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Юридический адрес</label>
                <AddressAutocompleteInput
                  name="legalAddress"
                  includeStructuredFields={false}
                  placeholder="г. Усть-Каменогорск, ул..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Фактический адрес</label>
                <AddressAutocompleteInput
                  name="actualAddress"
                  includeStructuredFields={false}
                  placeholder="Если совпадает с юридическим — оставьте пустым"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-2">Помещение и договор</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">
                  Помещения <span className="text-slate-400">(можно выбрать несколько)</span>
                </label>
                {selectedSpaceIds.map((id) => (
                  <input key={id} type="hidden" name="spaceIds" value={id} />
                ))}
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  {vacantSpaces.length > 0 ? vacantSpaces.map((s) => {
                    const checked = selectedSpaceIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={[
                          "flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800",
                          checked ? "bg-blue-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSpace(s.id)}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <span>
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {s.buildingName ? `${s.buildingName} · ` : ""}Каб. {s.number}
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {s.floorName} · {s.area} м²
                          </span>
                        </span>
                      </label>
                    )
                  }) : (
                    <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">Нет свободных помещений</p>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Не выбрано — арендатор будет создан без помещения.
                </p>
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
