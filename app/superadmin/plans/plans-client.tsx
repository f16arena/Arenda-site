"use client"

import { useState, useTransition } from "react"
import { Plus, X, Edit2, Trash2, Check, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { createPlan, updatePlan, deletePlan } from "@/app/actions/plans"

type Plan = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxBuildings: number | null
  maxTenants: number | null
  maxUsers: number | null
  maxLeads: number | null
  features: string
  isActive: boolean
  sortOrder: number
  _count: { organizations: number }
}

const FEATURE_KEYS = [
  { key: "emailNotifications", label: "Email уведомления" },
  { key: "telegramBot", label: "Telegram бот" },
  { key: "floorEditor", label: "Графический редактор плана" },
  { key: "contractTemplates", label: "Шаблоны договоров" },
  { key: "bankImport", label: "Импорт банковской выписки" },
  { key: "excelExport", label: "Excel экспорт" },
  { key: "export1c", label: "1С экспорт" },
  { key: "cmdkSearch", label: "Глобальный поиск Ctrl+K" },
  { key: "customDomain", label: "Кастомный домен" },
  { key: "api", label: "Public API" },
  { key: "whiteLabel", label: "White label" },
  { key: "aiAssistant", label: "ИИ-ассистент" },
  { key: "prioritySupport", label: "Приоритетная поддержка" },
] as const

export function PlansClient({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Создать тариф
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {plans.map((p) => {
          const features = parseFeatures(p.features)
          const enabledCount = Object.values(features).filter(Boolean).length
          return (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-500">{p.code}</span>
                    {!p.isActive && <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">Неактивен</span>}
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {p.priceMonthly.toLocaleString("ru-RU")} <span className="text-sm font-normal text-slate-500">₸/мес</span>
                  </p>
                  {p.description && <p className="text-xs text-slate-500 mt-1">{p.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(p)} className="text-blue-600 hover:text-blue-800" title="Редактировать">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <DeleteButton planId={p.id} orgCount={p._count.organizations} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 text-xs">
                <Limit label="Зданий" value={p.maxBuildings} />
                <Limit label="Арендаторов" value={p.maxTenants} />
                <Limit label="Пользователей" value={p.maxUsers} />
                <Limit label="Лидов" value={p.maxLeads} />
              </div>

              <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                <p className="text-[10px] text-slate-500 mb-2">
                  Фич включено: {enabledCount} из {FEATURE_KEYS.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {FEATURE_KEYS.filter((f) => features[f.key]).map((f) => (
                    <span key={f.key} className="text-[10px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
                Используют: <b>{p._count.organizations}</b> организаций
              </div>
            </div>
          )
        })}
      </div>

      {(editing || creating) && (
        <PlanForm
          plan={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </>
  )
}

function Limit({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-slate-900">
        {value === null ? "∞" : value}
      </span>
    </div>
  )
}

function DeleteButton({ planId, orgCount }: { planId: string; orgCount: number }) {
  const [pending, startTransition] = useTransition()

  if (orgCount > 0) {
    return (
      <span title={`Используют ${orgCount} организаций`} className="text-slate-300">
        <Trash2 className="h-4 w-4" />
      </span>
    )
  }

  return (
    <button
      onClick={() => {
        if (!confirm("Удалить тариф?")) return
        startTransition(async () => {
          try {
            await deletePlan(planId)
            toast.success("Удалён")
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }}
      disabled={pending}
      className="text-red-400 hover:text-red-600"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

function PlanForm({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const isEdit = !!plan
  const features = isEdit ? parseFeatures(plan.features) : {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold">{isEdit ? "Редактировать тариф" : "Новый тариф"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form
          action={(fd) => {
            startTransition(async () => {
              try {
                if (isEdit && plan) {
                  await updatePlan(plan.id, fd)
                  toast.success("Сохранено")
                } else {
                  await createPlan(fd)
                  toast.success("Тариф создан")
                }
                onClose()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }}
          className="p-6 space-y-5"
        >
          <Section title="Основные параметры">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Code *"
                name="code"
                defaultValue={plan?.code}
                required
                placeholder="STARTER"
                hint="Уникальный код. Изменить нельзя."
                disabled={isEdit}
              />
              <Field label="Название *" name="name" defaultValue={plan?.name} required placeholder="Стартовый" />
            </div>
            <Field label="Описание" name="description" defaultValue={plan?.description ?? ""} placeholder="Для малых БЦ" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Цена ₸/мес" name="priceMonthly" type="number" defaultValue={plan?.priceMonthly ?? 0} />
              <Field label="Цена ₸/год" name="priceYearly" type="number" defaultValue={plan?.priceYearly ?? 0} />
            </div>
          </Section>

          <Section title="Лимиты (пусто = безлимит)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Макс. зданий" name="maxBuildings" type="number" defaultValue={plan?.maxBuildings ?? ""} />
              <Field label="Макс. арендаторов" name="maxTenants" type="number" defaultValue={plan?.maxTenants ?? ""} />
              <Field label="Макс. пользователей" name="maxUsers" type="number" defaultValue={plan?.maxUsers ?? ""} />
              <Field label="Макс. лидов" name="maxLeads" type="number" defaultValue={plan?.maxLeads ?? ""} />
            </div>
          </Section>

          <Section title="Фичи">
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_KEYS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name={`feature_${f.key}`}
                    defaultChecked={features[f.key]}
                    className="rounded"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Прочее">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Порядок отображения" name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} />
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-6 cursor-pointer">
                <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="rounded" />
                Активен
              </label>
            </div>
          </Section>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm">
              Отмена
            </button>
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-purple-600 hover:bg-purple-700 py-2 text-sm text-white disabled:opacity-60">
              {pending ? "..." : isEdit ? "Сохранить" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function Field({
  label, name, type = "text", defaultValue, required, placeholder, hint, disabled,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number | null
  required?: boolean
  placeholder?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      />
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function parseFeatures(features: string | null): Record<string, boolean> {
  if (!features) return {}
  try {
    return JSON.parse(features)
  } catch {
    return {}
  }
}
