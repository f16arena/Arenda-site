"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { LogIn, Trash2 } from "lucide-react"
import {
  updateOrganization,
  extendSubscription,
  impersonateOrg,
  changeOrgOwner,
} from "@/app/actions/organizations"

export function OrgActions({ orgId, hasOwner }: { orgId: string; hasOwner: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex gap-2">
      {hasOwner && (
        <button
          onClick={() => {
            if (!confirm("Войти под этим клиентом? Все ваши действия будут залогированы.")) return
            startTransition(async () => {
              try {
                await impersonateOrg(orgId)
                toast.success("Входим как клиент...")
                router.push("/admin")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white"
        >
          <LogIn className="h-3.5 w-3.5" />
          Войти как клиент
        </button>
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
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          try {
            await updateOrganization(orgId, fd)
            toast.success("Сохранено")
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Название</label>
        <input
          name="name"
          defaultValue={initial.name}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Тариф</label>
        <select
          name="planId"
          defaultValue={initial.planId}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.priceMonthly.toLocaleString("ru-RU")} ₸/мес</option>
          ))}
        </select>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="rounded" />
          Активна
        </label>
        <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
          <input type="checkbox" name="isSuspended" defaultChecked={initial.isSuspended} className="rounded" />
          Приостановлена
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "..." : "Сохранить"}
      </button>
    </form>
  )
}

export function ExtendForm({ orgId, planPrice }: { orgId: string; planPrice: number }) {
  const [pending, startTransition] = useTransition()
  const [months, setMonths] = useState(1)
  const [paid, setPaid] = useState(planPrice)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Срок (месяцев)</label>
          <input
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(e) => {
              const m = parseInt(e.target.value) || 1
              setMonths(m)
              setPaid(m * planPrice)
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Оплачено ₸</label>
          <input
            type="number"
            value={paid}
            onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <button
        onClick={() => {
          startTransition(async () => {
            try {
              await extendSubscription(orgId, months, paid)
              toast.success(`Продлено на ${months} мес. Оплачено ${paid.toLocaleString("ru-RU")} ₸`)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ошибка")
            }
          })
        }}
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "..." : `Продлить на ${months} мес.`}
      </button>
    </div>
  )
}

export function ChangeOwnerForm({
  orgId, currentOwnerId, owners,
}: {
  orgId: string
  currentOwnerId: string | null
  owners: { id: string; name: string; email: string | null; phone: string | null }[]
}) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState(currentOwnerId ?? "")

  if (owners.length === 0) {
    return (
      <p className="text-xs text-slate-400 mt-3">
        В организации нет пользователей с ролью OWNER. Создайте через /admin/users войдя как клиент.
      </p>
    )
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
      <label className="block text-xs font-medium text-slate-500">Сменить владельца</label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
        >
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.email || u.phone}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            startTransition(async () => {
              try {
                await changeOrgOwner(orgId, selected)
                toast.success("Владелец изменён")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          disabled={pending || selected === currentOwnerId}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          Сменить
        </button>
      </div>
    </div>
  )
}
