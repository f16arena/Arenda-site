"use client"

import { useState, useTransition } from "react"
import { Plus, X, Edit2, Power, Building2, Layers, ArrowRight } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import {
  createBuilding,
  updateBuildingDetails,
  toggleBuildingActive,
  deleteBuilding,
  switchBuilding,
  createFloor,
  deleteFloor,
} from "@/app/actions/buildings"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DeleteAction } from "@/components/ui/delete-action"
import { formatMoney } from "@/lib/utils"

export function CreateBuildingButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        Добавить здание
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Новое здание
              </h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createBuilding(fd)
                    toast.success("Здание добавлено и выбрано как текущее")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label="Название *" name="name" required placeholder="F16 Plaza" />
              <Field label="Адрес *" name="address" required placeholder="г. Алматы, ул..." />
              <Field label="Описание" name="description" placeholder="Бизнес-центр класса А" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Телефон" name="phone" placeholder="+7..." />
                <Field label="Email" name="email" type="email" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ответственный" name="responsible" />
                <Field label="Общая площадь, м²" name="totalArea" type="number" step="0.1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Префикс договоров</label>
                <input
                  name="contractPrefix"
                  placeholder="F16"
                  maxLength={10}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Используется в номере: {`{префикс}-{год}-{№}`}. Например F16-2026-001. Если пусто — будет сгенерирован из названия.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
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

export function BuildingActions({
  buildingId, isCurrent, isActive, isOwner, building,
}: {
  buildingId: string
  isCurrent: boolean
  isActive: boolean
  isOwner: boolean
  building: {
    name: string
    address: string
    description: string | null
    phone: string | null
    email: string | null
    responsible: string | null
    totalArea: number | null
    contractPrefix: string | null
  }
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      {!isCurrent && isActive && (
        <button
          onClick={() =>
            startTransition(async () => {
              try {
                await switchBuilding(buildingId)
                toast.success("Здание переключено")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Переключиться
        </button>
      )}

      <button
        onClick={() => setEditOpen(true)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-200"
        title="Редактировать"
      >
        <Edit2 className="h-4 w-4" />
      </button>

      {isOwner && (
        <ConfirmDialog
          title={isActive ? "Деактивировать здание?" : "Активировать здание?"}
          description={isActive ? "Здание не будет доступно для переключения." : "Здание снова станет доступным."}
          variant={isActive ? "danger" : "default"}
          confirmLabel={isActive ? "Деактивировать" : "Активировать"}
          onConfirm={() =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                try {
                  await toggleBuildingActive(buildingId, !isActive)
                  toast.success(isActive ? "Деактивировано" : "Активировано")
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Ошибка")
                } finally {
                  resolve()
                }
              })
            })
          }
          trigger={
            <button className={isActive ? "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:text-emerald-200"} title={isActive ? "Деактивировать" : "Активировать"}>
              <Power className="h-4 w-4" />
            </button>
          }
        />
      )}

      {isOwner && (
        <DeleteAction
          action={() => deleteBuilding(buildingId)}
          entity="здание"
          description="Удаление возможно только если на здании нет этажей и помещений."
          successMessage="Здание удалено"
        />
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Редактировать здание</h2>
              <button onClick={() => setEditOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await updateBuildingDetails(buildingId, fd)
                    toast.success("Сохранено")
                    setEditOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label="Название *" name="name" defaultValue={building.name} required />
              <Field label="Адрес *" name="address" defaultValue={building.address} required />
              <Field label="Описание" name="description" defaultValue={building.description ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Телефон" name="phone" defaultValue={building.phone ?? ""} />
                <Field label="Email" name="email" type="email" defaultValue={building.email ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ответственный" name="responsible" defaultValue={building.responsible ?? ""} />
                <Field label="Общая площадь, м²" name="totalArea" type="number" step="0.1" defaultValue={building.totalArea ?? ""} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Префикс договоров</label>
                <input
                  name="contractPrefix"
                  defaultValue={building.contractPrefix ?? ""}
                  placeholder="F16"
                  maxLength={10}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Формат: {`{префикс}-{год}-{№}`} → {building.contractPrefix || "F16"}-{new Date().getFullYear()}-001</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export function FloorsList({
  buildingId, floors, isOwner,
}: {
  buildingId: string
  floors: { id: string; number: number; name: string; ratePerSqm: number; totalArea: number | null; spacesCount: number }[]
  isOwner: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Этажи ({floors.length})
        </p>
        <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          + Добавить этаж
        </button>
      </div>
      {floors.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Нет этажей</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {floors.map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/5 transition-colors group relative">
              <Link
                href={`/admin/spaces#floor-${f.id}`}
                className="block p-3"
                title="Открыть помещения этого этажа"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{f.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatMoney(f.ratePerSqm)}/м² · {f.spacesCount} помещ.
                    </p>
                    {f.totalArea && <p className="text-xs text-slate-400 dark:text-slate-500">{f.totalArea} м²</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>
              </Link>
              {isOwner && (
                <div className="absolute top-2 right-7 opacity-0 group-hover:opacity-100 z-10">
                  <DeleteAction
                    action={() => deleteFloor(f.id, { cascade: f.spacesCount > 0 })}
                    entity={f.spacesCount > 0
                      ? `этаж и ${f.spacesCount} помещ.`
                      : "этаж"}
                    successMessage={f.spacesCount > 0
                      ? `Этаж и ${f.spacesCount} помещ. удалены`
                      : "Этаж удалён"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Новый этаж</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createFloor(buildingId, fd)
                    toast.success("Этаж создан")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Номер *" name="number" type="number" placeholder="1" required />
                <Field label="Название *" name="name" placeholder="1 этаж" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ставка ₸/м²" name="ratePerSqm" type="number" step="0.01" placeholder="2500" />
                <Field label="Площадь м²" name="totalArea" type="number" step="0.1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label, name, type = "text", required, placeholder, defaultValue, step,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string | number | null
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        step={step}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
