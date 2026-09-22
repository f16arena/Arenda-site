"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { createTenant } from "@/app/actions/tenant-create"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { TenantIdentityFields } from "./tenant-identity-fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"

// Карточка арендатора = только реквизиты/контакты. Помещение, аренда и срок
// задаются в договоре (помещение — на странице этажа), поэтому форма создания
// больше не принимает выбор помещений (vacantSpaces оставлен для совместимости
// сигнатуры вызова со страницы /admin/tenants).
type Space = { id: string; number: string; floorName: string; buildingName?: string; area: number; isObject?: boolean }

export function TenantDialog({ buildingId, label, variant }: { vacantSpaces?: Space[]; buildingId?: string | null; label?: string; variant?: "outline" }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant={variant}
        leftIcon={<Plus className="h-4 w-4" />}
        title={t("adminTenants.create.buttonHint")}
      >
        {label ?? t("adminTenants.create.button")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт создание — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("adminTenants.create.title")}</DialogTitle>
          </DialogHeader>

          <form
            action={(formData) => {
              startTransition(async () => {
                try {
                  const result = await createTenant(formData)
                  if (!result.success) { toast.error(result.error); return }
                  toast.success(t("adminTenants.create.created"))
                  setOpen(false)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("adminTenants.create.failed"))
                }
              })
            }}
            className="space-y-4"
          >
              {buildingId && <input type="hidden" name="buildingId" value={buildingId} />}
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t("adminTenants.create.contactSection")}</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.fullName")}</label>
                <Input name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.phone")}</label>
                  <KzPhoneInput name="phone" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.email")}</label>
                  <AsciiEmailInput name="email" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  {t("adminTenants.create.password")} <span className="text-slate-400">{t("adminTenants.create.passwordHint")}</span>
                </label>
                <Input name="password" type="text" placeholder={t("adminTenants.create.passwordPlaceholder")} />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  name="sendWelcome"
                  type="checkbox"
                  defaultChecked
                  className="mt-0.5 rounded border-slate-300"
                />
                <div>
                  <span className="font-medium">{t("adminTenants.create.welcome")}</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t("adminTenants.create.welcomeHint")}
                  </p>
                </div>
              </label>

              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-2">{t("adminTenants.create.companySection")}</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.companyName")}</label>
                <Input name="companyName" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TenantIdentityFields initialLegalType="IP" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.category")}</label>
                <Input name="category" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.legalAddress")}</label>
                <AddressAutocompleteInput
                  name="legalAddress"
                  includeStructuredFields={false}
                  placeholder={t("adminTenants.create.legalAddressPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.create.actualAddress")}</label>
                <AddressAutocompleteInput
                  name="actualAddress"
                  includeStructuredFields={false}
                  placeholder={t("adminTenants.create.actualAddressPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  {t("adminTenants.create.placement")} <span className="text-slate-400">{t("adminTenants.create.placementHint")}</span>
                </label>
                <Input
                  name="placementNote"
                  placeholder={t("adminTenants.create.placementPlaceholder")}
                />
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                {t("adminTenants.create.note")}
              </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
              <Button type="submit" loading={pending} className="flex-1">
                {pending ? t("adminTenants.create.creating") : t("adminTenants.create.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
