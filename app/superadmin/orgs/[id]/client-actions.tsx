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
  const [pending, startTransition] = useTransition()
  const [confirmInput, setConfirmInput] = useState("")
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Опасная зона</p>
      </div>

      {/* Деактивация / Реактивация */}
      <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-red-100 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {isActive ? "Деактивировать организацию" : "Активировать организацию"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isActive
              ? "Клиент не сможет войти. Данные сохранятся, можно восстановить."
              : "Клиент снова сможет войти и работать."}
          </p>
        </div>
        <button
          onClick={() => {
            const action = isActive ? "Деактивировать" : "Активировать"
            if (!confirm(`${action} организацию «${orgName}»?`)) return
            startTransition(async () => {
              try {
                if (isActive) await deactivateOrganization(orgId)
                else await reactivateOrganization(orgId)
                toast.success(isActive ? "Деактивирована" : "Активирована")
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          disabled={pending}
          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-60 ${
            isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          {isActive ? "Деактивировать" : "Активировать"}
        </button>
      </div>

      {/* Удаление */}
      <div className="bg-white rounded-xl border border-red-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-900">Удалить организацию навсегда</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Удалит {buildingsCount} зданий и каскадно все связанные данные (этажи, помещения,
              арендаторы, договора, платежи). Пользователи останутся в системе как
              неактивные. Действие необратимо.
            </p>
          </div>
          {!showDelete && (
            <button
              onClick={() => setShowDelete(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-xs font-medium text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Удалить…
            </button>
          )}
        </div>

        {showDelete && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
            <p className="text-xs text-red-800">
              Чтобы подтвердить — введите slug организации <b className="font-mono">{orgSlug}</b>:
            </p>
            <div className="flex gap-2">
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={orgSlug}
                className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-mono bg-white"
              />
              <button
                onClick={() => {
                  if (confirmInput.trim() !== orgSlug) {
                    toast.error("Slug не совпадает")
                    return
                  }
                  if (!confirm(`УДАЛИТЬ ${orgName} НАВСЕГДА? Это необратимо.`)) return
                  startTransition(async () => {
                    try {
                      await deleteOrganization(orgId, confirmInput)
                      toast.success("Организация удалена")
                      // Server action делает redirect — но на всякий случай
                      router.push("/superadmin/orgs")
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Ошибка")
                    }
                  })
                }}
                disabled={pending || confirmInput.trim() !== orgSlug}
                className="rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-300 px-3 py-2 text-xs font-medium text-white"
              >
                Удалить навсегда
              </button>
              <button
                onClick={() => {
                  setShowDelete(false)
                  setConfirmInput("")
                }}
                className="rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
              >
                Отмена
              </button>
            </div>
            {usersCount > 0 && (
              <p className="text-[10px] text-amber-700">
                ⚠️ {usersCount} пользователей будут отвязаны от организации и деактивированы.
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
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState(currentOwnerId ?? "")

  if (owners.length === 0) {
    return (
      <p className="text-xs text-slate-400 mt-3">
        В организации нет активных OWNER/ADMIN. Войдите в /admin/users как клиент чтобы создать.
      </p>
    )
  }

  const willPromote = (() => {
    const u = owners.find((x) => x.id === selected)
    return u && u.role !== "OWNER"
  })()

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
      <label className="block text-xs font-medium text-slate-500">Сменить владельца</label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
        >
          <option value="">— выбрать —</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              [{u.role}] {u.name} — {u.email || u.phone}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!selected) {
              toast.error("Выберите пользователя")
              return
            }
            startTransition(async () => {
              try {
                await changeOrgOwner(orgId, selected)
                toast.success(willPromote ? "Повышен до OWNER и назначен владельцем" : "Владелец изменён")
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          disabled={pending || !selected || selected === currentOwnerId}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          Сменить
        </button>
      </div>
      {willPromote && (
        <p className="text-[10px] text-amber-700">
          ⚠️ Пользователь будет автоматически повышен с ADMIN до OWNER.
        </p>
      )}
    </div>
  )
}
