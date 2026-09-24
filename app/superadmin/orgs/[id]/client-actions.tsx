"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { LogIn, Trash2, Power, PowerOff, AlertTriangle } from "lucide-react"
import {
  updateOrganization,
  extendSubscription,
  impersonateOrg,
  changeOrgOwner,
  deactivateOrganization,
  reactivateOrganization,
  deleteOrganization,
} from "@/app/actions/organizations"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"

export function OrgActions({ orgId, hasOwner }: { orgId: string; hasOwner: boolean }) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex gap-2">
      {hasOwner && (
        <ConfirmDialog
          title={t("superadmin.orgs.loginAsClientTitle")}
          description={t("superadmin.orgs.loginAsClientDescription")}
          confirmLabel={t("superadmin.orgs.loginAs")}
          onConfirm={() =>
            startTransition(async () => {
              try {
                await impersonateOrg(orgId)
                toast.success(t("superadmin.orgs.loggingIn"))
                router.push("/admin")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("common.state.error"))
              }
            })
          }
          trigger={
            <Button
              size="sm"
              disabled={pending}
            >
              <LogIn className="h-3.5 w-3.5" />
              {t("superadmin.orgs.loginAsClient")}
            </Button>
          }
        />
      )}
    </div>
  )
}

export function OrgEditForm({
  orgId, initial, plans,
}: {
  orgId: string
  initial: { name: string; planId: string; isActive: boolean; isSuspended: boolean }
  plans: { id: string; name: string; priceMonthly: number }[]
}) {
  const { t, locale } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          try {
            await updateOrganization(orgId, fd)
            toast.success(t("common.state.saved"))
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("common.state.error"))
          }
        })
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("superadmin.org.fieldName")}</label>
        <Input
          name="name"
          defaultValue={initial.name}
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("superadmin.org.fieldPlan")}</label>
        <select
          name="planId"
          defaultValue={initial.planId}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {formatMoneyL(locale, p.priceMonthly)}{t("common.money.perMonth")}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="rounded" />
          {t("superadmin.org.isActive")}
        </label>
        <label className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 cursor-pointer">
          <input type="checkbox" name="isSuspended" defaultChecked={initial.isSuspended} className="rounded" />
          {t("superadmin.org.isSuspended")}
        </label>
      </div>
      <Button
        type="submit"
        loading={pending}
        className="font-medium"
      >
        {pending ? t("common.actions.saving") : t("common.actions.save")}
      </Button>
    </form>
  )
}

export function ExtendForm({ orgId, planPrice }: { orgId: string; planPrice: number }) {
  const { t, locale } = useT()
  const [pending, startTransition] = useTransition()
  const [months, setMonths] = useState(1)
  const [paid, setPaid] = useState(planPrice)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("superadmin.org.extendMonths")}</label>
          <Input
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(e) => {
              const m = parseInt(e.target.value) || 1
              setMonths(m)
              setPaid(m * planPrice)
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("superadmin.org.extendPaid")}</label>
          <Input
            type="number"
            value={paid}
            onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
      <button
        onClick={() => {
          startTransition(async () => {
            try {
              await extendSubscription(orgId, months, paid)
              toast.success(t("superadmin.org.extended", { count: months, amount: formatMoneyL(locale, paid) }))
            } catch (e) {
              toast.error(e instanceof Error ? e.message : t("common.state.error"))
            }
          })
        }}
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? t("common.actions.saving") : t("superadmin.org.extendButton", { count: months })}
      </button>
    </div>
  )
}

export function DangerZone({
  orgId,
  orgSlug,
  orgName,
  isActive,
  buildingsCount,
  usersCount,
}: {
  orgId: string
  orgSlug: string
  orgName: string
  isActive: boolean
  buildingsCount: number
  usersCount: number
}) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [confirmInput, setConfirmInput] = useState("")
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">{t("superadmin.org.danger.zone")}</p>
      </div>

      {/* Деактивация / Реактивация */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-xl border border-red-100 dark:border-red-500/20 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {isActive ? t("superadmin.org.danger.deactivate") : t("superadmin.org.danger.activate")}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isActive
              ? t("superadmin.org.danger.deactivateHint")
              : t("superadmin.org.danger.activateHint")}
          </p>
        </div>
        <ConfirmDialog
          variant={isActive ? "danger" : "default"}
          title={isActive
            ? t("superadmin.org.danger.deactivateTitle", { name: orgName })
            : t("superadmin.org.danger.activateTitle", { name: orgName })}
          confirmLabel={isActive ? t("superadmin.org.danger.deactivateAction") : t("superadmin.org.danger.activateAction")}
          onConfirm={() =>
            startTransition(async () => {
              try {
                if (isActive) await deactivateOrganization(orgId)
                else await reactivateOrganization(orgId)
                toast.success(isActive ? t("superadmin.org.danger.deactivated") : t("superadmin.org.danger.activated"))
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("common.state.error"))
              }
            })
          }
          trigger={
            <button
              disabled={pending}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-60 ${
                isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
              {isActive ? t("superadmin.org.danger.deactivateAction") : t("superadmin.org.danger.activateAction")}
            </button>
          }
        />
      </div>

      {/* Удаление */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-500/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-900 dark:text-red-200">{t("superadmin.org.danger.deleteTitle")}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("superadmin.org.danger.deleteHint", { count: buildingsCount })}
            </p>
          </div>
          {!showDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
              className="shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("superadmin.org.danger.deleteStart")}
            </Button>
          )}
        </div>

        {showDelete && (
          <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2">
            <p className="text-xs text-red-800 dark:text-red-200">
              {t("superadmin.org.danger.confirmSlug")} <b className="font-mono">{orgSlug}</b>
            </p>
            <div className="flex gap-2">
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={orgSlug}
                className="flex-1 rounded-lg border border-red-300 dark:border-red-500/40 px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900"
              />
              <ConfirmDialog
                variant="danger"
                title={t("superadmin.org.danger.confirmDialogTitle", { name: orgName })}
                description={t("superadmin.org.danger.confirmDialogText")}
                confirmLabel={t("superadmin.org.danger.deleteForever")}
                onConfirm={() =>
                  startTransition(async () => {
                    try {
                      await deleteOrganization(orgId, confirmInput)
                      toast.success(t("superadmin.org.danger.deleted"))
                      // Server action делает redirect — но на всякий случай
                      router.push("/superadmin/orgs")
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t("common.state.error"))
                    }
                  })
                }
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending || confirmInput.trim() !== orgSlug}
                  >
                    {t("superadmin.org.danger.deleteForever")}
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDelete(false)
                  setConfirmInput("")
                }}
              >
                {t("common.actions.cancel")}
              </Button>
            </div>
            {usersCount > 0 && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                ⚠️ {t("superadmin.org.danger.usersWarning", { count: usersCount })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChangeOwnerForm({
  orgId, currentOwnerId, owners,
}: {
  orgId: string
  currentOwnerId: string | null
  owners: { id: string; name: string; email: string | null; phone: string | null; role: string }[]
}) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState(currentOwnerId ?? "")

  if (owners.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
        {t("superadmin.org.noOwnersHint")}
      </p>
    )
  }

  const willPromote = (() => {
    const u = owners.find((x) => x.id === selected)
    return u && u.role !== "OWNER"
  })()

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("superadmin.org.changeOwner")}</label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs bg-white dark:bg-slate-900"
        >
          <option value="">{t("superadmin.org.choose")}</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              [{u.role}] {u.name} — {u.email || u.phone}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={() => {
            if (!selected) {
              toast.error(t("superadmin.org.pickUser"))
              return
            }
            startTransition(async () => {
              try {
                await changeOrgOwner(orgId, selected)
                toast.success(willPromote ? t("superadmin.org.promoted") : t("superadmin.org.ownerChanged"))
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("common.state.error"))
              }
            })
          }}
          loading={pending}
          disabled={!selected || selected === currentOwnerId}
          className="font-medium"
        >
          {t("superadmin.org.changeOwnerButton")}
        </Button>
      </div>
      {willPromote && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          ⚠️ {t("superadmin.org.promoteWarning")}
        </p>
      )}
    </div>
  )
}
