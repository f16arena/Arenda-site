"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { createTenant } from "@/app/actions/tenant-create"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { TenantIdentityFields } from "./tenant-identity-fields"
import { Button } from "@/components/ui/button"

// Карточка арендатора = только реквизиты/контакты. Помещение, аренда и срок
// задаются в договоре (помещение — на странице этажа), поэтому форма создания
// больше не принимает выбор помещений (vacantSpaces оставлен для совместимости
// сигнатуры вызова со страницы /admin/tenants).
type Space = { id: string; number: string; floorName: string; buildingName?: string; area: number; isObject?: boolean }

export function TenantDialog({ buildingId }: { vacantSpaces?: Space[]; buildingId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Добавить арендатора
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Новый арендатор</h2>
              <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">ФИО *</label>
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название компании *</label>
                <input name="companyName" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TenantIdentityFields initialLegalType="IP" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Вид деятельности</label>
                <input name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Описание размещения <span className="text-slate-400">(если без помещения — крыша/фасад)</span>
                </label>
                <input
                  name="placementNote"
                  placeholder="например, Крыша — антенно-мачтовое сооружение Beeline"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                Помещение, аренду и срок задаём в договоре (помещение — на странице этажа,
                условия — при создании договора или загрузке внешнего PDF). Здесь карточка — только реквизиты.
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? "Создание..." : "Создать"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
