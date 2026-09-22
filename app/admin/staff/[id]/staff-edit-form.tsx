"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateStaff, deactivateStaff, reactivateStaff } from "@/app/actions/staff"
import { Button } from "@/components/ui/button"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"
import { useT } from "@/lib/i18n/client"

const ROLE_VALUES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"] as const

export function StaffEditForm({
  userId, staffId, initial, isCurrentUser,
}: {
  userId: string
  staffId: string | null
  initial: {
    name: string
    phone: string | null
    email: string | null
    role: string
    position: string
    salary: number
    isActive: boolean
  }
  isCurrentUser: boolean
}) {
  const { t } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (!staffId) {
            toast.error(t("adminSettings.staff.form.noStaffRecord"))
            return
          }
          try {
            await updateStaff(staffId, userId, fd)
            toast.success(t("adminSettings.staff.form.saved"))
            router.refresh()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("adminSettings.staff.form.error"))
          }
        })
      }
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.fio")} *</label>
          <input
            name="name"
            defaultValue={initial.name}
            required
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.phone")}</label>
          <KzPhoneInput
            name="phone"
            defaultValue={initial.phone ?? ""}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.email")}</label>
          <AsciiEmailInput
            name="email"
            defaultValue={initial.email ?? ""}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.role")}</label>
          <select
            name="role"
            defaultValue={initial.role}
            disabled={isCurrentUser}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 dark:disabled:text-slate-400"
          >
            {ROLE_VALUES.map((value) => (
              <option key={value} value={value}>{t(`adminSettings.staff.roles.${value}`)}</option>
            ))}
          </select>
          {isCurrentUser && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              {t("adminSettings.staff.form.ownRoleLocked")}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.position")}</label>
          <input
            name="position"
            defaultValue={initial.position}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.salary")}</label>
          <input
            name="salary"
            type="number"
            defaultValue={initial.salary}
            min={0}
            step={1000}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            {t("adminSettings.staff.form.newPasswordLabel")}
          </label>
          <input
            type="password"
            name="newPassword"
            placeholder="••••••••"
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          disabled={isCurrentUser}
          onClick={() =>
            startTransition(async () => {
              try {
                if (initial.isActive) {
                  await deactivateStaff(userId)
                  toast.success(t("adminSettings.staff.form.dismissed"))
                } else {
                  await reactivateStaff(userId)
                  toast.success(t("adminSettings.staff.form.restored"))
                }
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("adminSettings.staff.form.error"))
              }
            })
          }
          className={`text-xs font-medium ${
            initial.isActive ? "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
          } disabled:text-slate-400 dark:text-slate-500`}
          title={isCurrentUser ? t("adminSettings.staff.form.cannotDismissSelf") : ""}
        >
          {initial.isActive ? t("adminSettings.staff.dismiss") : t("adminSettings.staff.restore")}
        </button>
        <Button
          type="submit"
          loading={pending}
          className="font-medium"
        >
          {pending ? t("common.actions.saving") : t("common.actions.save")}
        </Button>
      </div>
    </form>
  )
}
